import {
  TTL_TOKEN_ACCION_MS,
  normalizarTelefonoAr,
  type PropositoTokenAccion,
} from '../../domain/comunicacion/index.js';

import { datosPublicosInvalidos, dniPublicoInvalido } from './errores.js';
import type { NuevoPacientePublico } from './puertos.js';

const FORMATO_DNI = /^[0-9]{7,8}$/;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORAS_MS = 3_600_000;

export interface EntradaPacienteReserva {
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string;
  readonly obraSocial?: string | null | undefined;
}

/** Normaliza y valida el formato básico del correo electrónico sin interpolar el valor en errores. */
export function normalizarEmailPublico(email: string): string {
  const normalizado = email.trim().toLowerCase();
  if (normalizado.length === 0 || normalizado.length > 254 || !FORMATO_EMAIL.test(normalizado)) {
    throw datosPublicosInvalidos('El email informado no es válido.');
  }
  return normalizado;
}

/** Quita puntos y espacios del DNI y exige 7 u 8 dígitos numéricos. */
export function normalizarDniPublico(dniCrudo: string): string {
  const dni = dniCrudo.replace(/[.\s]/g, '');
  if (!FORMATO_DNI.test(dni)) {
    throw dniPublicoInvalido();
  }
  return dni;
}

function textoObligatorio(valor: string, mensaje: string): string {
  const limpio = valor.trim();
  if (limpio.length === 0) {
    throw datosPublicosInvalidos(mensaje);
  }
  return limpio;
}

function textoOpcional(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const limpio = valor.trim();
  return limpio.length === 0 ? null : limpio;
}

/**
 * Normaliza todos los datos básicos del paciente para reserva pública (`RN-RE-04`, `RN-PA-03`).
 * El teléfono se guarda en formato internacional `+549...`.
 */
export function normalizarDatosPacienteReserva(
  entrada: EntradaPacienteReserva,
): NuevoPacientePublico {
  return {
    nombre: textoObligatorio(entrada.nombre, 'El nombre del paciente es obligatorio.'),
    apellido: textoObligatorio(entrada.apellido, 'El apellido del paciente es obligatorio.'),
    dni: normalizarDniPublico(entrada.dni),
    telefono: `+${normalizarTelefonoAr(entrada.telefono)}`,
    email: normalizarEmailPublico(entrada.email),
    obraSocial: textoOpcional(entrada.obraSocial),
  };
}

/** Calcula `min(ahora + ttlMs, inicioTurno)` para acotar el vencimiento de un token de acción. */
export function calcularVencimientoTokenAccion(
  ahora: Date,
  inicioTurno: Date,
  ttlMs: number = TTL_TOKEN_ACCION_MS,
): Date {
  const limiteTtl = ahora.getTime() + ttlMs;
  return new Date(Math.min(limiteTtl, inicioTurno.getTime()));
}

/** Construye la URL pública de acción limpiando barras finales de `PUBLIC_BASE_URL`. */
export function construirEnlaceAccionPublica(
  publicBaseUrl: string,
  token: string,
  proposito: PropositoTokenAccion,
): string {
  const base = publicBaseUrl.trim().replace(/\/+$/, '');
  if (base.length === 0) {
    throw datosPublicosInvalidos('Falta la URL base pública para construir el enlace.');
  }
  const params = new URLSearchParams({ token, accion: proposito });
  return `${base}/publico/turnos/accion?${params.toString()}`;
}

/**
 * Verifica la regla `RN-RE-02`: un paciente solo puede cancelar online si faltan al menos
 * `anticipacionHoras` horas (inclusive) hasta el inicio del turno.
 */
export function puedeCancelarConAnticipacion(
  ahora: Date,
  inicioTurno: Date,
  anticipacionHoras: number,
): boolean {
  const anticipacionMs = Math.max(0, anticipacionHoras) * HORAS_MS;
  return inicioTurno.getTime() - ahora.getTime() >= anticipacionMs;
}
