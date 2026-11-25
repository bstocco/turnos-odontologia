import { describe, expect, it } from 'vitest';

import { capturarLogs } from '../support/app-de-prueba.js';

import { pacienteSintetico } from './soporte/datos-sinteticos.js';
import { afirmarSinDatosPersonales, valoresSensibles } from './soporte/privacidad.js';

function logsCon(...lineas: string[]) {
  const logs = capturarLogs();
  for (const linea of lineas) logs.lineas.push(linea);
  return logs;
}

describe('afirmarSinDatosPersonales', () => {
  const paciente = pacienteSintetico(42);

  it('detecta un DNI sintético inyectado en un log', () => {
    const logs = logsCon(JSON.stringify({ msg: 'alta', dni: paciente.dni }));
    expect(() => afirmarSinDatosPersonales(logs, valoresSensibles(paciente))).toThrow(/dni/);
  });

  it('detecta el teléfono, el email y la obra social', () => {
    for (const campo of ['telefono', 'email', 'obraSocial'] as const) {
      const logs = logsCon(JSON.stringify({ msg: 'x', valor: paciente[campo] }));
      expect(() => afirmarSinDatosPersonales(logs, valoresSensibles(paciente))).toThrow(
        new RegExp(campo),
      );
    }
  });

  it('el mensaje de fallo nombra el campo pero nunca vuelca el valor', () => {
    const logs = logsCon(JSON.stringify({ dni: paciente.dni }));
    try {
      afirmarSinDatosPersonales(logs, valoresSensibles(paciente));
      expect.unreachable('debió fallar');
    } catch (error) {
      expect(String(error)).not.toContain(paciente.dni);
    }
  });

  it('pasa con logs limpios (solo identificadores)', () => {
    const logs = logsCon(
      JSON.stringify({ msg: 'acceso', metodo: 'POST', ruta: '/api/v1/pacientes', estado: 201 }),
      JSON.stringify({ msg: 'ficha', pacienteId: '5f0c1c0e-0000-4000-8000-000000000000' }),
    );
    expect(() => afirmarSinDatosPersonales(logs, valoresSensibles(paciente))).not.toThrow();
  });
});
