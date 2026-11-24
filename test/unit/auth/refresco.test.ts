import { describe, expect, it } from 'vitest';

import {
  clinicaDeTokenDeRefresco,
  crearTokenDeRefresco,
} from '../../../src/infrastructure/auth/refresco.js';
import { hashSha256 } from '../../../src/infrastructure/crypto/index.js';

describe('tokens de refresco del personal', () => {
  it('crea un token opaco y su hash: lo que se guarda es hashSha256(token)', () => {
    const clinicaId = '11111111-1111-4111-8111-111111111111';
    const { token, hash, venceEn } = crearTokenDeRefresco(clinicaId);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(10);
    expect(hash).toBe(hashSha256(token));
    expect(venceEn.getTime()).toBeGreaterThan(Date.now());
    expect(clinicaDeTokenDeRefresco(token)).toBe(clinicaId);
  });

  it('tokens distintos para la misma clínica (no se reutilizan)', () => {
    const { token: uno } = crearTokenDeRefresco('11111111-1111-4111-8111-111111111111');
    const { token: dos } = crearTokenDeRefresco('11111111-1111-4111-8111-111111111111');
    expect(uno).not.toBe(dos);
  });

  it('extracción de la clínica con token inválido devuelve undefined', () => {
    expect(clinicaDeTokenDeRefresco('nada-de-nada')).toBeUndefined();
  });
});
