import { randomUUID } from 'node:crypto';

import Fastify, { LogController, type FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { crearLogger } from '../../../src/infrastructure/logging/logger.js';
import { emitirTokenAccion } from '../../../src/domain/comunicacion/index.js';
import type { EventoDeTurno } from '../../../src/domain/turno/index.js';
import { cryptoComunicacion, hashSha256 } from '../../../src/infrastructure/crypto/index.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/index.js';
import { registrarManejoDeErrores } from '../../../src/interfaces/http/errores.js';
import { crearModuloPublico } from '../../../src/interfaces/http/modules/publico-disponibilidad/index.js';
import {
  crearModuloPublicoReservas,
  type OpcionesModuloPublicoReservas,
} from '../../../src/interfaces/http/modules/publico-reservas/index.js';
import { appDePrueba, capturarLogs, configDePrueba } from '../../support/app-de-prueba.js';

import {
  CLINICA_A,
  CLINICA_B,
  SLUG_INACTIVA,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  crearClinicaInactiva,
  crearTurnoMinimo,
  limpiarTablasReservaPublica,
  prepararBaseReservaPublica,
  type EntornoReservaPublica,
} from './soporte.js';

let entorno: EntornoReservaPublica;

beforeAll(async () => {
  entorno = await prepararBaseReservaPublica();
});

beforeEach(async () => {
  await limpiarTablasReservaPublica(entorno.urlMigra);
});

afterAll(async () => {
  await cerrarPool();
});

async function sembrarClinicaParaApi(
  opts: {
    readonly clinicaId?: string;
    readonly requiereConfirmacion?: boolean;
    readonly anticipacionHoras?: number;
  } = {},
) {
  const clinicaId = opts.clinicaId ?? CLINICA_A.id;
  const profesionalId = randomUUID();
  const prestacionId = randomUUID();
  const sillonId = randomUUID();

  await comoApp(clinicaId, async (c) => {
    await c.query(
      `UPDATE clinica_config
       SET reserva_requiere_confirmacion = $2,
           cancelacion_anticipacion_horas = $3
       WHERE clinica_id = $1`,
      [clinicaId, opts.requiereConfirmacion ?? true, opts.anticipacionHoras ?? 24],
    );
    await c.query(
      `INSERT INTO profesional (id, clinica_id, nombre, apellido, activo)
       VALUES ($1, $2, 'Laura', 'Odonto', TRUE)`,
      [profesionalId, clinicaId],
    );
    for (let dia = 0; dia <= 6; dia++) {
      await c.query(
        `INSERT INTO horario_atencion (id, clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
         VALUES (gen_random_uuid(), $1, $2, $3, '09:00', '18:00')`,
        [clinicaId, profesionalId, dia],
      );
    }
    await c.query(
      `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos, activa)
       VALUES ($1, $2, 'Consulta inicial', 30, TRUE)`,
      [prestacionId, clinicaId],
    );
    await c.query(
      `INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos, activo)
       VALUES ($1, $2, 'Sillón 1', 0, TRUE)`,
      [sillonId, clinicaId],
    );
  });

  return { clinicaId, profesionalId, prestacionId, sillonId };
}

async function construirAppHttp(opciones: OpcionesModuloPublicoReservas = {}) {
  const logs = capturarLogs();
  const app = Fastify({
    loggerInstance: crearLogger(configDePrueba(), logs.destino) as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true, requestIdLogLabel: 'reqId' }),
    genReqId: () => randomUUID(),
  });
  registrarManejoDeErrores(app);
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        metodo: request.method,
        ruta: request.url.split('?')[0],
        estado: reply.statusCode,
        duracionMs: Math.round(reply.elapsedTime),
      },
      'acceso',
    );
  });
  await app.register(crearModuloPublico({ cache: 100 }), { prefix: '/api/v1' });
  await app.register(crearModuloPublicoReservas(opciones), { prefix: '/api/v1' });
  await app.ready();
  return { app, logs };
}

