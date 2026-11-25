import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ServicioAuditoria } from '../../../src/application/auditoria/index.js';
import {
  crearPaciente,
  modificarPaciente,
  obtenerPaciente,
  type DependenciasDePacientes,
} from '../../../src/application/pacientes/index.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';
import { crearAccesoPacientesReader } from '../../../src/infrastructure/db/repositories/paciente-acceso/index.js';
import { crearPacienteRepository } from '../../../src/infrastructure/db/repositories/paciente/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  contarAuditoria,
  insertarPaciente,
  prepararBaseDePacientes,
} from './soporte.js';

/*
 * Atomicidad (design D11, fail-closed): cada operación y su auditoría comparten la transacción
 * de `withTenant`. Si la auditoría falla, la base debe quedar exactamente como estaba.
 */
const CTX: RequestContext = {
  clinicaId: CLINICA_A.id,
  actor: { tipo: 'usuario', id: randomUUID(), rol: 'administrador' },
};

const auditoriaQueFalla: ServicioAuditoria = {
  async registrar() {
    throw new Error('fallo de auditoría simulado');
  },
};

function dependencias(
  cliente: Parameters<Parameters<typeof withTenant>[1]>[0],
): DependenciasDePacientes {
  return {
    pacientes: crearPacienteRepository(cliente),
    acceso: crearAccesoPacientesReader(cliente),
    vinculo: { profesionalDelUsuario: async () => null },
    auditoria: auditoriaQueFalla,
  };
}

let existente: string;

beforeAll(async () => {
  await prepararBaseDePacientes();
  existente = await insertarPaciente(CLINICA_A.id, { apellido: 'Original', dni: '37000001' });
});
afterAll(cerrarPool);

async function contarPacientes(): Promise<number> {
  const { rows } = await comoApp(CLINICA_A.id, (c) =>
    c.query<{ n: string }>('SELECT count(*)::text AS n FROM paciente'),
  );
  return Number(rows[0]?.n);
}

describe('fail-closed: la auditoría que falla revierte la operación', () => {
  it('crearPaciente no deja el paciente creado', async () => {
    const pacientes = await contarPacientes();
    const auditoria = await contarAuditoria(CLINICA_A.id);
    await expect(
      withTenant(CLINICA_A.id, (c) =>
        crearPaciente(
          dependencias(c),
          CTX,
          { nombre: 'Nuevo', apellido: 'Sintetico', dni: '37000002', telefono: '011 15 5555-1234' },
          null,
        ),
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
    expect(await contarPacientes()).toBe(pacientes);
    expect(await contarAuditoria(CLINICA_A.id)).toBe(auditoria);
  });

  it('modificarPaciente conserva los valores anteriores', async () => {
    await expect(
      withTenant(CLINICA_A.id, (c) =>
        modificarPaciente(
          dependencias(c),
          CTX,
          existente,
          { nombre: 'Cambiado', dni: '37000099' },
          null,
        ),
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query<{ nombre: string; dni: string }>('SELECT nombre, dni FROM paciente WHERE id = $1', [
        existente,
      ]),
    );
    expect(rows[0]).toEqual({ nombre: 'Nombre', dni: '37000001' });
  });

  it('obtenerPaciente no devuelve la ficha y no registra nada', async () => {
    const auditoria = await contarAuditoria(CLINICA_A.id);
    let ficha: unknown;
    await expect(
      withTenant(CLINICA_A.id, async (c) => {
        ficha = await obtenerPaciente(dependencias(c), CTX, existente, null);
      }),
    ).rejects.toThrow('fallo de auditoría simulado');
    expect(ficha).toBeUndefined();
    expect(await contarAuditoria(CLINICA_A.id)).toBe(auditoria);
  });
});
