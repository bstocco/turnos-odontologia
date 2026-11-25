import type { PacienteSinteticoDatos } from './datos-sinteticos.js';
import type { RegistroDeLogs } from './entorno.js';

export type ValoresSensibles = Readonly<Record<string, string>>;

/** Los datos personales de un paciente sintético que no pueden aparecer en logs (Ley 25.326). */
export function valoresSensibles(
  paciente: Pick<PacienteSinteticoDatos, 'dni' | 'telefono' | 'email' | 'obraSocial'>,
): ValoresSensibles {
  return {
    dni: paciente.dni,
    telefono: paciente.telefono,
    email: paciente.email,
    obraSocial: paciente.obraSocial,
  };
}

/**
 * Falla si algún valor sensible aparece en los logs capturados. El mensaje nombra el campo y
 * jamás el valor: la prueba tampoco puede volcar datos personales (spec pruebas-e2e-flujos).
 */
export function afirmarSinDatosPersonales(
  logs: Pick<RegistroDeLogs, 'texto'>,
  valores: ValoresSensibles,
): void {
  const texto = logs.texto();
  const filtrados = Object.entries(valores)
    .filter(([, valor]) => valor !== '' && texto.includes(valor))
    .map(([campo]) => campo);
  if (filtrados.length > 0) {
    throw new Error(`Los logs contienen datos personales: ${filtrados.join(', ')}.`);
  }
}
