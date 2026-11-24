import { describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import {
  ErrorDeAuditoriaPersistencia,
  traducirErrorAuditoriaPg,
} from '../../../src/infrastructure/audit/errores.js';

describe('traducirErrorAuditoriaPg', () => {
  it('mapea 42501 a AUDITORIA_CONTEXTO_INVALIDO (prohibido)', () => {
    const traducido = traducirErrorAuditoriaPg({
      code: '42501',
      message: 'new row violates row-level security policy for table "auditoria"',
    });
    expect(traducido).toBeInstanceOf(ErrorDeDominio);
    expect(traducido).toMatchObject({
      codigo: 'AUDITORIA_CONTEXTO_INVALIDO',
      tipo: 'prohibido',
    });
  });

  it('mapea 23503 a RECURSO_NO_ENCONTRADO y 23514/22P02 a DATOS_INVALIDOS', () => {
    expect(
      traducirErrorAuditoriaPg({ code: '23503', constraint: 'auditoria_clinica_id_fkey' }),
    ).toMatchObject({
      codigo: 'RECURSO_NO_ENCONTRADO',
      tipo: 'no_encontrado',
    });
    expect(
      traducirErrorAuditoriaPg({ code: '23514', constraint: 'auditoria_accion_formato_check' }),
    ).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      tipo: 'solicitud_invalida',
    });
    expect(traducirErrorAuditoriaPg({ code: '22P02' })).toMatchObject({
      codigo: 'DATOS_INVALIDOS',
      tipo: 'solicitud_invalida',
    });
  });

  it('nunca filtra detail ni PII en errores no previstos', () => {
    const original = Object.assign(
      new Error('Fallo interno con DNI 30111222 y email ana@example.com'),
      {
        code: '40001',
        constraint: 'auditoria_otra',
        detail: 'Key (dni, email)=(30111222, ana@example.com) detail leaked',
      },
    );

    const traducido = traducirErrorAuditoriaPg(original);
    expect(traducido).toBeInstanceOf(ErrorDeAuditoriaPersistencia);

    const err = traducido as ErrorDeAuditoriaPersistencia;
    expect(err.sqlstate).toBe('40001');
    expect(err.constraint).toBe('auditoria_otra');
    expect(err.cause).toBeUndefined();

    const serializado = `${JSON.stringify(err)} ${err.message} ${err.stack ?? ''}`;
    expect(serializado).not.toContain('30111222');
    expect(serializado).not.toContain('ana@example.com');
    expect(serializado).not.toContain('detail leaked');
  });

  it('preserva ErrorDeDominio y ErrorDeAuditoriaPersistencia ya traducidos', () => {
    const dominio = new ErrorDeDominio('AUDITORIA_CONTEXTO_INVALIDO', 'prohibido', 'Mensaje');
    const persistencia = new ErrorDeAuditoriaPersistencia('57014', undefined);

    expect(traducirErrorAuditoriaPg(dominio)).toBe(dominio);
    expect(traducirErrorAuditoriaPg(persistencia)).toBe(persistencia);
  });
});
