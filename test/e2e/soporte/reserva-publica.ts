import { randomUUID } from 'node:crypto';

import type { LightMyRequestResponse } from 'fastify';
import type { PgBoss } from 'pg-boss';

import {
  crearNotificacionService,
  crearResolvedorContenidoTurno,
  type LoggerNotificaciones,
} from '../../../src/application/notificaciones/index.js';
import { crearProveedorEnlacesTurnoPg } from '../../../src/infrastructure/db/repositories/reserva-publica/index.js';
import {
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
  crearWorkerNotificaciones,
  type WorkerNotificaciones,
} from '../../../src/infrastructure/queue/index.js';
import { configDeBaseDePrueba, consultarComoMigra } from '../../support/base-de-datos.js';

import {
  pacienteSintetico,
  semillaNueva,
  type PacienteSinteticoDatos,
} from './datos-sinteticos.js';
import { emailFalso } from './email-falso.js';
import type { EntornoE2E } from './entorno.js';
import type { ClinicaConfigurada } from './puesta-en-marcha.js';

/*
 * Soporte de los flujos de reserva pública (C-15). El único doble es el PROVEEDOR de email: el
 * archivo de prueba reemplaza `crearEmailSenderSmtp` por este adaptador en memoria (vi.mock); la
 * app, la base y la cola son reales. Los códigos y tokens se leen del email simulado y jamás se
 * escriben en archivos ni en mensajes de error.
 */

export { emailFalso };

export const URL_PUBLICA = 'https://turnos.ejemplo.invalid';

/** Variables de entorno de la app necesarias para que emita enlaces; valores descartables. */
export function configurarEntornoDeReservaPublica(): void {
  process.env.PUBLIC_BASE_URL = URL_PUBLICA;
  process.env.EMAIL_API_KEY = `descartable-${randomUUID()}`;
  process.env.EMAIL_FROM = 'turnos@ejemplo.invalid';
}

function mensajesPara(email: string, asuntoContiene?: string) {
  return emailFalso.enviados.filter(
    (m) => m.para === email && (asuntoContiene === undefined || m.asunto.includes(asuntoContiene)),
  );
}

/** Código de 6 dígitos del último email de verificación enviado a `email`. */
export function codigoEnviadoA(email: string): string {
  const mensajes = mensajesPara(email).filter((m) => /\b\d{6}\b/.test(m.texto));
  const ultimo = mensajes.at(-1);
  const coincidencia = ultimo === undefined ? null : /\b(\d{6})\b/.exec(ultimo.texto);
  if (coincidencia?.[1] === undefined) throw new Error('No se envió ningún código a ese email.');
  return coincidencia[1];
}

/** Código de 6 dígitos que seguro NO es el vigente. */
export function codigoErroneoDistintoDe(codigo: string): string {
  return codigo === '000000' ? '000001' : '000000';
}

export function solicitarCodigo(
  entorno: EntornoE2E,
  slug: string,
  email: string,
  ip?: string,
): Promise<LightMyRequestResponse> {
  return entorno.inject({
    method: 'POST',
    url: `/api/v1/publico/${slug}/codigo`,
    payload: { email },
    ...(ip === undefined ? {} : { ip }),
  });
}

export interface CuerpoDeReserva {
  readonly profesionalId: string;
  readonly prestacionId: string;
  readonly inicio: string;
  readonly codigoVerificacion: string;
  readonly paciente: {
    readonly nombre: string;
    readonly apellido: string;
    readonly dni: string;
    readonly telefono: string;
    readonly email: string;
    readonly obraSocial: string;
  };
}

export function cuerpoDeReserva(
  lista: Pick<ClinicaConfigurada, 'profesionalId' | 'prestacionId'>,
  inicio: string,
  codigoVerificacion: string,
  paciente: PacienteSinteticoDatos,
): CuerpoDeReserva {
  return {
    profesionalId: lista.profesionalId,
    prestacionId: lista.prestacionId,
    inicio,
    codigoVerificacion,
    paciente: {
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
      email: paciente.email,
      obraSocial: paciente.obraSocial,
    },
  };
}

export function reservar(
  entorno: EntornoE2E,
  slug: string,
  cuerpo: CuerpoDeReserva,
  ip?: string,
): Promise<LightMyRequestResponse> {
  return entorno.inject({
    method: 'POST',
    url: `/api/v1/publico/${slug}/reservas`,
    payload: cuerpo,
    ...(ip === undefined ? {} : { ip }),
  });
}

/** Paciente sintético nuevo (DNI, teléfono y email propios). */
export function pacienteNuevo(): PacienteSinteticoDatos {
  return pacienteSintetico(semillaNueva());
}

