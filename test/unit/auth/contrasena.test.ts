import { describe, expect, it } from 'vitest';

import { hashContrasena, verificarContrasena } from '../../../src/infrastructure/auth/contrasena.js';

describe('hash de contraseñas', () => {
  it('hash + verificación: la contraseña se verifica y la de otra no', async () => {
    const hashGuardado = await hashContrasena('Secreto-123');
    expect(await verificarContrasena(hashGuardado, 'Secreto-123')).toBe(true);
    expect(await verificarContrasena(hashGuardado, 'outro')).toBe(false);
  });
});
