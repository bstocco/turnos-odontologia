import { describe, expect, it, vi } from 'vitest';

import {
  conAuditoriaDeCambio,
  conAuditoriaDeExportacion,
  conAuditoriaDeLecturaPaciente,
} from '../../../src/application/auditoria/hooks.js';
import type {
  AuditoriaRepositorio,
  RegistroAuditoriaAInsertar,
  RegistroAuditoriaCreado,
} from '../../../src/application/auditoria/puertos.js';
import { crearAuditoriaService } from '../../../src/application/auditoria/servicio.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const TURNO_ID = '22222222-2222-4222-8222-222222222222';
const PACIENTE_ID = '33333333-3333-4333-8333-333333333333';
const EXPORTACION_ID = '44444444-4444-4444-8444-444444444444';

const CTX_RECEPCION: RequestContext = {
  clinicaId: CLINICA_ID,
  actor: { tipo: 'usuario', id: 'usr-recep-1', rol: 'recepcionista' },
};

const CTX_ADMIN: RequestContext = {
  clinicaId: CLINICA_ID,
  actor: { tipo: 'usuario', id: 'usr-admin-1', rol: 'administrador' },
};

function crearServicioDePrueba(fallarEnInsertar = false): {
  auditoria: ReturnType<typeof crearAuditoriaService>;
  insertados: RegistroAuditoriaAInsertar[];
  spyInsertar: ReturnType<typeof vi.fn>;
} {
  const insertados: RegistroAuditoriaAInsertar[] = [];
  const spyInsertar = vi.fn(
    async (registro: RegistroAuditoriaAInsertar): Promise<RegistroAuditoriaCreado> => {
      if (fallarEnInsertar) {
        throw new Error('Fallo de persistencia en auditoría');
      }
      insertados.push(registro);
      return {
        id: String(insertados.length),
        clinicaId: registro.clinicaId,
        ocurrioEn: new Date('2026-11-24T13:00:00Z'),
        actorTipo: registro.actorTipo,
        actorId: registro.actorId,
        accion: registro.accion,
        entidad: registro.entidad,
        entidadId: registro.entidadId,
        datosAntes: registro.datosAntes,
        datosDespues: registro.datosDespues,
        ip: registro.ip,
      };
    },
  );
  const repositorio: AuditoriaRepositorio = {
    insertar: spyInsertar,
    listar: vi.fn(async () => []),
  };
  return {
    auditoria: crearAuditoriaService(repositorio),
    insertados,
    spyInsertar,
  };
}

describe('conAuditoriaDeCambio (RN-AU-02)', () => {
  it('audita el cambio tras éxito (usando extractores o valores directos) y devuelve el resultado', async () => {
    const { auditoria, insertados } = crearServicioDePrueba();

    const resultado = await conAuditoriaDeCambio(
      auditoria,
      CTX_RECEPCION,
      {
        accion: 'reprogramacion',
        entidad: 'turno',
        ip: '198.51.100.5',
        antes: { estado: 'confirmado', inicio: '2026-12-01T10:00:00Z' },
        extraerEntidadId: (r) => r.nuevoId,
        extraerDespues: (r) => ({ estado: r.estado, paciente: { dni: '30111222' } }),
      },
      async () => ({ nuevoId: TURNO_ID, estado: 'confirmado' }),
    );

    expect(resultado).toEqual({ nuevoId: TURNO_ID, estado: 'confirmado' });
    expect(insertados).toHaveLength(1);
    expect(insertados[0]).toMatchObject({
      accion: 'reprogramacion',
      entidad: 'turno',
      entidadId: TURNO_ID,
      ip: '198.51.100.5',
      datosAntes: { estado: 'confirmado', inicio: '2026-12-01T10:00:00Z' },
      datosDespues: { estado: 'confirmado', paciente: { dni: '[REDACTADO]' } },
    });
  });

  it('si el caso de uso falla, no registra auditoría y propaga el error original', async () => {
    const { auditoria, spyInsertar } = crearServicioDePrueba();
    const errorOriginal = new Error('Turno solapado');

    await expect(
      conAuditoriaDeCambio(
        auditoria,
        CTX_RECEPCION,
        { accion: 'creacion', entidad: 'turno', entidadId: TURNO_ID },
        async () => {
          throw errorOriginal;
        },
      ),
    ).rejects.toBe(errorOriginal);

    expect(spyInsertar).not.toHaveBeenCalled();
  });

  it('en modo fail-closed propaga el error si falla el registro en auditoría', async () => {
    const { auditoria } = crearServicioDePrueba(true);

    await expect(
      conAuditoriaDeCambio(
        auditoria,
        CTX_RECEPCION,
        { accion: 'cancelacion', entidad: 'turno', entidadId: TURNO_ID },
        async () => ({ ok: true }),
      ),
    ).rejects.toThrow('Fallo de persistencia en auditoría');
  });
});

