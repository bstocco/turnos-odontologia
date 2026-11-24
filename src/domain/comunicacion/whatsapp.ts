import { ErrorDeDominio } from '../shared/errores.js';
import { normalizarTelefonoAr } from './telefono.js';

/**
 * Construye un enlace click-to-chat de WhatsApp (`https://wa.me/<numero>?text=...`)
 * normalizando previamente el celular argentino y codificando el mensaje.
 */
export function construirEnlaceWhatsapp(telefono: string, mensaje: string): string {
  const numero = normalizarTelefonoAr(telefono);
  if (mensaje.trim().length === 0) {
    throw new ErrorDeDominio(
      'MENSAJE_VACIO',
      'solicitud_invalida',
      'El mensaje para WhatsApp no puede estar vacío.',
    );
  }

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
