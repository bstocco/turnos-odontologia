import { describe, expect, it } from 'vitest';

import { normalizarDni, normalizarTelefono } from '../../src/application/pacientes/validaciones.js';

import { pacienteSintetico, rangoDeDniSintetico } from './soporte/datos-sinteticos.js';

describe('datos sintéticos', () => {
  it('el email pertenece al dominio reservado .invalid', () => {
    for (let semilla = 1; semilla <= 20; semilla += 1) {
      expect(pacienteSintetico(semilla).email).toMatch(/@ejemplo\.invalid$/);
    }
  });

  it('el DNI cae en el rango ficticio y la aplicación lo acepta', () => {
    const { minimo, maximo } = rangoDeDniSintetico;
    for (let semilla = 1; semilla <= 20; semilla += 1) {
      const dni = Number(pacienteSintetico(semilla).dni);
      expect(dni).toBeGreaterThanOrEqual(minimo);
      expect(dni).toBeLessThanOrEqual(maximo);
      expect(normalizarDni(pacienteSintetico(semilla).dni)).toBe(pacienteSintetico(semilla).dni);
    }
  });

  it('el teléfono ficticio es un número argentino válido para la aplicación', () => {
    for (let semilla = 1; semilla <= 20; semilla += 1) {
      expect(() => normalizarTelefono(pacienteSintetico(semilla).telefono)).not.toThrow();
    }
  });

  it('es determinista: la misma semilla da los mismos datos', () => {
    expect(pacienteSintetico(7)).toEqual(pacienteSintetico(7));
  });

  it('semillas distintas dan datos distintos (DNI y email únicos)', () => {
    const a = pacienteSintetico(1);
    const b = pacienteSintetico(2);
    expect(a.dni).not.toBe(b.dni);
    expect(a.email).not.toBe(b.email);
    expect(a.apellido === b.apellido && a.nombre === b.nombre).toBe(false);
  });

  it('DNI únicos en un lote amplio de semillas', () => {
    const dnis = new Set<string>();
    for (let semilla = 1; semilla <= 500; semilla += 1) dnis.add(pacienteSintetico(semilla).dni);
    expect(dnis.size).toBe(500);
  });
});
