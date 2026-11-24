import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  conAuditoriaDeCambio,
  conAuditoriaDeExportacion,
  conAuditoriaDeLecturaPaciente,
} from '../../../src/application/auditoria/index.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import {
  crearAuditoriaPg,
  crearRepositorioAuditoriaPg,
} from '../../../src/infrastructure/audit/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';

import { cerrarPool, comoApp, crearClinicaSintetica, prepararBaseAuditoria } from './soporte.js';

beforeAll(async () => {
  await prepararBaseAuditoria();
});

afterAll(cerrarPool);

describe('adaptador PostgreSQL de auditoría (C-07)', () => {
  it('persiste los tres tipos de actor en withTenant con jsonb enmascarado, id secuencial e ip canónica', async () => {
    const clinica = await crearClinicaSintetica('pg-actores');
    const turnoId = randomUUID();
    const notifId = randomUUID();

    const ctxUsuario: RequestContext = {
      clinicaId: clinica.id,
      actor: { tipo: 'usuario', id: 'usr-100', rol: 'recepcionista' },
    };
    const ctxPaciente: RequestContext = {
      clinicaId: clinica.id,
      actor: { tipo: 'paciente_enlace', id: 'tok-55', rol: 'paciente' },
    };
    const ctxSistema: RequestContext = {
      clinicaId: clinica.id,
      actor: { tipo: 'sistema', id: '', rol: 'sistema' },
    };

    const creados = await withTenant(clinica.id, async (cliente) => {
      const auditoria = crearAuditoriaPg(cliente);

      const r1 = await auditoria.registrar(ctxUsuario, {
        accion: 'creacion',
        entidad: 'turno',
        entidadId: turnoId,
        antes: null,
        despues: {
          estado: 'confirmado',
          paciente: { dni: '30111222', email: 'ana@example.com', nombre: 'Ana' },
          participantes: [{ apellido: 'Pérez', rol: 'titular' }],
        },
        ip: '198.51.100.42',
      });
      const r2 = await auditoria.registrar(ctxPaciente, {
        accion: 'confirmacion',
        entidad: 'turno',
        entidadId: turnoId,
        antes: { estado: 'pendiente_confirmacion' },
        despues: { estado: 'confirmado' },
        ip: '2001:db8::10',
      });
      const r3 = await auditoria.registrar(ctxSistema, {
        accion: 'recordatorio',
        entidad: 'notificacion',
        entidadId: notifId,
      });
      return [r1, r2, r3] as const;
    });

    expect(BigInt(creados[1].id)).toBeGreaterThan(BigInt(creados[0].id));
    expect(BigInt(creados[2].id)).toBeGreaterThan(BigInt(creados[1].id));
    expect(creados[0].ocurrioEn).toBeInstanceOf(Date);
    expect(creados[0].ip).toBe('198.51.100.42');
    expect(creados[1].ip).toBe('2001:db8::10');
    expect(creados[2].actorId).toBeNull();
    expect(creados[2].ip).toBeNull();

    expect(creados[0].datosDespues).toEqual({
      estado: 'confirmado',
      paciente: { dni: '[REDACTADO]', email: '[REDACTADO]', nombre: '[REDACTADO]' },
      participantes: [{ apellido: '[REDACTADO]', rol: 'titular' }],
    });

    const { rows } = await comoApp(clinica.id, (c) =>
      c.query<{ id: string; actor_tipo: string; datos_despues: unknown }>(
        'SELECT id::text AS id, actor_tipo, datos_despues FROM auditoria ORDER BY id',
      ),
    );
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain('30111222');
    expect(JSON.stringify(rows)).not.toContain('ana@example.com');
  });

  it('rechaza desalineación entre ctx.clinicaId y app.clinica_id sin insertar filas', async () => {
    const clinicaA = await crearClinicaSintetica('pg-desal-a');
    const clinicaB = await crearClinicaSintetica('pg-desal-b');

    const ctxAjeno: RequestContext = {
      clinicaId: clinicaB.id,
      actor: { tipo: 'usuario', id: 'usr-1', rol: 'administrador' },
    };

    await expect(
      withTenant(clinicaA.id, async (cliente) => {
        const auditoria = crearAuditoriaPg(cliente);
        await auditoria.registrar(ctxAjeno, {
          accion: 'creacion',
          entidad: 'turno',
          entidadId: randomUUID(),
        });
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ErrorDeDominio);
      expect((err as ErrorDeDominio).codigo).toBe('AUDITORIA_CONTEXTO_INVALIDO');
      expect((err as ErrorDeDominio).tipo).toBe('prohibido');
      return true;
    });

    const enA = await comoApp(clinicaA.id, (c) => c.query('SELECT id FROM auditoria'));
    const enB = await comoApp(clinicaB.id, (c) => c.query('SELECT id FROM auditoria'));
    expect(enA.rows).toHaveLength(0);
    expect(enB.rows).toHaveLength(0);
  });

  it('revierte atómicamente cambios y auditoría ante ROLLBACK posterior o fallo fail-closed', async () => {
    const clinica = await crearClinicaSintetica('pg-tx');
    const otraClinica = await crearClinicaSintetica('pg-tx-otra');

    const ctxValido: RequestContext = {
      clinicaId: clinica.id,
      actor: { tipo: 'usuario', id: 'usr-tx', rol: 'administrador' },
    };

    await expect(
      withTenant(clinica.id, async (cliente) => {
        const auditoria = crearAuditoriaPg(cliente);
        const profId = randomUUID();
        await conAuditoriaDeCambio(
          auditoria,
          ctxValido,
          {
            accion: 'creacion',
            entidad: 'profesional',
            entidadId: profId,
            despues: { activo: true },
          },
          async () => {
            await cliente.query(
              'INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, $3, $4)',
              [profId, clinica.id, 'María', 'López'],
            );
            return profId;
          },
        );
        throw new Error('Error posterior que aborta la transacción');
      }),
    ).rejects.toThrow('Error posterior que aborta la transacción');

    const ctxDesalineado: RequestContext = {
      clinicaId: otraClinica.id,
      actor: { tipo: 'usuario', id: 'usr-tx', rol: 'administrador' },
    };

    await expect(
      withTenant(clinica.id, async (cliente) => {
        const auditoria = crearAuditoriaPg(cliente);
        const profId = randomUUID();
        return conAuditoriaDeCambio(
          auditoria,
          ctxDesalineado,
          {
            accion: 'creacion',
            entidad: 'profesional',
            entidadId: profId,
          },
          async () => {
            await cliente.query(
              'INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, $3, $4)',
              [profId, clinica.id, 'Juan', 'Gómez'],
            );
            return profId;
          },
        );
      }),
    ).rejects.toMatchObject({ codigo: 'AUDITORIA_CONTEXTO_INVALIDO' });

    const profs = await comoApp(clinica.id, (c) => c.query('SELECT id FROM profesional'));
    const audits = await comoApp(clinica.id, (c) => c.query('SELECT id FROM auditoria'));
    expect(profs.rows).toHaveLength(0);
    expect(audits.rows).toHaveLength(0);
  });

  it('integra hooks de lectura de paciente y exportación contra PostgreSQL real', async () => {
    const clinica = await crearClinicaSintetica('pg-hooks');
    const pacienteId = randomUUID();
    const inexistenteId = randomUUID();
    const exportId = randomUUID();

    const ctx: RequestContext = {
      clinicaId: clinica.id,
      actor: { tipo: 'usuario', id: 'usr-admin', rol: 'administrador' },
    };

    await withTenant(clinica.id, async (cliente) => {
      const auditoria = crearAuditoriaPg(cliente);

      const encontrada = await conAuditoriaDeLecturaPaciente(
        auditoria,
        ctx,
        { pacienteId, ip: '203.0.113.9' },
        async () => ({ id: pacienteId, dni: '30111222', nombre: 'Ana' }),
      );
      expect(encontrada?.dni).toBe('30111222');

      await conAuditoriaDeLecturaPaciente(
        auditoria,
        ctx,
        { pacienteId: inexistenteId },
        async () => null,
      );

      await conAuditoriaDeExportacion(
        auditoria,
        ctx,
        {
          entidadId: exportId,
          metadatos: {
            formato: 'json',
            entidades: ['pacientes', 'turnos'],
            conteos: { pacientes: 5, turnos: 10 },
          },
        },
        async () => ({ id: exportId }),
      );
    });

    const { rows } = await comoApp(clinica.id, (c) =>
      c.query<{
        accion: string;
        entidad: string;
        entidad_id: string | null;
        datos_antes: unknown;
        datos_despues: unknown;
      }>(
        'SELECT accion, entidad, entidad_id, datos_antes, datos_despues FROM auditoria ORDER BY id',
      ),
    );

    expect(rows).toEqual([
      {
        accion: 'lectura_ficha',
        entidad: 'paciente',
        entidad_id: pacienteId,
        datos_antes: null,
        datos_despues: null,
      },
      {
        accion: 'exportacion',
        entidad: 'exportacion',
        entidad_id: exportId,
        datos_antes: null,
        datos_despues: {
          formato: 'json',
          entidades: ['pacientes', 'turnos'],
          conteos: { pacientes: 5, turnos: 10 },
        },
      },
    ]);
  });

  it('no filtra datos personales ni detalles de PostgreSQL cuando el motor rechaza una inserción', async () => {
    const clinica = await crearClinicaSintetica('pg-error-sin-pii');

    let capturado: unknown;
    try {
      await withTenant(clinica.id, async (cliente) => {
        const repo = crearRepositorioAuditoriaPg(cliente);
        await repo.insertar({
          clinicaId: clinica.id,
          actorTipo: 'usuario',
          actorId: 'usr-1',
          accion: 'AccionInvalida',
          entidad: 'paciente',
          entidadId: randomUUID(),
          datosAntes: null,
          datosDespues: { dni: '30111222', email: 'ana@example.com' },
          ip: null,
        });
      });
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    const err = capturado as ErrorDeDominio;
    expect(err.codigo).toBe('DATOS_INVALIDOS');
    expect(err.tipo).toBe('solicitud_invalida');

    const serializado = `${JSON.stringify(err)} ${err.message} ${err.stack ?? ''}`;
    expect(serializado).not.toContain('30111222');
    expect(serializado).not.toContain('ana@example.com');
  });
});
