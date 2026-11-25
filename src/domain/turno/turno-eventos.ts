import type { TurnoId } from '../shared/ids.js';

/** Eventos de dominio de un turno (C-09); consumidos por C-14. */
export type EventoDeTurno =
  | { readonly tipo: 'creado'; readonly turnoId: TurnoId }
  | { readonly tipo: 'confirmado'; readonly turnoId: TurnoId }
  | { readonly tipo: 'cancelado'; readonly turnoId: TurnoId }
  | { readonly tipo: 'reprogramado'; readonly turnoId: TurnoId };

/**
 * Puerto para los eventos de dominio (C-09). Implementación nula por defecto, consumida
 * por C-14.
 */
export interface TurnoEventPublisher {
  publicar(evento: EventoDeTurno): void | Promise<void>;
}

/** Implementación nula por defecto (C-14): eventos descartados. */
export function turnoEventPublisherNulo(): TurnoEventPublisher {
  return {
    publicar() {
      /* nulo */
    },
  };
}
