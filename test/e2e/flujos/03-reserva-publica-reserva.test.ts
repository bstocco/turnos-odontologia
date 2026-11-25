import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { configDeBaseDePrueba, consultarComoMigra } from '../../support/base-de-datos.js';
import { emailFalso } from '../soporte/email-falso.js';
import { abrirEntorno, ipNueva, type EntornoE2E } from '../soporte/entorno.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import {
  pedirComo,
  ponerEnMarchaUnaClinica,
  type ClinicaConfigurada,
} from '../soporte/puesta-en-marcha.js';
import {
  codigoErroneoDistintoDe,
  configurarEntornoDeReservaPublica,
  cuerpoDeReserva,
  esperarEnlaces,
  huecosDelDia,
  iniciarWorkerDeCorreos,
  obtenerCodigo,
  pacienteNuevo,
  reservar,
  solicitarCodigo,
  type WorkerDeCorreos,
} from '../soporte/reserva-publica.js';
import { sumarDias } from '../soporte/fechas.js';

/*
 * Flujo 3 de 07_flujos_principales.md, parte de RESERVA (C-15): código por email → reserva →
 * enlaces. La consulta previa (prestaciones, profesionales, disponibilidad) está en
 * `03-reserva-publica.test.ts`.
 *
 * Solo el proveedor de email es simulado (adaptador en memoria que reemplaza al SMTP real); la
 * app completa, PostgreSQL, la cola pg-boss y el worker que arma los enlaces son reales. Los
 * códigos y tokens se leen del email simulado: nunca figuran en archivos ni en mensajes.
 */
vi.mock('../../../src/infrastructure/email/index.js', async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import('../../../src/infrastructure/email/index.js')>();
  const { emailFalso: falso } = await import('../soporte/email-falso.js');
  return { ...original, crearEmailSenderSmtp: () => falso };
});

interface Reserva {
  readonly turnoId: string;
  readonly estado: string;
  readonly inicio: string;
  readonly fin: string;
  readonly zonaHoraria: string;
  readonly profesionalId: string;
  readonly prestacionId: string;
}

