import { crearEmailSenderFalso } from '../../../src/infrastructure/email/falso-sender.js';

/**
 * Único doble de los flujos de reserva pública (C-15): el proveedor de email, en memoria. Vive en
 * su propio archivo (sin otras dependencias) para que `vi.mock` lo importe sin ciclos.
 */
export const emailFalso = crearEmailSenderFalso();
