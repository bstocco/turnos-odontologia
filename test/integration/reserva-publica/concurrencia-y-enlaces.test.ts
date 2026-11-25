import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crearNotificacionService,
  crearPublicadorEventosTurno,
  crearResolvedorContenidoTurno,
  type LoggerNotificaciones,
} from '../../../src/application/notificaciones/index.js';
import {
  crearProveedorEnlacesTurnoPg,
  crearEjecutorAccionPublicaPg,
  crearEjecutorReservaPublicaPg,
  crearEjecutorSolicitudCodigoPg,
  resolverClinicaPorHashTokenConPool,
} from '../../../src/infrastructure/db/repositories/reserva-publica/index.js';
import { cryptoComunicacion, hashSha256 } from '../../../src/infrastructure/crypto/index.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/index.js';
import {
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
  crearWorkerNotificaciones,
} from '../../../src/infrastructure/queue/index.js';
import {
  ejecutarAccionPublicaTurno,
  reservarTurnoPublico,
  solicitarCodigoVerificacion,
} from '../../../src/application/reserva-publica/index.js';

import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  consultarComoMigra,
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

const loggerSilencioso: LoggerNotificaciones = {
  info() {},
  warn() {},
  error() {},
};

async function sembrarAgendaClinicaA(
  opts: {
    readonly cantidadSillones?: number;
    readonly bufferMinutos?: number;
  } = {},
) {
  const profesionalId = randomUUID();
  const prestacionId = randomUUID();
  const sillones: string[] = [];
  const cantidad = opts.cantidadSillones ?? 2;

  await comoApp(CLINICA_A.id, async (c) => {
    await c.query(
      `INSERT INTO profesional (id, clinica_id, nombre, apellido, activo)
       VALUES ($1, $2, 'Mariana', 'Pérez', TRUE)`,
      [profesionalId, CLINICA_A.id],
    );
    for (let dia = 0; dia <= 6; dia++) {
      await c.query(
        `INSERT INTO horario_atencion (id, clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
         VALUES (gen_random_uuid(), $1, $2, $3, '08:00', '20:00')`,
        [CLINICA_A.id, profesionalId, dia],
      );
    }
    await c.query(
      `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos, activa)
       VALUES ($1, $2, 'Limpieza dental', 30, TRUE)`,
      [prestacionId, CLINICA_A.id],
    );
    for (let i = 1; i <= cantidad; i++) {
      const sillonId = randomUUID();
      sillones.push(sillonId);
      await c.query(
        `INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos, activo)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [sillonId, CLINICA_A.id, `Box ${i}`, opts.bufferMinutos ?? 0],
      );
    }
  });

  return { profesionalId, prestacionId, sillones };
}

async function emitirYObtenerOtp(email: string, ahora: Date): Promise<string> {
  const emailFalso = crearEmailSenderFalso();
  const res = await solicitarCodigoVerificacion(
    {
      ejecutor: crearEjecutorSolicitudCodigoPg(),
      emailSender: emailFalso,
      crypto: cryptoComunicacion,
      reloj: { ahora: () => ahora },
      logger: loggerSilencioso,
    },
    { clinicaId: CLINICA_A.id, email },
  );
  expect(res).toEqual({ estado: 'enviado', vigenciaMinutos: 10 });
  const match = /\b(\d{6})\b/.exec(emailFalso.enviados[0]!.texto);
  return match![1]!;
}

async function esperarHasta(condicion: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error('Timeout esperando condición asíncrona de worker.');
}

describe('C-15 integración PostgreSQL real: OTP, concurrencia, PO-09 y enlaces C-14', () => {
  it('persiste 5 intentos fallidos de OTP en PostgreSQL y bloquea el 6° intento incluso con el código correcto', async () => {
    const ahora = new Date('2026-12-10T12:00:00.000Z');
    const inicio = new Date('2026-12-11T13:00:00.000Z');
    const { profesionalId, prestacionId } = await sembrarAgendaClinicaA({ cantidadSillones: 1 });
    const email = 'fuerzabruta@ejemplo.test';
    const codigoReal = await emitirYObtenerOtp(email, ahora);

    const deps = {
      ejecutor: crearEjecutorReservaPublicaPg(),
      crypto: cryptoComunicacion,
      reloj: { ahora: () => ahora },
      logger: loggerSilencioso,
    };
    const basePaciente = {
      nombre: 'Carlos',
      apellido: 'Prueba',
      dni: '31111222',
      telefono: '1144445555',
      email,
    };

    for (let i = 1; i <= 4; i++) {
      await expect(
        reservarTurnoPublico(deps, {
          clinicaId: CLINICA_A.id,
          profesionalId,
          prestacionId,
          inicio,
          codigoVerificacion: '000000' === codigoReal ? '000001' : '000000',
          paciente: basePaciente,
        }),
      ).rejects.toMatchObject({ codigo: 'CODIGO_VERIFICACION_INVALIDO' });
    }

    await expect(
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio,
        codigoVerificacion: '000000' === codigoReal ? '000001' : '000000',
        paciente: basePaciente,
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_VERIFICACION_AGOTADO' });

    const intentosDb = await comoApp(CLINICA_A.id, (c) =>
      c
        .query<{ intentos: number }>('SELECT intentos FROM codigo_verificacion WHERE email = $1', [
          email,
        ])
        .then((r) => r.rows[0]?.intentos),
    );
    expect(intentosDb).toBe(5);

    // 6° intento con el código real sigue rechazado como agotado
    await expect(
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio,
        codigoVerificacion: codigoReal,
        paciente: basePaciente,
      }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_VERIFICACION_AGOTADO' });
  });

  it('asigna el 2° sillón libre cuando el 1° está ocupado por buffer y resuelve carrera concurrente (1 éxito, 1 conflicto 409)', async () => {
    const ahora = new Date('2026-12-10T12:00:00.000Z');
    const inicio = new Date('2026-12-11T14:00:00.000Z');
    const { profesionalId, prestacionId, sillones } = await sembrarAgendaClinicaA({
      cantidadSillones: 2,
      bufferMinutos: 15,
    });

    // Otro profesional ocupa el sillón 1 de 13:30 a 14:00 + 15m buffer = 14:15
    await comoApp(CLINICA_A.id, async (c) => {
      const otroProf = randomUUID();
      const pacOtro = randomUUID();
      await c.query(
        `INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'Otro', 'Prof')`,
        [otroProf, CLINICA_A.id],
      );
      await c.query(
        `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono)
         VALUES ($1, $2, 'Pac', 'Uno', '29111222', '+5491111112222')`,
        [pacOtro, CLINICA_A.id],
      );
      await c.query(
        `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                            inicio, fin, buffer_minutos, fin_sillon, estado, origen)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                 '2026-12-11T13:30:00.000Z'::timestamptz,
                 '2026-12-11T14:00:00.000Z'::timestamptz,
                 15,
                 '2026-12-11T14:15:00.000Z'::timestamptz,
                 'confirmado', 'recepcion')`,
        [CLINICA_A.id, pacOtro, otroProf, sillones[0], prestacionId],
      );
    });

    const cod1 = await emitirYObtenerOtp('uno@ejemplo.test', ahora);
    const cod2 = await emitirYObtenerOtp('dos@ejemplo.test', ahora);
    const deps = {
      ejecutor: crearEjecutorReservaPublicaPg(),
      crypto: cryptoComunicacion,
      reloj: { ahora: () => ahora },
      logger: loggerSilencioso,
    };

    // Dos reservas concurrentes sobre el último sillón libre (sillón 2)
    const resultados = await Promise.allSettled([
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio,
        codigoVerificacion: cod1,
        paciente: {
          nombre: 'Ana',
          apellido: 'Uno',
          dni: '32111111',
          telefono: '1155551111',
          email: 'uno@ejemplo.test',
        },
      }),
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio,
        codigoVerificacion: cod2,
        paciente: {
          nombre: 'Beto',
          apellido: 'Dos',
          dni: '32222222',
          telefono: '1155552222',
          email: 'dos@ejemplo.test',
        },
      }),
    ]);

    const exitos = resultados.filter((r) => r.status === 'fulfilled');
    const fallos = resultados.filter((r) => r.status === 'rejected');
    expect(exitos).toHaveLength(1);
    expect(fallos).toHaveLength(1);

    const err = (fallos[0] as PromiseRejectedResult).reason as { codigo: string; tipo: string };
    expect(err.tipo).toBe('conflicto');
    expect(['TURNO_SOLAPADO_PROFESIONAL', 'TURNO_SOLAPADO_SILLON']).toContain(err.codigo);

    const sillonAsignado = await comoApp(CLINICA_A.id, (c) =>
      c
        .query<{ sillon_id: string }>('SELECT sillon_id FROM turno WHERE id = $1', [
          (exitos[0] as PromiseFulfilledResult<{ turnoId: string }>).value.turnoId,
        ])
        .then((r) => r.rows[0]?.sillon_id),
    );
    expect(sillonAsignado).toBe(sillones[1]);
  });

  it('serializa reservas concurrentes bajo tope PO-09 (máximo 2 activas por DNI/email)', async () => {
    const ahora = new Date('2026-12-10T12:00:00.000Z');
    const { profesionalId, prestacionId } = await sembrarAgendaClinicaA({ cantidadSillones: 3 });

    const cod1 = await emitirYObtenerOtp('po09.a@ejemplo.test', ahora);
    const cod2 = await emitirYObtenerOtp('po09.b@ejemplo.test', ahora);
    const cod3 = await emitirYObtenerOtp('po09.c@ejemplo.test', ahora);
    const deps = {
      ejecutor: crearEjecutorReservaPublicaPg(),
      crypto: cryptoComunicacion,
      reloj: { ahora: () => ahora },
      logger: loggerSilencioso,
    };

    const resultados = await Promise.allSettled([
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio: new Date('2026-12-11T12:00:00.000Z'),
        codigoVerificacion: cod1,
        paciente: {
          nombre: 'Mismo',
          apellido: 'Dni',
          dni: '33123456',
          telefono: '1166661111',
          email: 'po09.a@ejemplo.test',
        },
      }),
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio: new Date('2026-12-11T13:00:00.000Z'),
        codigoVerificacion: cod2,
        paciente: {
          nombre: 'Mismo',
          apellido: 'Dni',
          dni: '33123456',
          telefono: '1166661111',
          email: 'po09.b@ejemplo.test',
        },
      }),
      reservarTurnoPublico(deps, {
        clinicaId: CLINICA_A.id,
        profesionalId,
        prestacionId,
        inicio: new Date('2026-12-11T14:00:00.000Z'),
        codigoVerificacion: cod3,
        paciente: {
          nombre: 'Mismo',
          apellido: 'Dni',
          dni: '33123456',
          telefono: '1166661111',
          email: 'po09.c@ejemplo.test',
        },
      }),
    ]);

    const exitos = resultados.filter((r) => r.status === 'fulfilled');
    const fallos = resultados.filter((r) => r.status === 'rejected');
    expect(exitos).toHaveLength(2);
    expect(fallos).toHaveLength(1);
    expect((fallos[0] as PromiseRejectedResult).reason).toMatchObject({
      codigo: 'TOPE_RESERVAS_ACTIVAS_ALCANZADO',
    });
  });

  it('integra worker C-14 + ProveedorEnlacesTurnoPg en pg-boss sin PII en cola y resuelve concurrencia de token_accion', async () => {
    const ahora = new Date('2026-12-10T12:00:00.000Z');
    const inicio = new Date('2026-12-12T15:00:00.000Z');
    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        'UPDATE clinica_config SET reserva_requiere_confirmacion = TRUE WHERE clinica_id = $1',
        [CLINICA_A.id],
      ),
    );
    const { profesionalId, prestacionId } = await sembrarAgendaClinicaA({ cantidadSillones: 1 });
    const emailPaciente = 'enlace.real@ejemplo.test';
    const codigo = await emitirYObtenerOtp(emailPaciente, ahora);

    const emailFalso = crearEmailSenderFalso();
    const reloj = { ahora: () => ahora };
    const boss = crearPgBossApp({ connectionString: entorno.urlApp, schedule: false });
    const cola = await crearColaNotificacionesPgBoss(boss);
    const servicioNotif = crearNotificacionService({
      ejecutorTenant: crearEjecutorTenantNotificaciones(),
      cola,
      emailSender: emailFalso,
      resolvedor: crearResolvedorContenidoTurno({
        lector: crearLectorDatosTurnoPg(),
        reloj,
        proveedorEnlaces: crearProveedorEnlacesTurnoPg({
          publicBaseUrl: 'https://turnos.ejemplo.test',
          reloj,
        }),
      }),
      reloj,
      logger: loggerSilencioso,
    });
    const worker = crearWorkerNotificaciones({
      boss,
      servicio: servicioNotif,
      logger: loggerSilencioso,
      pollingIntervalSeconds: 0.5,
    });
    await worker.iniciar();

    try {
      const reserva = await reservarTurnoPublico(
        {
          ejecutor: crearEjecutorReservaPublicaPg(),
          crypto: cryptoComunicacion,
          reloj,
          publicadorPorClinica: (clinicaId) =>
            crearPublicadorEventosTurno({
              clinicaId,
              servicio: servicioNotif,
              logger: loggerSilencioso,
            }),
          logger: loggerSilencioso,
        },
        {
          clinicaId: CLINICA_A.id,
          profesionalId,
          prestacionId,
          inicio,
          codigoVerificacion: codigo,
          paciente: {
            nombre: 'Sofía',
            apellido: 'Enlace',
            dni: '34555666',
            telefono: '1155556666',
            email: emailPaciente,
          },
        },
      );

      await esperarHasta(async () => emailFalso.enviados.length >= 1);

      const correoCreacion = emailFalso.enviados[0]!;
      expect(correoCreacion.para).toBe(emailPaciente);
      const matchConfirmar =
        /https:\/\/turnos\.ejemplo\.test\/publico\/turnos\/accion\?[^\s]+accion=confirmar/.exec(
          correoCreacion.texto,
        );
      const matchCancelar =
        /https:\/\/turnos\.ejemplo\.test\/publico\/turnos\/accion\?[^\s]+accion=cancelar/.exec(
          correoCreacion.texto,
        );
      expect(matchConfirmar).not.toBeNull();
      expect(matchCancelar).not.toBeNull();

      const tokenConfirmar = new URL(matchConfirmar![0]).searchParams.get('token')!;
      const tokenCancelar = new URL(matchCancelar![0]).searchParams.get('token')!;

      // Verifica que DB guarda solo hashes y pgboss.job no guarda PII ni tokens
      const hashesDb = await comoApp(CLINICA_A.id, (c) =>
        c
          .query<{ hash_token: string; proposito: string }>(
            'SELECT hash_token, proposito FROM token_accion WHERE turno_id = $1 ORDER BY proposito',
            [reserva.turnoId],
          )
          .then((r) => r.rows),
      );
      expect(hashesDb).toEqual([
        { proposito: 'cancelar', hash_token: hashSha256(tokenCancelar) },
        { proposito: 'confirmar', hash_token: hashSha256(tokenConfirmar) },
      ]);

      const jobsPgBoss = await consultarComoMigra<{ data: unknown }>(
        entorno.urlMigra,
        'SELECT data FROM pgboss.job',
      );
      expect(JSON.stringify(jobsPgBoss)).not.toContain(emailPaciente);
      expect(JSON.stringify(jobsPgBoss)).not.toContain('34555666');
      expect(JSON.stringify(jobsPgBoss)).not.toContain(tokenConfirmar);
      expect(JSON.stringify(jobsPgBoss)).not.toContain(tokenCancelar);

      // Concurrencia al consumir el mismo tokenConfirmar: solo 1 gana
      const depsAccion = {
        resolverClinicaPorHashToken: resolverClinicaPorHashTokenConPool,
        ejecutor: crearEjecutorAccionPublicaPg(),
        crypto: cryptoComunicacion,
        reloj,
        logger: loggerSilencioso,
      };
      const [a1, a2] = await Promise.allSettled([
        ejecutarAccionPublicaTurno(depsAccion, { token: tokenConfirmar, accion: 'confirmar' }),
        ejecutarAccionPublicaTurno(depsAccion, { token: tokenConfirmar, accion: 'confirmar' }),
      ]);
      const okCount = [a1, a2].filter((x) => x.status === 'fulfilled').length;
      const errCount = [a1, a2].filter((x) => x.status === 'rejected').length;
      expect(okCount).toBe(1);
      expect(errCount).toBe(1);
      const rechazado = ([a1, a2].find((x) => x.status === 'rejected') as PromiseRejectedResult)
        .reason;
      expect(rechazado).toMatchObject({ codigo: 'TOKEN_ACCION_INVALIDO' });

      // Cancelación posterior con tokenCancelar (>= 24h) funciona y libera el turno
      const cancelado = await ejecutarAccionPublicaTurno(depsAccion, {
        token: tokenCancelar,
        accion: 'cancelar',
      });
      expect(cancelado.estado).toBe('cancelado');
    } finally {
      await worker.detener();
      await boss.stop({ graceful: false });
    }
  });
});