describe('Flujo 3: reserva pública — código, reserva y enlaces', () => {
  let entorno: EntornoE2E;
  let worker: WorkerDeCorreos;
  let urlMigra: string;
  const logsDeServicios: string[] = [];

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

  /** Clínica nueva con huecos publicados; `requiereConfirmacion` decide el estado inicial. */
  async function clinicaConHuecos(requiereConfirmacion: boolean) {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'reserva-codigo');
    if (requiereConfirmacion) {
      await pedirComo(entorno, lista.sesion, 'PATCH', '/api/v1/clinica', 200, {
        reservaRequiereConfirmacion: true,
      });
    }
    const huecos = await huecosDelDia(
      entorno,
      lista.clinica.slug,
      lista,
      lista.diaConHuecos,
      sumarDias(lista.diaConHuecos, 1),
    );
    expect(huecos.length).toBeGreaterThanOrEqual(5);
    return { lista, huecos };
  }

  function sensibles(paciente: ReturnType<typeof pacienteNuevo>) {
    return valoresSensibles(paciente);
  }

  async function turnoEnBase(lista: ClinicaConfigurada, turnoId: string) {
    return withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query<{
        estado: string;
        origen: string;
        sillon_id: string;
        profesional_id: string;
      }>('SELECT estado, origen, sillon_id, profesional_id FROM turno WHERE id = $1', [turnoId]);
      return rows[0];
    });
  }

  it('código por email → reserva (201, sillón automático, estado según la clínica) → email con enlaces y sin datos personales', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const paciente = pacienteNuevo();
    const inicio = huecos[0]!.inicio;

    // 1. Pedir el código: 202 sin el código ni el email en la respuesta.
    const respuestaCodigo = await solicitarCodigo(entorno, lista.clinica.slug, paciente.email);
    expect(respuestaCodigo.statusCode).toBe(202);
    expect(respuestaCodigo.headers['cache-control']).toBe('no-store');
    expect(respuestaCodigo.json()).toEqual({ enviado: true, vigenciaMinutos: 10 });
    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
    expect(respuestaCodigo.body).not.toContain(codigo);
    expect(respuestaCodigo.body).not.toContain(paciente.email);

    // 2. Reservar con el código: 201 sin sillón ni datos del paciente.
    const respuestaReserva = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, inicio, codigo, paciente),
    );
    expect(respuestaReserva.statusCode).toBe(201);
    expect(respuestaReserva.headers['cache-control']).toBe('no-store');
    const reserva = respuestaReserva.json() as Reserva;
    expect(Object.keys(reserva).sort()).toEqual([
      'estado',
      'fin',
      'inicio',
      'prestacionId',
      'profesionalId',
      'turnoId',
      'zonaHoraria',
    ]);
    // La clínica no exige confirmación (RN-RE-01): el turno nace confirmado.
    expect(reserva.estado).toBe('confirmado');
    expect(reserva.inicio).toBe(inicio);
    expect(reserva.zonaHoraria).toBe('America/Argentina/Buenos_Aires');
    for (const valor of Object.values(sensibles(paciente))) {
      expect(respuestaReserva.body).not.toContain(valor);
    }

    // 3. El sillón se asignó solo (único libre) y el origen es el enlace web.
    expect(await turnoEnBase(lista, reserva.turnoId)).toEqual({
      estado: 'confirmado',
      origen: 'enlace_web',
      sillon_id: lista.sillonId,
      profesional_id: lista.profesionalId,
    });

    // 4. La disponibilidad pública ya no ofrece ese hueco.
    const despues = await huecosDelDia(
      entorno,
      lista.clinica.slug,
      lista,
      lista.diaConHuecos,
      sumarDias(lista.diaConHuecos, 1),
    );
    expect(despues.map((h) => h.inicio)).not.toContain(inicio);

    // 5. El worker real envía el email con el enlace de cancelación (turno ya confirmado).
    const enlaces = await esperarEnlaces(paciente.email);
    expect(enlaces.cancelar).toEqual(expect.any(String));
    expect(enlaces.confirmar).toBeUndefined();

    // 6. El código fue de un solo uso.
    const reuso = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[1]!.inicio, codigo, paciente),
    );
    expect(reuso.statusCode).toBe(422);
    expect((reuso.json() as { codigo: string }).codigo).toBe('CODIGO_VERIFICACION_USADO');

    // 7. Privacidad (Ley 25.326): ni el paciente, ni el código, ni el token aparecen en logs, en
    // la cola ni en los emails (más allá del destinatario).
    const secretos = {
      ...sensibles(paciente),
      codigo,
      tokenCancelar: enlaces.cancelar ?? '',
    };
    logsDeServicios.push(...worker.logs);
    afirmarSinDatosPersonales(entorno.logs, secretos);
    afirmarSinDatosPersonales({ texto: () => logsDeServicios.join('\n') }, secretos);
    const cola = JSON.stringify(await consultarComoMigra(urlMigra, `SELECT data FROM pgboss.job`));
    for (const [campo, valor] of Object.entries(secretos)) {
      expect(cola.includes(valor), `la cola contiene ${campo}`).toBe(false);
    }
    for (const mensaje of emailFalso.enviados.filter((m) => m.para === paciente.email)) {
      for (const campo of ['dni', 'telefono', 'obraSocial'] as const) {
        expect(mensaje.texto.includes(paciente[campo]), `un email contiene ${campo}`).toBe(false);
      }
    }
  }, 60_000);

  it('con una clínica que exige confirmación el turno nace pendiente y el email trae ambos enlaces', async () => {
    const { lista, huecos } = await clinicaConHuecos(true);
    const paciente = pacienteNuevo();
    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);

    const respuesta = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[0]!.inicio, codigo, paciente),
    );
    expect(respuesta.statusCode).toBe(201);
    expect((respuesta.json() as Reserva).estado).toBe('pendiente_confirmacion');

    const enlaces = await esperarEnlaces(paciente.email);
    expect(enlaces.confirmar).toEqual(expect.any(String));
    expect(enlaces.cancelar).toEqual(expect.any(String));
    expect(enlaces.confirmar).not.toBe(enlaces.cancelar);
  }, 60_000);

  it('un código incorrecto da 422 y a los 5 intentos se agota: ni el código correcto sirve', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const paciente = pacienteNuevo();
    const correcto = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
    const erroneo = codigoErroneoDistintoDe(correcto);
    const intentar = (codigo: string) =>
      reservar(
        entorno,
        lista.clinica.slug,
        cuerpoDeReserva(lista, huecos[0]!.inicio, codigo, paciente),
      );

    const codigos: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const respuesta = await intentar(erroneo);
      expect(respuesta.statusCode).toBe(422);
      codigos.push((respuesta.json() as { codigo: string }).codigo);
    }
    expect(codigos.slice(0, 4)).toEqual(Array<string>(4).fill('CODIGO_VERIFICACION_INVALIDO'));
    expect(codigos[4]).toBe('CODIGO_VERIFICACION_AGOTADO');

    const conElCorrecto = await intentar(correcto);
    expect(conElCorrecto.statusCode).toBe(422);
    expect((conElCorrecto.json() as { codigo: string }).codigo).toBe('CODIGO_VERIFICACION_AGOTADO');
    // Sin turno creado: el hueco sigue publicado.
    const ofrecidos = await huecosDelDia(
      entorno,
      lista.clinica.slug,
      lista,
      lista.diaConHuecos,
      sumarDias(lista.diaConHuecos, 1),
    );
    expect(ofrecidos.map((h) => h.inicio)).toContain(huecos[0]!.inicio);
  }, 60_000);

  it('un código vencido da 422 CODIGO_VERIFICACION_VENCIDO y no crea el turno', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const paciente = pacienteNuevo();
    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
    // El reloj de la app no se simula en los e2e: se vence el código en la base.
    await withTenant(lista.clinica.id, (cliente) =>
      cliente.query(`UPDATE codigo_verificacion SET vence_en = now() - interval '1 minute'`),
    );

    const respuesta = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[0]!.inicio, codigo, paciente),
    );
    expect(respuesta.statusCode).toBe(422);
    expect((respuesta.json() as { codigo: string }).codigo).toBe('CODIGO_VERIFICACION_VENCIDO');
    // La tabla tiene RLS forzada: se cuenta como `app` dentro del contexto de la clínica.
    const turnos = await withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query<{ cantidad: string }>(
        'SELECT count(*) AS cantidad FROM turno',
      );
      return rows[0]?.cantidad;
    });
    expect(turnos).toBe('0');
  }, 60_000);

  it('un hueco ocupado da 409 con código de dominio y NO quema el código: se reintenta en otro hueco', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const primero = pacienteNuevo();
    const segundo = pacienteNuevo();
    const codigoPrimero = await obtenerCodigo(entorno, lista.clinica.slug, primero.email);
    const codigoSegundo = await obtenerCodigo(entorno, lista.clinica.slug, segundo.email);

    const ocupa = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[0]!.inicio, codigoPrimero, primero),
    );
    expect(ocupa.statusCode).toBe(201);

    const choque = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[0]!.inicio, codigoSegundo, segundo),
    );
    expect(choque.statusCode).toBe(409);
    expect(['TURNO_SOLAPADO_PROFESIONAL', 'TURNO_SOLAPADO_SILLON']).toContain(
      (choque.json() as { codigo: string }).codigo,
    );

    const reintento = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[2]!.inicio, codigoSegundo, segundo),
    );
    expect(reintento.statusCode).toBe(201);
  }, 60_000);

  it('una reserva fuera del horario o en el feriado da 422', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const paciente = pacienteNuevo();
    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);

    // Misma hora del hueco, pero en el feriado de la clínica.
    const horaLocal = huecos[0]!.inicio.slice(10);
    const enElFeriado = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, `${lista.diaFeriado}${horaLocal}`, codigo, paciente),
    );
    expect(enElFeriado.statusCode).toBe(422);

    // Mismo día con huecos, pero de madrugada (03:00 UTC = 00:00 local).
    const madrugada = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, `${lista.diaConHuecos}T03:00:00.000Z`, codigo, paciente),
    );
    expect(madrugada.statusCode).toBe(422);
  }, 60_000);

  it('el tope de dos reservas activas por paciente rechaza la tercera con 422', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const paciente = pacienteNuevo();
    // Huecos no contiguos: el buffer del sillón bloquea el hueco siguiente al turno ya reservado.
    for (const indice of [0, 2]) {
      const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
      const respuesta = await reservar(
        entorno,
        lista.clinica.slug,
        cuerpoDeReserva(lista, huecos[indice]!.inicio, codigo, paciente),
      );
      expect(respuesta.statusCode).toBe(201);
    }
    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
    const tercera = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(lista, huecos[4]!.inicio, codigo, paciente),
    );
    expect(tercera.statusCode).toBe(422);
    expect((tercera.json() as { codigo: string }).codigo).toBe('TOPE_RESERVAS_ACTIVAS_ALCANZADO');
  }, 60_000);

  it('el sexto pedido de código para el mismo email desde IP distintas da 429 con retry-after', async () => {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'reserva-429-email');
    const paciente = pacienteNuevo();
    const estados: number[] = [];
    let ultimo: Awaited<ReturnType<typeof solicitarCodigo>> | undefined;
    for (let i = 0; i < 6; i += 1) {
      ultimo = await solicitarCodigo(entorno, lista.clinica.slug, paciente.email, ipNueva());
      estados.push(ultimo.statusCode);
    }
    expect(estados.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(estados[5]).toBe(429);
    expect((ultimo?.json() as { codigo: string }).codigo).toBe('DEMASIADOS_PEDIDOS');
    expect(Number(ultimo?.headers['retry-after'])).toBeGreaterThan(0);

    // Otro email de la misma clínica no se ve afectado.
    const otro = await solicitarCodigo(
      entorno,
      lista.clinica.slug,
      pacienteNuevo().email,
      ipNueva(),
    );
    expect(otro.statusCode).toBe(202);
  }, 60_000);

  it('el exceso de pedidos desde una misma IP da 429 sin tocar a otras IP', async () => {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'reserva-429-ip');
    const ip = ipNueva();
    const estados: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const respuesta = await solicitarCodigo(
        entorno,
        lista.clinica.slug,
        pacienteNuevo().email,
        ip,
      );
      estados.push(respuesta.statusCode);
    }
    expect(estados[0]).toBe(202);
    expect(estados).toContain(429);

    const otraIp = await solicitarCodigo(entorno, lista.clinica.slug, pacienteNuevo().email);
    expect(otraIp.statusCode).toBe(202);
  }, 60_000);

  it('un slug inexistente o un profesional de otra clínica responde 404 idéntico y no revela nada', async () => {
    const { lista, huecos } = await clinicaConHuecos(false);
    const otra = await ponerEnMarchaUnaClinica(entorno, 'reserva-otra');
    const paciente = pacienteNuevo();

    const sinClinica = await solicitarCodigo(entorno, 'e2e-no-existe-0000', paciente.email);
    expect(sinClinica.statusCode).toBe(404);
    expect(sinClinica.body).not.toContain(lista.clinica.id);

    const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);
    const cruzada = await reservar(
      entorno,
      lista.clinica.slug,
      cuerpoDeReserva(
        { profesionalId: otra.profesionalId, prestacionId: lista.prestacionId },
        huecos[0]!.inicio,
        codigo,
        paciente,
      ),
    );
    expect(cruzada.statusCode).toBe(404);
    expect(cruzada.body).not.toContain(otra.profesionalId);
    expect(cruzada.body).not.toContain(otra.clinica.id);
  }, 60_000);
});
