import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorDePersistencia } from '../../../src/infrastructure/db/repositories/compartido/index.js';
import { crearConfiguracionClinicaRepository } from '../../../src/infrastructure/db/repositories/configuracion-clinica/index.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  prepararBaseDeConfiguracion,
} from './soporte.js';

beforeAll(async () => {
  await prepararBaseDeConfiguracion();
});
afterAll(cerrarPool);

beforeEach(async () => {
  // clinica_config tiene RLS forzada: se restablece por clínica, con el contexto de cada una.
  for (const clinica of [CLINICA_A, CLINICA_B]) {
    await comoApp(clinica.id, (c) =>
      c.query(
        `UPDATE clinica_config SET reserva_requiere_confirmacion = FALSE,
           cancelacion_anticipacion_horas = 24, granularidad_minutos = 15`,
      ),
    );
  }
});

describe('ConfiguracionClinicaRepository.obtener', () => {
  it('devuelve la clínica y la configuración del contexto, con valores por defecto', async () => {
    const config = await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).obtener(),
    );
    expect(config).toEqual({
      id: CLINICA_A.id,
      nombre: CLINICA_A.nombre,
      slug: CLINICA_A.slug,
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      reservaRequiereConfirmacion: false,
      cancelacionAnticipacionHoras: 24,
      granularidadMinutos: 15,
    });
  });

  it('cada contexto ve solo su propia clínica (A no ve B)', async () => {
    const b = await comoApp(CLINICA_B.id, (c) => crearConfiguracionClinicaRepository(c).obtener());
    expect(b.id).toBe(CLINICA_B.id);
    expect(b.slug).toBe(CLINICA_B.slug);
  });

  it('sin contexto de clínica falla con un error de persistencia', async () => {
    const cliente = await poolDeLaAplicacion().connect();
    try {
      await expect(crearConfiguracionClinicaRepository(cliente).obtener()).rejects.toBeInstanceOf(
        ErrorDePersistencia,
      );
    } finally {
      cliente.release();
    }
  });

  it('con bloquear:true toma FOR UPDATE sobre clinica_config', async () => {
    const resultado = await comoApp(CLINICA_A.id, async (cliente) => {
      await crearConfiguracionClinicaRepository(cliente).obtener({ bloquear: true });
      // Otra conexión intenta el mismo bloqueo sin esperar: debe chocar (55P03).
      const otro = await poolDeLaAplicacion().connect();
      try {
        await otro.query('BEGIN');
        await otro.query("SELECT set_config('app.clinica_id', $1, true)", [CLINICA_A.id]);
        return await otro
          .query('SELECT 1 FROM clinica_config FOR UPDATE NOWAIT')
          .then(() => 'sin-bloqueo')
          .catch((error: { code?: string }) => error.code);
      } finally {
        await otro.query('ROLLBACK').catch(() => undefined);
        otro.release();
      }
    });
    expect(resultado).toBe('55P03');
  });

  it('con bloquear:false no bloquea la fila', async () => {
    const resultado = await comoApp(CLINICA_A.id, async (cliente) => {
      await crearConfiguracionClinicaRepository(cliente).obtener();
      const otro = await poolDeLaAplicacion().connect();
      try {
        await otro.query('BEGIN');
        await otro.query("SELECT set_config('app.clinica_id', $1, true)", [CLINICA_A.id]);
        const { rowCount } = await otro.query('SELECT 1 FROM clinica_config FOR UPDATE NOWAIT');
        return rowCount;
      } finally {
        await otro.query('ROLLBACK').catch(() => undefined);
        otro.release();
      }
    });
    expect(resultado).toBe(1);
  });
});

describe('ConfiguracionClinicaRepository.actualizar', () => {
  it('cambia solo los campos indicados', async () => {
    const actualizada = await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).actualizar({
        reservaRequiereConfirmacion: true,
        granularidadMinutos: 30,
      }),
    );
    expect(actualizada).toMatchObject({
      reservaRequiereConfirmacion: true,
      cancelacionAnticipacionHoras: 24,
      granularidadMinutos: 30,
    });
  });

  it('otro cambio parcial conserva lo anterior y persiste', async () => {
    await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).actualizar({ cancelacionAnticipacionHoras: 48 }),
    );
    await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).actualizar({ granularidadMinutos: 20 }),
    );
    const config = await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).obtener(),
    );
    expect(config).toMatchObject({
      cancelacionAnticipacionHoras: 48,
      granularidadMinutos: 20,
      reservaRequiereConfirmacion: false,
    });
  });

  it('modificar la clínica A no toca la B', async () => {
    await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).actualizar({ granularidadMinutos: 60 }),
    );
    const b = await comoApp(CLINICA_B.id, (c) => crearConfiguracionClinicaRepository(c).obtener());
    expect(b.granularidadMinutos).toBe(15);
  });

  it('sin cambios devuelve la configuración vigente', async () => {
    const config = await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).actualizar({}),
    );
    expect(config.granularidadMinutos).toBe(15);
  });
});