describe('C-15 API HTTP: reserva pública OTP y acciones por token (Flujos 3 y 4)', () => {
  it('auto-registra el módulo publico-reservas en buildApp sin exigir EMAIL_API_KEY al arrancar', async () => {
    const { app } = await appDePrueba();
    await app.ready();
    try {
      const rCodigo = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/slug-que-no-existe/codigo',
        payload: { email: 'test@ejemplo.test' },
      });
      expect(rCodigo.statusCode).toBe(404);
      expect(rCodigo.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });

      const rAccion = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        payload: { token: 'token-inexistente' },
      });
      expect(rAccion.statusCode).toBe(404);
      expect(rAccion.json()).toMatchObject({ codigo: 'TOKEN_ACCION_INVALIDO' });
    } finally {
      await app.close();
    }
  });

  it('Flujo 3 y 4 completos: código OTP → reserva → confirmación → cancelación >= 24h libera disponibilidad, sin PII en respuestas ni logs', async () => {
    let ahora = new Date('2026-12-10T12:00:00.000Z');
    const inicio = new Date('2026-12-11T15:00:00.000Z'); // 12:00 ART
    const { profesionalId, prestacionId } = await sembrarClinicaParaApi({
      requiereConfirmacion: true,
      anticipacionHoras: 24,
    });
    const emailFalso = crearEmailSenderFalso();
    const eventos: EventoDeTurno[] = [];

    const { app, logs } = await construirAppHttp({
      emailSender: emailFalso,
      reloj: { ahora: () => ahora },
      limiteIp: '100/min',
      limiteEmailCodigo: { maximo: 20, ventanaMs: 60_000 },
      limiteEmailReserva: { maximo: 20, ventanaMs: 60_000 },
      publicadorParaClinica: () => ({
        async publicar(e) {
          eventos.push(e);
        },
      }),
    });

    try {
      // 1. Solicitar OTP
      const emailPaciente = 'Mariana.PII@Ejemplo.Test';
      const resCodigo = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
        headers: { authorization: 'Bearer token-basura-ignorado' },
        payload: { email: emailPaciente },
      });
      expect(resCodigo.statusCode).toBe(202);
      expect(resCodigo.headers['cache-control']).toBe('no-store');
      expect(resCodigo.json()).toEqual({ enviado: true, vigenciaMinutos: 10 });

      const codigoClaro = /\b(\d{6})\b/.exec(emailFalso.enviados[0]!.texto)![1]!;

      // 2. Reservar turno
      const resReserva = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/reservas`,
        payload: {
          profesionalId,
          prestacionId,
          inicio: inicio.toISOString(),
          codigoVerificacion: codigoClaro,
          paciente: {
            nombre: 'Mariana',
            apellido: 'Sensible',
            dni: '35.777.888',
            telefono: '011 15-7777-8888',
            email: emailPaciente,
            obraSocial: 'Swiss Medical',
          },
        },
      });
      expect(resReserva.statusCode).toBe(201);
      expect(resReserva.headers['cache-control']).toBe('no-store');
      const cuerpoReserva = resReserva.json() as Record<string, unknown>;
      expect(Object.keys(cuerpoReserva).sort()).toEqual([
        'estado',
        'fin',
        'inicio',
        'prestacionId',
        'profesionalId',
        'turnoId',
        'zonaHoraria',
      ]);
      expect(cuerpoReserva['estado']).toBe('pendiente_confirmacion');
      expect(cuerpoReserva['sillonId']).toBeUndefined();

      const turnoId = cuerpoReserva['turnoId'] as string;

      // 3. Emitir tokens reales de confirmar y cancelar en DB
      const tokConf = emitirTokenAccion({
        proposito: 'confirmar',
        ahora,
        crypto: cryptoComunicacion,
      });
      const tokCanc = emitirTokenAccion({
        proposito: 'cancelar',
        ahora,
        crypto: cryptoComunicacion,
      });
      await comoApp(CLINICA_A.id, async (c) => {
        await c.query(
          `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
           VALUES ($1, $2, $3, 'confirmar', $4, $5),
                  ($6, $2, $3, 'cancelar', $7, $8)`,
          [
            randomUUID(),
            CLINICA_A.id,
            turnoId,
            tokConf.hashToken,
            inicio,
            randomUUID(),
            tokCanc.hashToken,
            inicio,
          ],
        );
      });

      // 4. Confirmar por token
      const resConf = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        payload: { token: tokConf.token, accion: 'confirmar' },
      });
      expect(resConf.statusCode).toBe(200);
      expect(resConf.headers['cache-control']).toBe('no-store');
      expect(resConf.json()).toMatchObject({
        turnoId,
        accion: 'confirmar',
        estado: 'confirmado',
      });

      // Reutilizar el token de confirmación → 404 TOKEN_ACCION_INVALIDO
      const resReuso = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        payload: { token: tokConf.token },
      });
      expect(resReuso.statusCode).toBe(404);
      expect(resReuso.json()).toMatchObject({ codigo: 'TOKEN_ACCION_INVALIDO' });

      // 5. Intentar cancelar con 23h59m de anticipación → 409 sin quemar token
      ahora = new Date(inicio.getTime() - 24 * 3_600_000 + 60_000);
      const resTarde = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        payload: { token: tokCanc.token, accion: 'cancelar' },
      });
      expect(resTarde.statusCode).toBe(409);
      expect(resTarde.json()).toMatchObject({ codigo: 'CANCELACION_FUERA_DE_PLAZO' });
      expect((resTarde.json() as { mensaje: string }).mensaje).toContain('contactá a la clínica');

      // 6. Cancelar exactamente a las 24h00m00s → 200 y el hueco vuelve a disponibilidad
      ahora = new Date(inicio.getTime() - 24 * 3_600_000);
      const resCanc = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        payload: { token: tokCanc.token, accion: 'cancelar' },
      });
      expect(resCanc.statusCode).toBe(200);
      expect(resCanc.json()).toMatchObject({
        turnoId,
        accion: 'cancelar',
        estado: 'cancelado',
      });

      const resDisp = await app.inject({
        method: 'GET',
        url: `/api/v1/publico/${CLINICA_A.slug}/disponibilidad?profesionalId=${profesionalId}&prestacionId=${prestacionId}&desde=2026-12-11&hasta=2026-12-12`,
      });
      expect(resDisp.statusCode).toBe(200);
      const huecos = (resDisp.json() as { huecos: { inicio: string }[] }).huecos;
      expect(huecos.some((h) => h.inicio === inicio.toISOString())).toBe(true);

      // Auditoría registrada bajo actor_tipo = paciente_enlace
      const auditorias = await comoApp(CLINICA_A.id, (c) =>
        c
          .query<{ actor_tipo: string; accion: string; entidad: string }>(
            'SELECT actor_tipo, accion, entidad FROM auditoria ORDER BY id',
          )
          .then((r) => r.rows),
      );
      expect(auditorias).toEqual([
        { actor_tipo: 'paciente_enlace', accion: 'creacion', entidad: 'paciente' },
        { actor_tipo: 'paciente_enlace', accion: 'creacion', entidad: 'turno' },
        { actor_tipo: 'paciente_enlace', accion: 'confirmacion', entidad: 'turno' },
        { actor_tipo: 'paciente_enlace', accion: 'cancelacion', entidad: 'turno' },
      ]);

      expect(eventos).toEqual([
        { tipo: 'creado', turnoId },
        { tipo: 'confirmado', turnoId },
        { tipo: 'cancelado', turnoId },
      ]);

      // Cero PII ni códigos en logs capturados
      const textoLogs = logs.texto();
      expect(textoLogs).not.toContain('35777888');
      expect(textoLogs).not.toContain('35.777.888');
      expect(textoLogs).not.toContain('mariana.pii@ejemplo.test');
      expect(textoLogs).not.toContain(codigoClaro);
      expect(textoLogs).not.toContain(tokConf.token);
      expect(textoLogs).not.toContain(tokCanc.token);
    } finally {
      await app.close();
    }
  });

  it('reutiliza paciente existente por DNI sin sobrescribir ni exponer datos (Q4) y completa email solo si era null', async () => {
    const ahora = new Date('2026-12-10T12:00:00.000Z');
    const inicio = new Date('2026-12-11T15:00:00.000Z');
    const { profesionalId, prestacionId } = await sembrarClinicaParaApi({
      requiereConfirmacion: false,
    });

    const pacienteIdExistente = randomUUID();
    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono, email, obra_social)
         VALUES ($1, $2, 'OriginalNombre', 'OriginalApellido', '36123456', '+5491199990000', NULL, 'Galeno')`,
        [pacienteIdExistente, CLINICA_A.id],
      ),
    );

    const emailFalso = crearEmailSenderFalso();
    const { app } = await construirAppHttp({
      emailSender: emailFalso,
      reloj: { ahora: () => ahora },
      limiteIp: '100/min',
    });

    try {
      await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
        payload: { email: 'nuevo.correo@ejemplo.test' },
      });
      const codigo = /\b(\d{6})\b/.exec(emailFalso.enviados[0]!.texto)![1]!;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/reservas`,
        payload: {
          profesionalId,
          prestacionId,
          inicio: inicio.toISOString(),
          codigoVerificacion: codigo,
          paciente: {
            nombre: 'OtroNombre',
            apellido: 'OtroApellido',
            dni: '36123456',
            telefono: '1122223333',
            email: 'nuevo.correo@ejemplo.test',
            obraSocial: 'OtraObra',
          },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ estado: 'confirmado' });
      expect(JSON.stringify(res.json())).not.toContain('OriginalNombre');
      expect(JSON.stringify(res.json())).not.toContain('36123456');

      const pacDb = await comoApp(CLINICA_A.id, (c) =>
        c
          .query<{
            id: string;
            nombre: string;
            apellido: string;
            telefono: string;
            email: string | null;
            obra_social: string | null;
          }>(
            'SELECT id, nombre, apellido, telefono, email, obra_social FROM paciente WHERE id = $1',
            [pacienteIdExistente],
          )
          .then((r) => r.rows[0]),
      );
      expect(pacDb).toEqual({
        id: pacienteIdExistente,
        nombre: 'OriginalNombre',
        apellido: 'OriginalApellido',
        telefono: '+5491199990000',
        email: 'nuevo.correo@ejemplo.test',
        obra_social: 'Galeno',
      });
    } finally {
      await app.close();
    }
  });

  it('responde 503 ERROR_PROVEEDOR_EMAIL en /codigo ante fallo SMTP (Q2) y 404 idéntico para clínica inactiva o inexistente', async () => {
    await crearClinicaInactiva(entorno.urlMigra);
    const emailFalso = crearEmailSenderFalso();
    emailFalso.fallarPermanentemente('EMAIL_RECHAZADO_PERMANENTE');

    const { app, logs } = await construirAppHttp({
      emailSender: emailFalso,
      limiteIp: '100/min',
    });

    try {
      const rInexistente = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/no-existe-esta-clinica/codigo',
        payload: { email: 'a@ejemplo.test' },
      });
      const rInactiva = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${SLUG_INACTIVA}/codigo`,
        payload: { email: 'b@ejemplo.test' },
      });
      expect(rInexistente.statusCode).toBe(404);
      expect(rInactiva.statusCode).toBe(404);
      expect(rInactiva.json()).toEqual(rInexistente.json());

      const rFalloSmtp = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
        payload: { email: 'fallo.smtp@ejemplo.test' },
      });
      expect(rFalloSmtp.statusCode).toBe(503);
      expect(rFalloSmtp.headers['cache-control']).toBe('no-store');
      expect(rFalloSmtp.json()).toMatchObject({ codigo: 'ERROR_PROVEEDOR_EMAIL' });

      const notif = await comoApp(CLINICA_A.id, (c) =>
        c
          .query<{ tipo: string; estado: string; error: string | null }>(
            'SELECT tipo, estado, error FROM notificacion',
          )
          .then((r) => r.rows),
      );
      expect(notif).toEqual([
        { tipo: 'codigo', estado: 'fallida', error: 'EMAIL_RECHAZADO_PERMANENTE' },
      ]);
      expect(logs.texto()).not.toContain('fallo.smtp@ejemplo.test');
    } finally {
      await app.close();
    }
  });

  it('aplica rate limit por IP y por email (429 + retry-after) y aísla respuestas 404 para clínica inactiva en /accion', async () => {
    const idInactiva = await crearClinicaInactiva(entorno.urlMigra);
    const turnoInactivo = await crearTurnoMinimo(idInactiva);
    const tokInactivo = emitirTokenAccion({
      proposito: 'confirmar',
      ahora: new Date('2026-12-10T12:00:00.000Z'),
      crypto: cryptoComunicacion,
    });
    await comoApp(idInactiva, (c) =>
      c.query(
        `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
         VALUES ($1, $2, $3, 'confirmar', $4, $5)`,
        [
          randomUUID(),
          idInactiva,
          turnoInactivo,
          tokInactivo.hashToken,
          new Date('2026-12-20T14:00:00.000Z'),
        ],
      ),
    );

    const turnoB = await crearTurnoMinimo(CLINICA_B.id);
    expect(turnoB).toBeDefined();

    const emailFalso = crearEmailSenderFalso();
    const { app } = await construirAppHttp({
      emailSender: emailFalso,
      limiteIp: '4/min',
      limiteEmailCodigo: { maximo: 2, ventanaMs: 60_000, capacidad: 50 },
    });

    try {
      // Token de clínica inactiva igual a token inexistente → 404 TOKEN_ACCION_INVALIDO
      const rInactivo = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        remoteAddress: '10.0.0.10',
        payload: { token: tokInactivo.token },
      });
      const rInexistente = await app.inject({
        method: 'POST',
        url: '/api/v1/publico/turnos/accion',
        remoteAddress: '10.0.0.11',
        payload: { token: hashSha256('inexistente') },
      });
      expect(rInactivo.statusCode).toBe(404);
      expect(rInexistente.statusCode).toBe(404);
      expect(rInactivo.json()).toEqual(rInexistente.json());

      // Rate limit por email desde IPs distintas
      for (const ip of ['10.0.1.1', '10.0.1.2']) {
        const ok = await app.inject({
          method: 'POST',
          url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
          remoteAddress: ip,
          payload: { email: 'mismo@ejemplo.test' },
        });
        expect(ok.statusCode).toBe(202);
      }
      const bloqueadoEmail = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
        remoteAddress: '10.0.1.3',
        payload: { email: 'MISMO@ejemplo.test' },
      });
      expect(bloqueadoEmail.statusCode).toBe(429);
      expect(bloqueadoEmail.headers['retry-after']).toBeDefined();
      expect(bloqueadoEmail.json()).toMatchObject({ codigo: 'DEMASIADOS_PEDIDOS' });

      // Rate limit por IP
      const ipUnica = '10.0.2.99';
      for (let i = 0; i < 4; i++) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
          remoteAddress: ipUnica,
          payload: { email: `unico${i}@ejemplo.test` },
        });
        expect(res.statusCode).toBe(202);
      }
      const bloqueadoIp = await app.inject({
        method: 'POST',
        url: `/api/v1/publico/${CLINICA_A.slug}/codigo`,
        remoteAddress: ipUnica,
        payload: { email: 'unico99@ejemplo.test' },
      });
      expect(bloqueadoIp.statusCode).toBe(429);
      expect(bloqueadoIp.headers['retry-after']).toBeDefined();
      expect(bloqueadoIp.json()).toMatchObject({ codigo: 'DEMASIADOS_PEDIDOS' });

      // Ninguna respuesta expuso datos de clínica B
      const filasTurnosA = await consultarComoMigra<{ clinica_id: string }>(
        entorno.urlMigra,
        'SELECT clinica_id FROM turno WHERE clinica_id = $1',
        [CLINICA_A.id],
      );
      expect(filasTurnosA).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
