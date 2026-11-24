import { describe, expect, it } from 'vitest';

import type { CryptoComunicacion } from '../../../src/domain/comunicacion/puertos.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import {
  compararEnTiempoConstante,
  cryptoComunicacion,
  generarCodigoNumerico,
  generarTokenAleatorio,
  hashSha256,
} from '../../../src/infrastructure/crypto/index.js';

describe('primitivas criptográficas', () => {
  it('generarTokenAleatorio produce 256 bits en base64url (43 caracteres) sin colisiones', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const token = generarTokenAleatorio();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      tokens.add(token);
    }
    expect(tokens.size).toBe(100);
  });

  it('generarCodigoNumerico genera 6 dígitos por defecto y soporta longitudes válidas [4, 12]', () => {
    expect(generarCodigoNumerico()).toMatch(/^\d{6}$/);
    expect(generarCodigoNumerico(4)).toMatch(/^\d{4}$/);
    expect(generarCodigoNumerico(8)).toMatch(/^\d{8}$/);
    expect(generarCodigoNumerico(12)).toMatch(/^\d{12}$/);
  });

  it.each([3, 13, 0, -1, 6.5, Number.NaN])(
    'generarCodigoNumerico rechaza longitud inválida (%s) con PARAMETRO_INVALIDO',
    (longitudInvalida) => {
      let capturado: unknown;
      try {
        generarCodigoNumerico(longitudInvalida);
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(ErrorDeDominio);
      const errorDominio = capturado as ErrorDeDominio;
      expect(errorDominio.codigo).toBe('PARAMETRO_INVALIDO');
      expect(errorDominio.tipo).toBe('solicitud_invalida');
    },
  );

  it('hashSha256 calcula el digest SHA-256 hex minúscula de forma determinística', () => {
    expect(hashSha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hashSha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const huella = hashSha256('token-sintetico-de-prueba');
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huella).toBe(hashSha256('token-sintetico-de-prueba'));
  });

  it('compararEnTiempoConstante soporta longitudes distintas y UTF-8 multibyte sin lanzar excepción', () => {
    expect(compararEnTiempoConstante('', '')).toBe(true);
    expect(compararEnTiempoConstante('', 'a')).toBe(false);
    expect(compararEnTiempoConstante('secreto-largo', 'secreto-largo')).toBe(true);
    expect(compararEnTiempoConstante('secreto-largo', 'secreto-corto')).toBe(false);
    expect(compararEnTiempoConstante('corto', 'mucho-mas-largo')).toBe(false);
    expect(compararEnTiempoConstante('clínica-ñ-á', 'clínica-ñ-á')).toBe(true);
    expect(compararEnTiempoConstante('clínica-ñ-á', 'clinica-n-a')).toBe(false);
  });

  it('cryptoComunicacion expone el adaptador congelado compatible con el puerto del dominio', () => {
    const adaptador: CryptoComunicacion = cryptoComunicacion;
    expect(Object.isFrozen(adaptador)).toBe(true);

    const token = adaptador.generarTokenAleatorio();
    const hash = adaptador.hashSha256(token);
    expect(adaptador.compararEnTiempoConstante(hash, adaptador.hashSha256(token))).toBe(true);
  });
});
