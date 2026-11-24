import { describe, expect, it } from 'vitest';

import { construirEnlaceWhatsapp } from '../../../src/domain/comunicacion/whatsapp.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

describe('construirEnlaceWhatsapp', () => {
  it('genera enlace wa.me con teléfono normalizado y mensaje codificado con caracteres especiales', () => {
    const mensaje = 'Hola María Ñuñez!\nRecordá tu turno mañana & consulta? #1';
    const url = construirEnlaceWhatsapp('011 15 5555-1234', mensaje);

    expect(url.startsWith('https://wa.me/5491155551234?text=')).toBe(true);
    const textoCodificado = url.slice('https://wa.me/5491155551234?text='.length);
    expect(decodeURIComponent(textoCodificado)).toBe(mensaje);
    expect(url).not.toContain('+');
  });

  it('funciona también con prefijos de interior e internacionales argentinos', () => {
    const url = construirEnlaceWhatsapp('+54 9 351 512-3456', 'Turno confirmado');
    expect(url).toBe('https://wa.me/5493515123456?text=Turno%20confirmado');
  });

  it.each(['', '   ', '\n\t  '])(
    'rechaza mensaje vacío o solo espacios (%j) con MENSAJE_VACIO',
    (vacio) => {
      let capturado: unknown;
      try {
        construirEnlaceWhatsapp('011 15 5555-1234', vacio);
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(ErrorDeDominio);
      const errorDominio = capturado as ErrorDeDominio;
      expect(errorDominio.codigo).toBe('MENSAJE_VACIO');
      expect(errorDominio.tipo).toBe('solicitud_invalida');
    },
  );

  it('rechaza teléfono inválido con TELEFONO_INVALIDO sin exponer el número', () => {
    const telefonoInvalido = '15 9876-5432';
    let capturado: unknown;
    try {
      construirEnlaceWhatsapp(telefonoInvalido, 'Recordatorio de turno');
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    const errorDominio = capturado as ErrorDeDominio;
    expect(errorDominio.codigo).toBe('TELEFONO_INVALIDO');
    expect(errorDominio.tipo).toBe('solicitud_invalida');
    expect(errorDominio.message).not.toContain('9876');
    expect(errorDominio.message).not.toMatch(/\d/);
  });
});
