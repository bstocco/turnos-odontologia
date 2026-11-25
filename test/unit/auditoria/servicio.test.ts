import { describe, expect, it, vi } from 'vitest';

import type {
  AuditoriaRepositorio,
  RegistroAuditoriaAInsertar,
  RegistroAuditoriaCreado,
} from '../../../src/application/auditoria/puertos.js';
import { crearAuditoriaService } from '../../../src/application/auditoria/servicio.js';
import type { RequestContext, TipoActor } from '../../../src/application/shared/request-context.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const TURNO_ID = '22222222-2222-4222-8222-222222222222';
const NOTIF_ID = '33333333-3333-4333-8333-333333333333';
const PACIENTE_ID = '44444444-4444-4444-8444-444444444444';

function crearRepositorioFake(): {
  repositorio: AuditoriaRepositorio;
  insertados: RegistroAuditoriaAInsertar[];
  spyInsertar: ReturnType<typeof vi.fn>;
} {
  const insertados: RegistroAuditoriaAInsertar[] = [];
  const spyInsertar = vi.fn(
    async (registro: RegistroAuditoriaAInsertar): Promise<RegistroAuditoriaCreado> => {
      insertados.push(registro);
      return {
        id: String(insertados.length),
        clinicaId: registro.clinicaId,
        ocurrioEn: new Date('2026-11-24T12:00:00Z'),
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
  return {
    repositorio: { insertar: spyInsertar, listar: vi.fn(async () => []) },
    insertados,
    spyInsertar,
  };
}

describe('AuditoriaService.registrar', () => {
  it('registra eventos para usuario, paciente_enlace y sistema (normalizando actorId vacío en sistema)', async () => {
    const { repositorio, insertados, spyInsertar } = crearRepositorioFake();
    const servicio = crearAuditoriaService(repositorio);

    const ctxUsuario: RequestContext = {
      clinicaId: CLINICA_ID,
      actor: { tipo: 'usuario', id: 'usr-1', rol: 'recepcionista' },
    };
    const ctxPaciente: RequestContext = {
      clinicaId: CLINICA_ID,
      actor: { tipo: 'paciente_enlace', id: 'tok-9', rol: 'paciente' },
    };
    const ctxSistemaSinId: RequestContext = {
      clinicaId: CLINICA_ID,
      actor: { tipo: 'sistema', id: '   ', rol: 'sistema' },
    };
    const ctxSistemaConId: RequestContext = {
      clinicaId: CLINICA_ID,
      actor: { tipo: 'sistema', id: 'worker-recordatorios', rol: 'sistema' },
    };

    const r1 = await servicio.registrar(ctxUsuario, {
      accion: 'creacion',
      entidad: 'turno',
      entidadId: TURNO_ID,
      despues: { estado: 'confirmado' },
      ip: ' 192.168.1.10 ',
    });
    await servicio.registrar(ctxPaciente, {
      accion: 'confirmacion',
      entidad: 'turno',
      entidadId: TURNO_ID,
      ip: '::ffff:127.0.0.1',
    });
    await servicio.registrar(ctxSistemaSinId, {
      accion: 'creacion',
      entidad: 'clinica',
      entidadId: '   ',
      ip: '   ',
    });
    await servicio.registrar(ctxSistemaConId, {
      accion: 'recordatorio',
      entidad: 'notificacion',
      entidadId: NOTIF_ID,
      ip: '2001:db8::1',
    });

    expect(spyInsertar).toHaveBeenCalledTimes(4);
    expect(r1.id).toBe('1');
    expect(ctxUsuario).toEqual({
      clinicaId: CLINICA_ID,
      actor: { tipo: 'usuario', id: 'usr-1', rol: 'recepcionista' },
    });
    expect(insertados[0]).toMatchObject({
      clinicaId: CLINICA_ID,
      actorTipo: 'usuario',
      actorId: 'usr-1',
      entidadId: TURNO_ID,
      ip: '192.168.1.10',
      datosAntes: null,
      datosDespues: { estado: 'confirmado' },
    });
    expect(insertados[1]).toMatchObject({
      actorTipo: 'paciente_enlace',
      actorId: 'tok-9',
      ip: '::ffff:127.0.0.1',
    });
    expect(insertados[2]).toMatchObject({
      actorTipo: 'sistema',
      actorId: null,
      entidadId: null,
      ip: null,
    });
    expect(insertados[3]).toMatchObject({
      actorTipo: 'sistema',
      actorId: 'worker-recordatorios',
      ip: '2001:db8::1',
    });
  });

  it('enmascara datos personales y credenciales en antes y despues sin mutar originales', async () => {
    const { repositorio, insertados } = crearRepositorioFake();
    const servicio = crearAuditoriaService(repositorio);
    const ctx: RequestContext = {
      clinicaId: CLINICA_ID,
      actor: { tipo: 'usuario', id: 'usr-2', rol: 'administrador' },
    };

    const antes = { dni: '30111222', email: 'antes@example.com', activo: true };
    const despues = {
      dni: '30111222',
      email: 'despues@example.com',
      hash_contrasena: 'secret',
      activo: false,
    };

    await servicio.registrar(ctx, {
      accion: 'modificacion',
      entidad: 'paciente',
      entidadId: PACIENTE_ID,
      antes,
      despues,
    });

    expect(insertados[0]?.datosAntes).toEqual({
      dni: '[REDACTADO]',
      email: '[REDACTADO]',
      activo: true,
    });
    expect(insertados[0]?.datosDespues).toEqual({
      dni: '[REDACTADO]',
      email: '[REDACTADO]',
      hash_contrasena: '[REDACTADO]',
      activo: false,
    });
    expect(antes.dni).toBe('30111222');
    expect(despues.hash_contrasena).toBe('secret');
  });

  it('rechaza entradas inválidas con ErrorDeDominio (solicitud_invalida) sin llamar al repositorio ni filtrar PII', async () => {
    const { repositorio, spyInsertar } = crearRepositorioFake();
    const servicio = crearAuditoriaService(repositorio);

    const casos: Array<{
      ctx: RequestContext;
      entrada: { accion: string; entidad: string; entidadId?: string; ip?: string };
    }> = [
      {
        ctx: { clinicaId: 'no-es-uuid', actor: { tipo: 'usuario', id: 'u1', rol: 'admin' } },
        entrada: { accion: 'creacion', entidad: 'turno' },
      },
      {
        ctx: {
          clinicaId: CLINICA_ID,
          actor: { tipo: 'anonimo' as TipoActor, id: 'u1', rol: 'admin' },
        },
        entrada: { accion: 'creacion', entidad: 'turno' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'usuario', id: '   ', rol: 'admin' } },
        entrada: { accion: 'creacion', entidad: 'turno' },
      },
      {
        ctx: {
          clinicaId: CLINICA_ID,
          actor: { tipo: 'paciente_enlace', id: '', rol: 'paciente' },
        },
        entrada: { accion: 'confirmacion', entidad: 'turno' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'Creacion-Invalida', entidad: 'turno' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'creacion', entidad: '30111222' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'creacion', entidad: 'turno', entidadId: '30111222' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'creacion', entidad: 'turno', ip: '999.1.1.1' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'creacion', entidad: 'turno', ip: '127.0.0.1:3000' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'creacion', entidad: 'turno', ip: 'ana@example.com' },
      },
      {
        ctx: { clinicaId: CLINICA_ID, actor: { tipo: 'sistema', id: '', rol: 'sistema' } },
        entrada: { accion: 'creacion', entidad: 'turno', ip: '2001:db8:::1' },
      },
    ];

    for (const { ctx, entrada } of casos) {
      await expect(servicio.registrar(ctx, entrada)).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ErrorDeDominio);
        const e = err as ErrorDeDominio;
        expect(e.tipo).toBe('solicitud_invalida');
        expect(e.message).not.toContain('30111222');
        expect(e.message).not.toContain('ana@example.com');
        return true;
      });
    }

    expect(spyInsertar).not.toHaveBeenCalled();
  });
});
