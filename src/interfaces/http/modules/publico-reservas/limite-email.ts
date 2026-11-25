export interface OpcionesLimitePorEmail {
  readonly maximo: number;
  readonly ventanaMs: number;
  readonly capacidad?: number;
  readonly reloj?: () => number;
}

export type ResultadoLimitePorEmail =
  { readonly permitido: true } | { readonly permitido: false; readonly retryAfterSegundos: number };

interface EntradaVentana {
  cuenta: number;
  finVentana: number;
}

const CAPACIDAD_POR_DEFECTO = 10_000;

/**
 * Limitador de tasa por email normalizado con almacén LRU acotado en memoria (`RN-RE-05`, `R-02`).
 * Evita crecimiento no acotado de memoria y frena ráfagas distribuidas sobre el mismo destinatario.
 */
export class LimiteDeTasaPorEmail {
  private readonly registros = new Map<string, EntradaVentana>();
  private readonly maximo: number;
  private readonly ventanaMs: number;
  private readonly capacidad: number;
  private readonly reloj: () => number;

  constructor(opciones: OpcionesLimitePorEmail) {
    if (!Number.isInteger(opciones.maximo) || opciones.maximo < 1) {
      throw new RangeError('maximo debe ser un entero positivo.');
    }
    if (!Number.isFinite(opciones.ventanaMs) || opciones.ventanaMs <= 0) {
      throw new RangeError('ventanaMs debe ser positivo.');
    }
    const capacidad = opciones.capacidad ?? CAPACIDAD_POR_DEFECTO;
    if (!Number.isInteger(capacidad) || capacidad < 1) {
      throw new RangeError('capacidad debe ser un entero positivo.');
    }
    this.maximo = opciones.maximo;
    this.ventanaMs = opciones.ventanaMs;
    this.capacidad = capacidad;
    this.reloj = opciones.reloj ?? (() => Date.now());
  }

  consumir(clave: string): ResultadoLimitePorEmail {
    const ahora = this.reloj();
    const existente = this.registros.get(clave);

    if (existente === undefined || existente.finVentana <= ahora) {
      if (existente !== undefined) {
        this.registros.delete(clave);
      } else if (this.registros.size >= this.capacidad) {
        const masAntigua = this.registros.keys().next().value;
        if (masAntigua !== undefined) {
          this.registros.delete(masAntigua);
        }
      }
      this.registros.set(clave, { cuenta: 1, finVentana: ahora + this.ventanaMs });
      return { permitido: true };
    }

    // Refresca posición LRU sin reiniciar la ventana fija.
    this.registros.delete(clave);
    this.registros.set(clave, existente);

    if (existente.cuenta >= this.maximo) {
      const restanteMs = Math.max(1_000, existente.finVentana - ahora);
      return {
        permitido: false,
        retryAfterSegundos: Math.ceil(restanteMs / 1_000),
      };
    }

    existente.cuenta += 1;
    return { permitido: true };
  }

  tamano(): number {
    return this.registros.size;
  }
}
