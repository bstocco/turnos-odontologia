import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  copiarPlantilla,
  crearProfesional,
  modificarConfiguracionClinica,
  reemplazarHorarios,
  type ServicioAuditoria,
} from '../../../src/application/configuracion/index.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';
import { crearAuditoriaPg } from '../../../src/infrastructure/audit/index.js';
import { crearCalendarioReader } from '../../../src/infrastructure/db/repositories/calendario/index.js';
import { crearConfiguracionClinicaRepository } from '../../../src/infrastructure/db/repositories/configuracion-clinica/index.js';
import { crearFeriadoRepository } from '../../../src/infrastructure/db/repositories/feriado/index.js';
import { crearHorarioRepository } from '../../../src/infrastructure/db/repositories/horario/index.js';
import { crearProfesionalRepository } from '../../../src/infrastructure/db/repositories/profesional/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  insertarProfesional,
  prepararBaseDeConfiguracion,
} from './soporte.js';

/*
 * Atomicidad (design D9, fail-closed): cada mutación y su auditoría comparten la transacción de
 * `withTenant`. Si la auditoría falla, la base debe quedar exactamente como estaba.
 */
const CTX: RequestContext = {
  clinicaId: CLINICA_A.id,
  actor: { tipo: 'usuario', id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', rol: 'administrador' },
};

beforeAll(async () => {
  await prepararBaseDeConfiguracion();
});
afterAll(cerrarPool);

/** Auditoría que falla en el evento número `n` (1 = el primero). */
function auditoriaQueFallaEn(n: number): ServicioAuditoria {
  let llamadas = 0;
  return {
    async registrar() {
      llamadas += 1;
      if (llamadas === n) throw new Error('fallo de auditoría simulado');
      throw new Error('inalcanzable: la auditoría real no se usa en esta prueba');
    },
  };
}

/** Auditoría real que, además, falla en el evento `n` (para ver que los anteriores se revierten). */
function auditoriaRealQueFallaEn(
  n: number,
  cliente: Parameters<typeof crearAuditoriaPg>[0],
): ServicioAuditoria {
  const real = crearAuditoriaPg(cliente);
  let llamadas = 0;
  return {
    async registrar(ctx, entrada) {
      llamadas += 1;
      if (llamadas === n) throw new Error('fallo de auditoría simulado');
      return real.registrar(ctx, entrada);
    },
  };
}

async function contar(sql: string): Promise<number> {
  const { rows } = await comoApp(CLINICA_A.id, (c) => c.query<{ n: string }>(sql));
  return Number(rows[0]?.n);
}

describe('una auditoría que falla revierte la mutación', () => {
  it('modificarConfiguracionClinica deja la configuración sin cambios', async () => {
    await expect(
      withTenant(CLINICA_A.id, (cliente) =>
        modificarConfiguracionClinica(
          {
            configuracion: crearConfiguracionClinicaRepository(cliente),
            auditoria: auditoriaQueFallaEn(1),
          },
          CTX,
          { granularidadMinutos: 60, cancelacionAnticipacionHoras: 72 },
        ),
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
    const config = await comoApp(CLINICA_A.id, (c) =>
      crearConfiguracionClinicaRepository(c).obtener(),
    );
    expect(config).toMatchObject({ granularidadMinutos: 15, cancelacionAnticipacionHoras: 24 });
  });

  it('reemplazarHorarios conserva las franjas anteriores', async () => {
    const profesionalId = await insertarProfesional(CLINICA_A.id);
    await comoApp(CLINICA_A.id, (c) =>
      crearHorarioRepository(c).reemplazarFranjas(profesionalId, [
        { diaSemana: 1, desdeMinutos: 540, hastaMinutos: 780 },
      ]),
    );
    await expect(
      withTenant(CLINICA_A.id, (cliente) => {
        const horarios = crearHorarioRepository(cliente);
        const calendario = crearCalendarioReader(cliente);
        return reemplazarHorarios(
          {
            profesionales: crearProfesionalRepository(cliente),
            horarios: {
              franjasDeAtencion: (id) => calendario.franjasDeAtencion(id as never),
              reemplazarFranjas: (id, f) => horarios.reemplazarFranjas(id, f),
            },
            vinculo: { profesionalDelUsuario: async () => null },
            auditoria: auditoriaQueFallaEn(1),
          },
          CTX,
          profesionalId,
          { franjas: [{ diaSemana: 4, horaDesde: '10:00', horaHasta: '12:00' }] },
        );
      }),
    ).rejects.toThrow('fallo de auditoría simulado');
    const franjas = await comoApp(CLINICA_A.id, (c) =>
      crearCalendarioReader(c).franjasDeAtencion(profesionalId as never),
    );
    expect(franjas).toEqual([{ diaSemana: 1, desdeMinutos: 540, hastaMinutos: 780 }]);
  });

  it('el alta de un profesional no deja la fila', async () => {
    const antes = await contar('SELECT count(*) AS n FROM profesional');
    await expect(
      withTenant(CLINICA_A.id, (cliente) =>
        crearProfesional(
          { profesionales: crearProfesionalRepository(cliente), auditoria: auditoriaQueFallaEn(1) },
          CTX,
          { nombre: 'Nombre', apellido: 'Sintético' },
        ),
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
    expect(await contar('SELECT count(*) AS n FROM profesional')).toBe(antes);
  });

  it('copiarPlantilla que falla a mitad no deja feriados ni auditoría parcial', async () => {
    await comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM feriado'));
    const auditoriasAntes = await contar(
      "SELECT count(*) AS n FROM auditoria WHERE entidad = 'feriado'",
    );
    await expect(
      withTenant(CLINICA_A.id, (cliente) =>
        copiarPlantilla(
          {
            feriados: crearFeriadoRepository(cliente),
            auditoria: auditoriaRealQueFallaEn(3, cliente),
          },
          CTX,
          2026,
        ),
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
    expect(await contar('SELECT count(*) AS n FROM feriado')).toBe(0);
    expect(await contar("SELECT count(*) AS n FROM auditoria WHERE entidad = 'feriado'")).toBe(
      auditoriasAntes,
    );
  });

  it('control: con la auditoría real todo se confirma junto', async () => {
    await comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM feriado'));
    const resultado = await withTenant(CLINICA_A.id, (cliente) =>
      copiarPlantilla(
        { feriados: crearFeriadoRepository(cliente), auditoria: crearAuditoriaPg(cliente) },
        CTX,
        2027,
      ),
    );
    expect(await contar('SELECT count(*) AS n FROM feriado')).toBe(resultado.creados.length);
  });
});
