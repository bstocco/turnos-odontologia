import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import { crearRepositorioNotificacionesPg } from '../../../src/infrastructure/queue/notificacion-repositorio-pg.js';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  limpiarColaYNotificaciones,
  prepararBaseNotificaciones,
  type EntornoNotificaciones,
} from './soporte.js';

let entorno: EntornoNotificaciones;

beforeAll(async () => {
  entorno = await prepararBaseNotificaciones();
});

beforeEach(async () => {
  await limpiarColaYNotificaciones(entorno.urlMigra);
});

afterAll(async () => {
  await cerrarPool();
});

describe('crearRepositorioNotificacionesPg', () => {
  it('crea de forma idempotente y consulta respetando aislamiento multi-tenant', async () => {
    const id = randomUUID();
    const programadaPara = new Date('2026-11-25T10:00:00.000Z');

    const primera = await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).crearOEncontrarIdempotente({
        id,
        clinicaId: CLINICA_A.id,
        turnoId: randomUUID(),
        canal: 'email',
        tipo: 'creacion',
        claveIdempotencia: 'clave-repo-1',
        programadaPara,
      }),
    );
    expect(primera.creada).toBe(true);
    expect(primera.notificacion.estado).toBe('pendiente');
    expect(primera.notificacion.intentos).toBe(0);
    expect(primera.notificacion.programadaPara).toEqual(programadaPara);

    const duplicada = await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).crearOEncontrarIdempotente({
        id: randomUUID(),
        clinicaId: CLINICA_A.id,
        turnoId: randomUUID(),
        canal: 'email',
        tipo: 'creacion',
        claveIdempotencia: 'clave-repo-1',
        programadaPara,
      }),
    );
    expect(duplicada.creada).toBe(false);
    expect(duplicada.notificacion.id).toBe(id);

    // Desde clínica B no es visible
    const desdeB = await comoApp(CLINICA_B.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).buscarPorId(id),
    );
    expect(desdeB).toBeNull();
  });

  it('rechaza desalineación entre clinicaId y el contexto app.clinica_id (42501)', async () => {
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        crearRepositorioNotificacionesPg(cliente).crearOEncontrarIdempotente({
          id: randomUUID(),
          clinicaId: CLINICA_B.id,
          turnoId: null,
          canal: 'email',
          tipo: 'codigo',
          claveIdempotencia: 'clave-cruzada',
          programadaPara: new Date(),
        }),
      ),
    ).rejects.toThrowError(ErrorDeDominio);
  });

  it('actualiza intentos, error saneado, estado fallida y estado enviada con marca UTC', async () => {
    const id = randomUUID();
    const ahora = new Date('2026-11-24T18:00:00.000Z');

    await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).crearOEncontrarIdempotente({
        id,
        clinicaId: CLINICA_A.id,
        turnoId: null,
        canal: 'email',
        tipo: 'codigo',
        claveIdempotencia: 'clave-estado-1',
        programadaPara: ahora,
      }),
    );

    const trasFalloTemporal = await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).registrarFalloIntento(id, {
        definitivo: false,
        errorSeguro: 'EMAIL_TIMEOUT',
      }),
    );
    expect(trasFalloTemporal.estado).toBe('pendiente');
    expect(trasFalloTemporal.intentos).toBe(1);
    expect(trasFalloTemporal.error).toBe('EMAIL_TIMEOUT');

    const trasEnvio = await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).marcarEnviada(id, ahora),
    );
    expect(trasEnvio.estado).toBe('enviada');
    expect(trasEnvio.intentos).toBe(2);
    expect(trasEnvio.enviadaEn).toEqual(ahora);
    expect(trasEnvio.error).toBeNull();

    const idFallida = randomUUID();
    await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).crearOEncontrarIdempotente({
        id: idFallida,
        clinicaId: CLINICA_A.id,
        turnoId: null,
        canal: 'email',
        tipo: 'codigo',
        claveIdempotencia: 'clave-estado-2',
        programadaPara: ahora,
      }),
    );

    const trasFalloDefinitivo = await comoApp(CLINICA_A.id, (cliente) =>
      crearRepositorioNotificacionesPg(cliente).registrarFalloIntento(idFallida, {
        definitivo: true,
        errorSeguro: 'EMAIL_RECHAZADO_PERMANENTE',
      }),
    );
    expect(trasFalloDefinitivo.estado).toBe('fallida');
    expect(trasFalloDefinitivo.intentos).toBe(1);
    expect(trasFalloDefinitivo.error).toBe('EMAIL_RECHAZADO_PERMANENTE');
  });
});
