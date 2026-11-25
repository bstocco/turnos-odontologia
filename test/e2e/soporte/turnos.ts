import { randomUUID } from 'node:crypto';

import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';

import { crearUsuarioSintetico, type UsuarioSintetico } from './clinica.js';
import type { EntornoE2E } from './entorno.js';
import { pedirComo, type ClinicaConfigurada } from './puesta-en-marcha.js';
import { iniciarSesion, type Sesion } from './sesion.js';

/** Desfase fijo de la zona de la clínica (`America/Argentina/Buenos_Aires`, UTC-3 sin horario de verano). */
const DESFASE_HORAS = 3;

/** Instante UTC (ISO) de una hora local `HH:MM` de un día `AAAA-MM-DD` de la clínica. */
export function instanteLocal(dia: string, hora: string): string {
  const [hh, mm] = hora.split(':').map(Number) as [number, number];
  const base = Date.parse(`${dia}T00:00:00Z`);
  return new Date(base + (hh + DESFASE_HORAS) * 3_600_000 + mm * 60_000).toISOString();
}

export interface CuerpoDeTurno {
  readonly pacienteId: string;
  readonly profesionalId: string;
  readonly sillonId: string;
  readonly prestacionId: string;
  readonly inicio: string;
  readonly duracionMinutos: number;
  readonly bufferMinutos: number;
  readonly origen: 'recepcion';
}

/** Cuerpo válido de `POST /turnos` sobre los recursos de la clínica configurada. */
export function cuerpoDeTurno(
  lista: ClinicaConfigurada,
  inicio: string,
  cambios: Partial<CuerpoDeTurno> = {},
): CuerpoDeTurno {
  return {
    pacienteId: lista.pacienteId,
    profesionalId: lista.profesionalId,
    sillonId: lista.sillonId,
    prestacionId: lista.prestacionId,
    inicio,
    duracionMinutos: 30,
    bufferMinutos: 10,
    origen: 'recepcion',
    ...cambios,
  };
}

/** Recepcionista con sesión real (login) en la clínica configurada. */
export async function sesionDeRecepcion(
  entorno: EntornoE2E,
  lista: ClinicaConfigurada,
): Promise<{ usuario: UsuarioSintetico; sesion: Sesion }> {
  const usuario = await crearUsuarioSintetico(lista.clinica, 'recepcionista');
  const sesion = await iniciarSesion(entorno, lista.clinica.slug, usuario.email, usuario.password);
  return { usuario, sesion };
}

/** Segundo profesional y segundo sillón de la clínica, por la API real. */
export async function recursosAdicionales(
  entorno: EntornoE2E,
  lista: ClinicaConfigurada,
): Promise<{ profesionalId: string; sillonId: string }> {
  const profesional = await pedirComo<{ id: string }>(
    entorno,
    lista.sesion,
    'POST',
    '/api/v1/profesionales',
    201,
    { nombre: 'Segundo', apellido: 'Profesional' },
  );
  await pedirComo(
    entorno,
    lista.sesion,
    'PUT',
    `/api/v1/profesionales/${profesional.id}/horarios`,
    200,
    {
      franjas: [1, 2, 3, 4, 5].map((diaSemana) => ({
        diaSemana,
        horaDesde: '09:00',
        horaHasta: '13:00',
      })),
    },
  );
  const sillon = await pedirComo<{ id: string }>(
    entorno,
    lista.sesion,
    'POST',
    '/api/v1/sillones',
    201,
    {
      nombre: 'Sillón 2',
      bufferMinutos: 10,
    },
  );
  return { profesionalId: profesional.id, sillonId: sillon.id };
}

/** Turno insertado por fixture (como `app`, con `withTenant`) para estados que la API aún no permite crear. */
export async function insertarTurnoPorFixture(
  clinicaId: string,
  lista: ClinicaConfigurada,
  opciones: {
    inicio: Date;
    estado: 'confirmado' | 'pendiente_confirmacion' | 'ausente' | 'atendido';
  },
): Promise<string> {
  const id = randomUUID();
  await withTenant(clinicaId, (cliente) =>
    cliente.query(
      `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                          inicio, fin, buffer_minutos, fin_sillon, estado, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $8, $9, 'recepcion')`,
      [
        id,
        clinicaId,
        lista.pacienteId,
        lista.profesionalId,
        lista.sillonId,
        lista.prestacionId,
        opciones.inicio,
        new Date(opciones.inicio.getTime() + 30 * 60_000),
        opciones.estado,
      ],
    ),
  );
  return id;
}

/**
 * Guarda del defecto F6 (C-12): con sesión válida, `POST /turnos` responde 401 porque el módulo no
 * registra la autenticación. Es una prueba normal: cuando C-12 lo corrija, falla y obliga a quitar
 * las marcas `it.fails` de los flujos que dependen de turnos, agenda y bloqueos.
 */
export async function afirmarDefectoF6(entorno: EntornoE2E, sesion: Sesion): Promise<void> {
  const respuesta = await entorno.inject({
    method: 'GET',
    url: `/api/v1/turnos/${randomUUID()}`,
    headers: sesion.encabezados,
  });
  if (respuesta.statusCode !== 401) {
    throw new Error(
      `F6 ya no se reproduce (estado ${respuesta.statusCode}): quitar las marcas it.fails de C-12.`,
    );
  }
}

/** Bloqueo insertado por fixture: aísla otros flujos de los defectos de `POST /bloqueos`. */
export async function insertarBloqueoPorFixture(
  clinicaId: string,
  profesionalId: string,
  creadoPor: string,
  inicioIso: string,
  finIso: string,
): Promise<string> {
  const id = randomUUID();
  await withTenant(clinicaId, (cliente) =>
    cliente.query(
      `INSERT INTO bloqueo (id, clinica_id, profesional_id, inicio, fin, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, clinicaId, profesionalId, new Date(inicioIso), new Date(finIso), creadoPor],
    ),
  );
  return id;
}
