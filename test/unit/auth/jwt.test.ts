import { describe, expect, it } from 'vitest';

import { firmarTokenDeAcceso, verificarTokenDeAcceso } from '../../../src/infrastructure/auth/jwt.js';

const SECRET = 'test-secret';

describe('tokens de acceso del personal', () => {
  it('firmar y verificar: el token generado se lee con la clínica, usuario y rol', async () => {
    const token = await firmarTokenDeAcceso(SECRET, {
      clinicaId: '11111111-1111-4111-8111-111111111111',
      usuarioId: '22222222-2222-4222-8222-222222222222',
      rol: 'administrador',
    });
    const contexto = await verificarTokenDeAcceso(SECRET, token);
    expect(contexto).toEqual({
      clinicaId: '11111111-1111-4111-8111-111111111111',
      usuarioId: '22222222-2222-4222-8222-222222222222',
      rol: 'administrador',
    });
  });

  it('verificar con clave errónea devuelve undefined', async () => {
    const token = await firmarTokenDeAcceso(SECRET, {
      clinicaId: '11111111-1111-4111-8111-111111111111',
      usuarioId: '22222222-2222-4222-8222-222222222222',
      rol: 'odontologo',
    });
    expect(await verificarTokenDeAcceso('otra-secret', token)).toBeUndefined();
  });

  it('verificar un token malformado devuelve undefined', async () => {
    expect(await verificarTokenDeAcceso(SECRET, 'not-a-jwt')).toBeUndefined();
  });
});