/** Pide el código por la API y lo lee del email simulado. */
export async function obtenerCodigo(
  entorno: EntornoE2E,
  slug: string,
  email: string,
): Promise<string> {
  const respuesta = await solicitarCodigo(entorno, slug, email);
  if (respuesta.statusCode !== 202) {
    throw new Error(`La solicitud de código respondió ${respuesta.statusCode} (se esperaba 202).`);
  }
  return codigoEnviadoA(email);
}

export interface Hueco {
  readonly inicio: string;
  readonly fin: string;
}

/** Huecos públicos de un día de la clínica, por la API real. */
export async function huecosDelDia(
  entorno: EntornoE2E,
  slug: string,
  lista: Pick<ClinicaConfigurada, 'profesionalId' | 'prestacionId'>,
  desde: string,
  hasta: string,
): Promise<readonly Hueco[]> {
  const consulta = new URLSearchParams({
    profesionalId: lista.profesionalId,
    prestacionId: lista.prestacionId,
    desde,
    hasta,
  });
  const respuesta = await entorno.inject({
    method: 'GET',
    url: `/api/v1/publico/${slug}/disponibilidad?${consulta.toString()}`,
  });
  if (respuesta.statusCode !== 200) {
    throw new Error(`La disponibilidad respondió ${respuesta.statusCode} (se esperaba 200).`);
  }
  return (respuesta.json() as { huecos: Hueco[] }).huecos;
}

export interface EnlacesDeAccion {
  readonly confirmar?: string;
  readonly cancelar?: string;
}

/** Tokens de los enlaces del último email con enlaces enviado a `email` (null si aún no llegó). */
export function enlacesEnviadosA(email: string): EnlacesDeAccion | null {
  for (const mensaje of mensajesPara(email).toReversed()) {
    const encontrados = [
      ...mensaje.texto.matchAll(/https?:\/\/\S+\/publico\/turnos\/accion\?\S+/g),
    ];
    if (encontrados.length === 0) continue;
    const enlaces: { confirmar?: string; cancelar?: string } = {};
    for (const [enlace] of encontrados) {
      const url = new URL(enlace);
      const token = url.searchParams.get('token');
      const accion = url.searchParams.get('accion');
      if (token === null) continue;
      if (accion === 'confirmar') enlaces.confirmar = token;
      if (accion === 'cancelar') enlaces.cancelar = token;
    }
    return enlaces;
  }
  return null;
}

export async function esperarEnlaces(email: string, timeoutMs = 25_000): Promise<EnlacesDeAccion> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const enlaces = enlacesEnviadosA(email);
    if (enlaces !== null) return enlaces;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Tiempo de espera agotado esperando el email con los enlaces.');
}

export interface WorkerDeCorreos {
  readonly logs: string[];
  detener(): Promise<void>;
}

/**
 * Worker real de notificaciones (pg-boss sobre PostgreSQL) con el email simulado y el proveedor de
 * enlaces real: es quien arma el email con los enlaces de un solo uso que encola la API.
 */
export async function iniciarWorkerDeCorreos(): Promise<WorkerDeCorreos> {
  const config = configDeBaseDePrueba();
  await consultarComoMigra(
    config.testDatabaseMigrationUrl as string,
    `DO $$ BEGIN
       IF to_regclass('pgboss.job') IS NOT NULL THEN DELETE FROM pgboss.job; END IF;
     END $$;`,
  );
  const logs: string[] = [];
  const registrar = (datos: unknown, mensaje: string): void => {
    logs.push(JSON.stringify({ datos, mensaje }));
  };
  const logger: LoggerNotificaciones = { info: registrar, warn: registrar, error: registrar };
  const reloj = { ahora: () => new Date() };
  const boss: PgBoss = crearPgBossApp({
    connectionString: config.testDatabaseUrl as string,
    schedule: false,
  });
  const cola = await crearColaNotificacionesPgBoss(boss);
  const servicio = crearNotificacionService({
    ejecutorTenant: crearEjecutorTenantNotificaciones(),
    cola,
    emailSender: emailFalso,
    resolvedor: crearResolvedorContenidoTurno({
      lector: crearLectorDatosTurnoPg(),
      reloj,
      proveedorEnlaces: crearProveedorEnlacesTurnoPg({ publicBaseUrl: URL_PUBLICA, reloj }),
    }),
    reloj,
    logger,
  });
  const worker: WorkerNotificaciones = crearWorkerNotificaciones({
    boss,
    servicio,
    logger,
    pollingIntervalSeconds: 0.5,
  });
  await worker.iniciar();
  return {
    logs,
    async detener(): Promise<void> {
      await worker.detener();
      await boss.stop({ graceful: false });
    },
  };
}
