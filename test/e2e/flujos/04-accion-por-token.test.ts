import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { emitirTokenAccion } from '../../../src/domain/comunicacion/index.js';
import { cryptoComunicacion, hashSha256 } from '../../../src/infrastructure/crypto/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { configDeBaseDePrueba, consultarComoMigra } from '../../support/base-de-datos.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { sumarDias } from '../soporte/fechas.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import {
  pedirComo,
  ponerEnMarchaUnaClinica,
  type ClinicaConfigurada,
} from '../soporte/puesta-en-marcha.js';
import {
  configurarEntornoDeReservaPublica,
  cuerpoDeReserva,
  esperarEnlaces,
  huecosDelDia,
  iniciarWorkerDeCorreos,
  obtenerCodigo,
  pacienteNuevo,
  reservar,
  type Hueco,
  type WorkerDeCorreos,
} from '../soporte/reserva-publica.js';
import { insertarTurnoPorFixture } from '../soporte/turnos.js';

/*
 * Flujo 4 de 07_flujos_principales.md: confirmación y cancelación por enlace de un solo uso (C-15).
 *
 * Los enlaces reales salen del email que arma el worker tras una reserva pública (proveedor de
 * email simulado; todo lo demás real). Los casos de vencimiento y de menos de 24 h usan un token
 * emitido por la misma función de dominio e insertado por fixture, porque el reloj de la app no se
 * simula en los e2e. Ningún token figura en archivos: se leen del email o se generan al vuelo.
 */
vi.mock('../../../src/infrastructure/email/index.js', async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import('../../../src/infrastructure/email/index.js')>();
  const { emailFalso: falso } = await import('../soporte/email-falso.js');
  return { ...original, crearEmailSenderSmtp: () => falso };
});

const ACCION = '/api/v1/publico/turnos/accion';

interface RespuestaDeAccion {
  readonly turnoId: string;
  readonly accion: 'confirmar' | 'cancelar';
  readonly estado: string;
  readonly inicio: string;
  readonly fin: string;
}