describe('conAuditoriaDeLecturaPaciente (RN-AU-03)', () => {
  it('audita lectura_ficha sin guardar datos de la ficha cuando el paciente existe', async () => {
    const { auditoria, insertados } = crearServicioDePrueba();
    const ficha = {
      id: PACIENTE_ID,
      nombre: 'Ana',
      apellido: 'Pérez',
      dni: '30111222',
      telefono: '+5491123456789',
    };

    const devuelta = await conAuditoriaDeLecturaPaciente(
      auditoria,
      CTX_RECEPCION,
      { pacienteId: PACIENTE_ID, ip: '203.0.113.7' },
      async () => ficha,
    );

    expect(devuelta).toEqual(ficha);
    expect(insertados).toHaveLength(1);
    expect(insertados[0]).toEqual({
      clinicaId: CLINICA_ID,
      actorTipo: 'usuario',
      actorId: 'usr-recep-1',
      accion: 'lectura_ficha',
      entidad: 'paciente',
      entidadId: PACIENTE_ID,
      datosAntes: null,
      datosDespues: null,
      ip: '203.0.113.7',
    });
  });

  it('no registra auditoría cuando el paciente no existe (null o undefined)', async () => {
    const { auditoria, spyInsertar } = crearServicioDePrueba();

    expect(
      await conAuditoriaDeLecturaPaciente(
        auditoria,
        CTX_RECEPCION,
        { pacienteId: PACIENTE_ID },
        async () => null,
      ),
    ).toBeNull();

    expect(
      await conAuditoriaDeLecturaPaciente(
        auditoria,
        CTX_RECEPCION,
        { pacienteId: PACIENTE_ID },
        async () => undefined,
      ),
    ).toBeUndefined();

    expect(spyInsertar).not.toHaveBeenCalled();
  });

  it('impide entregar la ficha si falla la auditoría (fail-closed)', async () => {
    const { auditoria } = crearServicioDePrueba(true);

    await expect(
      conAuditoriaDeLecturaPaciente(
        auditoria,
        CTX_RECEPCION,
        { pacienteId: PACIENTE_ID },
        async () => ({ id: PACIENTE_ID, dni: '30111222' }),
      ),
    ).rejects.toThrow('Fallo de persistencia en auditoría');
  });
});

describe('conAuditoriaDeExportacion (RN-AU-03, RN-DA-04)', () => {
  it('audita metadatos saneados de la exportación y retorna el resultado original', async () => {
    const { auditoria, insertados } = crearServicioDePrueba();

    const archivo = await conAuditoriaDeExportacion(
      auditoria,
      CTX_ADMIN,
      {
        ip: '192.0.2.50',
        extraerEntidadId: (res) => res.exportacionId,
        extraerMetadatos: (res) => ({
          formato: res.formato,
          entidades: res.entidades,
          conteos: res.conteos,
          email: 'admin@clinica.test',
          observacion: 'Solicitado por admin@clinica.test (30111222)',
        }),
      },
      async () => ({
        exportacionId: EXPORTACION_ID,
        formato: 'csv',
        entidades: ['pacientes', 'turnos', 'auditoria'],
        conteos: { pacientes: 12, turnos: 40, auditoria: 95 },
        contenido: 'csv...',
      }),
    );

    expect(archivo.exportacionId).toBe(EXPORTACION_ID);
    expect(insertados).toHaveLength(1);
    expect(insertados[0]).toMatchObject({
      accion: 'exportacion',
      entidad: 'exportacion',
      entidadId: EXPORTACION_ID,
      datosAntes: null,
      ip: '192.0.2.50',
    });
    const texto = JSON.stringify(insertados[0]?.datosDespues);
    expect(texto).toContain('"formato":"csv"');
    expect(texto).not.toContain('30111222');
    expect(texto).not.toContain('admin@clinica.test');
  });

  it('no audita si falla la exportación y propaga el fallo si falla la auditoría (fail-closed)', async () => {
    const { auditoria: okAuditoria, spyInsertar } = crearServicioDePrueba(false);
    await expect(
      conAuditoriaDeExportacion(
        okAuditoria,
        CTX_ADMIN,
        { metadatos: { formato: 'json', entidades: ['turnos'], conteos: { turnos: 0 } } },
        async () => {
          throw new Error('Error generando CSV');
        },
      ),
    ).rejects.toThrow('Error generando CSV');
    expect(spyInsertar).not.toHaveBeenCalled();

    const { auditoria: fallaAuditoria } = crearServicioDePrueba(true);
    await expect(
      conAuditoriaDeExportacion(
        fallaAuditoria,
        CTX_ADMIN,
        { entidadId: EXPORTACION_ID, metadatos: { formato: 'json', entidades: [], conteos: {} } },
        async () => ({ exportacionId: EXPORTACION_ID }),
      ),
    ).rejects.toThrow('Fallo de persistencia en auditoría');
  });
});
