/**
 * Limite de tasa por clave (IP o email) — conteo dentro de una ventana, por simple que
 * sea: el cliente repite el intento después de la ventana.
 */
export class LimiteDeTasaPorClave {
  private readonly registros = new Map<string, { cuenta: number; finVentana: number }>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  /** true si el intento de la clave supera el límite dentro de la ventana (y lo registra). */
  excedido(clave: string): boolean {
    const ahora = Date.now();
    const registro = this.registros.get(clave);
    if (registro === undefined || registro.finVentana <= ahora) {
      this.registros.set(clave, { cuenta: 1, finVentana: ahora + this.ventanaMs });
      return false;
    }
    if (registro.cuenta >= this.maximo) return true;
    registro.cuenta += 1;
    return false;
  }
}