describe('Flujo 4: confirmación y cancelación por token', () => {
  let entorno: EntornoE2E;
  let worker: WorkerDeCorreos;
  let urlMigra: string;

  beforeAll(async () => {
    configurarEntornoDeReservaPublica();
    urlMigra = configDeBaseDePrueba().testDatabaseMigrationUrl as string;
    entorno = await abrirEntorno();
    worker = await iniciarWorkerDeCorreos();
  });

  afterAll(async () => {
    await worker.detener();
    await entorno.cerrar();
  });

  function accionar(token: string, accion?: 'confirmar' | 'cancelar') {
    return entorno.inject({
      method: 'POST',
      url: ACCION,
      payload: accion === undefined ? { token } : { token, accion },
    });
  }

  /** Reserva pública real sobre una clínica nueva que exige confirmación; devuelve los enlaces. */
  async function reservaPendiente() {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'accion-token');
    await pedirComo(entorno, lista.sesion, 'PATCH', '/api/v1/clinica', 200, {
      reservaRequiereConfirmacion: true,
    });
    const huecos = await huecosDelDia(
      entorno,
      lista.clinica.slug,
      lista,
      lista.diaConHuecos,
      sumarDias(lista.diaConHuecos, 1),
    );
    const paciente = pacienteNuevo();
    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
    const respuesta = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[0]!.inicio, codigo, paciente),
    );
    expect(respuesta.statusCode).toBe(201);
    const { turnoId } = respuesta.json() as { turnoId: string };
    const enlaces = await esperarEnlaces(paciente.email);
    if (enlaces.confirmar === undefined || enlaces.cancelar === undefined) {
      throw new Error('El email de una reserva pendiente debe traer ambos enlaces.');
    }
    return {
      lista,
      huecos,
      paciente,
      codigo,
      turnoId,
      confirmar: enlaces.confirmar,
      cancelar: enlaces.cancelar,
    };
  }

  async function insertarToken(
    lista: ClinicaConfigurada,
    turnoId: string,
    proposito: 'confirmar' | 'cancelar',
    venceEn: Date,
  ): Promise<string> {
    const emitido = emitirTokenAccion({ proposito, ahora: new Date(), crypto: cryptoComunicacion });
    await withTenant(lista.clinica.id, (cliente) =>
      cliente.query(
        `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), lista.clinica.id, turnoId, proposito, emitido.hashToken, venceEn],
      ),
    );
    return emitido.token;
  }

  async function estadoDelTurno(lista: ClinicaConfigurada, turnoId: string): Promise<string> {
    return withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query<{ estado: string }>(
        'SELECT estado FROM turno WHERE id = $1',
        [turnoId],
      );
      return rows[0]?.estado ?? '';
    });
  }

  async function tokenUsado(lista: ClinicaConfigurada, token: string): Promise<boolean> {
    return withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query<{ usado_en: Date | null }>(
        'SELECT usado_en FROM token_accion WHERE hash_token = $1',
        [hashSha256(token)],
      );
      return rows[0]?.usado_en != null;
    });
  }

  it('confirma por enlace (200), el token queda gastado y se audita al paciente por enlace; luego cancela y el hueco vuelve a ofrecerse', async () => {
    const r = await reservaPendiente();

    const confirmada = await accionar(r.confirmar, 'confirmar');
    expect(confirmada.statusCode).toBe(200);
    expect(confirmada.headers['cache-control']).toBe('no-store');
    const cuerpo = confirmada.json() as RespuestaDeAccion;
    expect(cuerpo).toMatchObject({ turnoId: r.turnoId, accion: 'confirmar', estado: 'confirmado' });
    expect(Object.keys(cuerpo).sort()).toEqual(['accion', 'estado', 'fin', 'inicio', 'turnoId']);
    expect(await estadoDelTurno(r.lista, r.turnoId)).toBe('confirmado');
    expect(await tokenUsado(r.lista, r.confirmar)).toBe(true);

    // Auditoría de la acción bajo el actor "paciente por enlace".
    const auditoria = await withTenant(r.lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query<{ actor_tipo: string; accion: string }>(
        `SELECT actor_tipo, accion FROM auditoria
         WHERE entidad = 'turno' AND entidad_id = $1 ORDER BY id`,
        [r.turnoId],
      );
      return rows;
    });
    expect(auditoria).toContainEqual({ actor_tipo: 'paciente_enlace', accion: 'confirmacion' });

    // El mismo enlace no se puede reusar.
    const reuso = await accionar(r.confirmar);
    expect(reuso.statusCode).toBe(404);
    expect((reuso.json() as { codigo: string }).codigo).toBe('TOKEN_ACCION_INVALIDO');

    // Con más de 24 h de anticipación la cancelación se acepta y libera el hueco.
    const cancelada = await accionar(r.cancelar, 'cancelar');
    expect(cancelada.statusCode).toBe(200);
    expect(cancelada.json()).toMatchObject({ turnoId: r.turnoId, estado: 'cancelado' });
    const ofrecidos = await huecosDelDia(
      entorno,
      r.lista.clinica.slug,
      r.lista,
      r.lista.diaConHuecos,
      sumarDias(r.lista.diaConHuecos, 1),
    );
    expect(ofrecidos.map((h: Hueco) => h.inicio)).toContain(r.huecos[0]!.inicio);

    // Privacidad: ni datos del paciente, ni código, ni tokens en logs ni en la cola.
    const secretos = {
      ...valoresSensibles(r.paciente),
      codigo: r.codigo,
      tokenConfirmar: r.confirmar,
      tokenCancelar: r.cancelar,
    };
    afirmarSinDatosPersonales(entorno.logs, secretos);
    afirmarSinDatosPersonales({ texto: () => worker.logs.join('\n') }, secretos);
    const cola = JSON.stringify(await consultarComoMigra(urlMigra, 'SELECT data FROM pgboss.job'));
    for (const [campo, valor] of Object.entries(secretos)) {
      expect(cola.includes(valor), `la cola contiene ${campo}`).toBe(false);
    }
    expect(confirmada.body + cancelada.body).not.toContain(r.paciente.dni);
  }, 90_000);

  it('todo rechazo es el mismo 404 TOKEN_ACCION_INVALIDO: inexistente, gastado, de otro propósito o vencido', async () => {
    const r = await reservaPendiente();

    const inexistente = await accionar(`${randomUUID()}${randomUUID()}`);
    expect(inexistente.statusCode).toBe(404);

    // Un token de confirmar usado para cancelar es de propósito cruzado.
    const cruzado = await accionar(r.confirmar, 'cancelar');
    // Un token vencido (emitido por fixture, con vencimiento ya pasado).
    const vencido = await accionar(
      await insertarToken(r.lista, r.turnoId, 'confirmar', new Date(Date.now() - 60_000)),
    );
    // Un token gastado.
    expect((await accionar(r.cancelar, 'cancelar')).statusCode).toBe(200);
    const gastado = await accionar(r.cancelar, 'cancelar');

    for (const rechazo of [cruzado, vencido, gastado]) {
      expect(rechazo.statusCode).toBe(404);
      expect(rechazo.body).toBe(inexistente.body);
    }
    expect(inexistente.json()).toMatchObject({ codigo: 'TOKEN_ACCION_INVALIDO' });
    // El rechazo por propósito cruzado no gastó el token legítimo.
    expect(await tokenUsado(r.lista, r.confirmar)).toBe(false);
  }, 90_000);

  it('el token de una clínica inactiva se rechaza igual que uno inexistente', async () => {
    const r = await reservaPendiente();
    const inexistente = await accionar(`${randomUUID()}${randomUUID()}`);
    await consultarComoMigra(urlMigra, 'UPDATE clinica SET activa = false WHERE id = $1', [
      r.lista.clinica.id,
    ]);
    try {
      const respuesta = await accionar(r.confirmar, 'confirmar');
      expect(respuesta.statusCode).toBe(404);
      expect(respuesta.body).toBe(inexistente.body);
    } finally {
      await consultarComoMigra(urlMigra, 'UPDATE clinica SET activa = true WHERE id = $1', [
        r.lista.clinica.id,
      ]);
    }
  }, 90_000);

  it('cancelar con menos de 24 h responde 409 CANCELACION_FUERA_DE_PLAZO sin gastar el token', async () => {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'accion-plazo');
    const turnoId = await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: new Date(Date.now() + 2 * 3_600_000),
      estado: 'confirmado',
    });
    const token = await insertarToken(
      lista,
      turnoId,
      'cancelar',
      new Date(Date.now() + 2 * 3_600_000),
    );

    for (let intento = 0; intento < 2; intento += 1) {
      const tarde = await accionar(token, 'cancelar');
      expect(tarde.statusCode).toBe(409);
      expect((tarde.json() as { codigo: string }).codigo).toBe('CANCELACION_FUERA_DE_PLAZO');
      expect((tarde.json() as { mensaje: string }).mensaje).toContain('clínica');
    }
    expect(await estadoDelTurno(lista, turnoId)).toBe('confirmado');
    expect(await tokenUsado(lista, token)).toBe(false);
  }, 60_000);

  it('confirmar un turno ya cancelado por la clínica responde 422 TRANSICION_TURNO_INVALIDA', async () => {
    const r = await reservaPendiente();
    await withTenant(r.lista.clinica.id, (cliente) =>
      cliente.query(`UPDATE turno SET estado = 'cancelado' WHERE id = $1`, [r.turnoId]),
    );
    const respuesta = await accionar(r.confirmar, 'confirmar');
    expect(respuesta.statusCode).toBe(422);
    expect((respuesta.json() as { codigo: string }).codigo).toBe('TRANSICION_TURNO_INVALIDA');
    expect(await estadoDelTurno(r.lista, r.turnoId)).toBe('cancelado');
  }, 60_000);

  it('dos pedidos simultáneos con el mismo token: exactamente uno ejecuta la acción y el otro recibe 404', async () => {
    const r = await reservaPendiente();
    const [a, b] = await Promise.all([
      accionar(r.confirmar, 'confirmar'),
      accionar(r.confirmar, 'confirmar'),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 404]);
    const perdedor = a.statusCode === 404 ? a : b;
    expect((perdedor.json() as { codigo: string }).codigo).toBe('TOKEN_ACCION_INVALIDO');
    expect(await estadoDelTurno(r.lista, r.turnoId)).toBe('confirmado');
  }, 60_000);

  it('el enlace no depende de la sesión del personal: se ignora cualquier Authorization', async () => {
    const r = await reservaPendiente();
    const respuesta = await entorno.inject({
      method: 'POST',
      url: ACCION,
      headers: r.lista.sesion.encabezados,
      payload: { token: r.confirmar, accion: 'confirmar' },
    });
    expect(respuesta.statusCode).toBe(200);
  }, 60_000);
});
