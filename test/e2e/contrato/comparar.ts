/*
 * Comparador PURO de contratos OpenAPI 3 (sin I/O). Clasifica las diferencias entre el contrato
 * base (`main`) y el actual según la spec "Cambios rompientes declarados":
 *
 *  Rompientes: quitar una operación; quitar un código de respuesta; quitar una propiedad de la
 *  respuesta; volver obligatorio un campo de entrada (cuerpo o parámetro); agregar un campo de
 *  entrada obligatorio; cambiar un tipo; achicar un enumerado.
 *  No rompientes: agregar una operación, una respuesta o una propiedad opcional, cambiar textos.
 *
 * Límites asumidos (documentados): quitar una propiedad de la ENTRADA no se marca; en `anyOf`,
 * `oneOf` y `allOf` se comparan las alternativas por posición hasta la menor longitud.
 */

type Json = Record<string, unknown>;

export interface Contrato {
  readonly openapi?: string;
  readonly info?: { readonly title?: string; readonly version?: string };
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, unknown>> };
}

export interface CambioDeContrato {
  readonly rompiente: boolean;
  /** `METODO /ruta` de la operación afectada. */
  readonly operacion: string;
  readonly detalle: string;
}

type Sentido = 'entrada' | 'salida';

const METODOS = ['get', 'put', 'post', 'delete', 'patch'] as const;

function esObjeto(valor: unknown): valor is Json {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

/** Operaciones del contrato indexadas por `METODO /ruta` (sin HEAD ni OPTIONS). */
export function operacionesDe(contrato: Contrato): Map<string, Json> {
  const resultado = new Map<string, Json>();
  for (const [ruta, item] of Object.entries(contrato.paths ?? {})) {
    for (const metodo of METODOS) {
      const operacion = item[metodo];
      if (esObjeto(operacion)) resultado.set(`${metodo.toUpperCase()} ${ruta}`, operacion);
    }
  }
  return resultado;
}

/** Operaciones agregadas, quitadas o con cualquier diferencia de contenido, ordenadas. */
export function operacionesDiferentes(base: Contrato, actual: Contrato): string[] {
  const a = operacionesDe(base);
  const b = operacionesDe(actual);
  const nombres = new Set([...a.keys(), ...b.keys()]);
  return [...nombres]
    .filter((nombre) => JSON.stringify(a.get(nombre)) !== JSON.stringify(b.get(nombre)))
    .sort();
}

class Comparador {
  readonly cambios: CambioDeContrato[] = [];

  constructor(
    private readonly base: Contrato,
    private readonly actual: Contrato,
  ) {}

  comparar(): CambioDeContrato[] {
    const antes = operacionesDe(this.base);
    const despues = operacionesDe(this.actual);
    for (const [nombre, operacionBase] of antes) {
      const operacionActual = despues.get(nombre);
      if (operacionActual === undefined) {
        this.agregar(true, nombre, 'La operación fue quitada.');
        continue;
      }
      this.operacion(nombre, operacionBase, operacionActual);
    }
    for (const nombre of despues.keys()) {
      if (!antes.has(nombre)) this.agregar(false, nombre, 'Operación nueva.');
    }
    return this.cambios;
  }

  private agregar(rompiente: boolean, operacion: string, detalle: string): void {
    this.cambios.push({ rompiente, operacion, detalle });
  }

  private operacion(nombre: string, base: Json, actual: Json): void {
    this.parametros(nombre, base, actual);
    this.cuerpo(nombre, base, actual);
    this.respuestas(nombre, base, actual);
  }

  private parametros(nombre: string, base: Json, actual: Json): void {
    const lista = (op: Json): Json[] =>
      Array.isArray(op.parameters) ? op.parameters.filter(esObjeto) : [];
    const clave = (p: Json): string => `${String(p.in)}:${String(p.name)}`;
    const antes = new Map(lista(base).map((p) => [clave(p), p]));
    for (const parametro of lista(actual)) {
      const previo = antes.get(clave(parametro));
      const obligatorio = parametro.required === true;
      const ubicacion = `parámetro ${String(parametro.in)} '${String(parametro.name)}'`;
      if (previo === undefined) {
        if (obligatorio) this.agregar(true, nombre, `Nuevo ${ubicacion} obligatorio.`);
        continue;
      }
      if (obligatorio && previo.required !== true) {
        this.agregar(true, nombre, `El ${ubicacion} pasa a ser obligatorio.`);
      }
      this.esquema(nombre, ubicacion, previo.schema, parametro.schema, 'entrada');
    }
  }

  private cuerpo(nombre: string, base: Json, actual: Json): void {
    const antes = esObjeto(base.requestBody) ? base.requestBody : undefined;
    const despues = esObjeto(actual.requestBody) ? actual.requestBody : undefined;
    if (despues === undefined) return;
    if (despues.required === true && antes?.required !== true) {
      this.agregar(true, nombre, 'El cuerpo de la solicitud pasa a ser obligatorio.');
    }
    this.esquema(nombre, 'cuerpo', esquemaJson(antes), esquemaJson(despues), 'entrada');
  }

  private respuestas(nombre: string, base: Json, actual: Json): void {
    const antes = esObjeto(base.responses) ? base.responses : {};
    const despues = esObjeto(actual.responses) ? actual.responses : {};
    for (const [codigo, respuesta] of Object.entries(antes)) {
      if (!(codigo in despues)) {
        this.agregar(true, nombre, `Se quitó el código de respuesta ${codigo}.`);
        continue;
      }
      this.esquema(
        nombre,
        `respuesta ${codigo}`,
        esquemaJson(respuesta),
        esquemaJson(despues[codigo]),
        'salida',
      );
    }
    for (const codigo of Object.keys(despues)) {
      if (!(codigo in antes)) this.agregar(false, nombre, `Respuesta ${codigo} nueva.`);
    }
  }

  private resolverEn(contrato: Contrato, esquema: unknown): unknown {
    let actual = esquema;
    for (
      let saltos = 0;
      saltos < 20 && esObjeto(actual) && typeof actual.$ref === 'string';
      saltos += 1
    ) {
      const nombre = actual.$ref.replace('#/components/schemas/', '');
      actual = contrato.components?.schemas?.[nombre];
    }
    return actual;
  }

  private esquema(
    operacion: string,
    ubicacion: string,
    antesCrudo: unknown,
    despuesCrudo: unknown,
    sentido: Sentido,
  ): void {
    const antes = this.resolverEn(this.base, antesCrudo);
    const despues = this.resolverEn(this.actual, despuesCrudo);
    if (!esObjeto(antes) || !esObjeto(despues)) return;

    const tiposAntes = tipos(antes);
    const tiposDespues = tipos(despues);
    if (tiposAntes !== tiposDespues && tiposAntes !== '' && tiposDespues !== '') {
      this.agregar(
        true,
        operacion,
        `Cambió el tipo de ${ubicacion}: ${tiposAntes} a ${tiposDespues}.`,
      );
      return;
    }

    if (Array.isArray(antes.enum) && Array.isArray(despues.enum)) {
      const quitados = antes.enum.filter((v) => !(despues.enum as unknown[]).includes(v));
      if (quitados.length > 0) {
        this.agregar(
          true,
          operacion,
          `Se achicó el enumerado de ${ubicacion}: se quitó ${quitados.map(String).join(', ')}.`,
        );
      }
    }

    if (esObjeto(antes.properties) || esObjeto(despues.properties)) {
      this.propiedades(operacion, ubicacion, antes, despues, sentido);
    }
    if (antes.items !== undefined && despues.items !== undefined) {
      this.esquema(operacion, `${ubicacion}[]`, antes.items, despues.items, sentido);
    }
    for (const combinador of ['anyOf', 'oneOf', 'allOf'] as const) {
      const a = antes[combinador];
      const d = despues[combinador];
      if (Array.isArray(a) && Array.isArray(d)) {
        for (let i = 0; i < Math.min(a.length, d.length); i += 1) {
          this.esquema(operacion, `${ubicacion}.${combinador}[${i}]`, a[i], d[i], sentido);
        }
      }
    }
  }

  private propiedades(
    operacion: string,
    ubicacion: string,
    antes: Json,
    despues: Json,
    sentido: Sentido,
  ): void {
    const propsAntes = esObjeto(antes.properties) ? antes.properties : {};
    const propsDespues = esObjeto(despues.properties) ? despues.properties : {};
    const requeridasAntes = new Set(listaDeTextos(antes.required));
    const requeridasDespues = new Set(listaDeTextos(despues.required));

    for (const [propiedad, esquemaAntes] of Object.entries(propsAntes)) {
      const donde = `${ubicacion}.${propiedad}`;
      if (!(propiedad in propsDespues)) {
        if (sentido === 'salida') {
          this.agregar(true, operacion, `Se quitó la propiedad ${donde} de la respuesta.`);
        }
        continue;
      }
      if (
        sentido === 'entrada' &&
        requeridasDespues.has(propiedad) &&
        !requeridasAntes.has(propiedad)
      ) {
        this.agregar(true, operacion, `El campo de entrada ${donde} pasa a ser obligatorio.`);
      }
      this.esquema(operacion, donde, esquemaAntes, propsDespues[propiedad], sentido);
    }
    for (const propiedad of Object.keys(propsDespues)) {
      if (propiedad in propsAntes) continue;
      const donde = `${ubicacion}.${propiedad}`;
      if (sentido === 'entrada' && requeridasDespues.has(propiedad)) {
        this.agregar(true, operacion, `Nuevo campo de entrada obligatorio ${donde}.`);
      } else {
        this.agregar(false, operacion, `Propiedad nueva ${donde}.`);
      }
    }
  }
}

function listaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

function tipos(esquema: Json): string {
  const t = esquema.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return t.map(String).sort().join('|');
  return '';
}

/** Esquema JSON del cuerpo o de una respuesta (`content['application/json'].schema`). */
function esquemaJson(contenedor: unknown): unknown {
  if (!esObjeto(contenedor) || !esObjeto(contenedor.content)) return undefined;
  const json = contenedor.content['application/json'];
  return esObjeto(json) ? json.schema : undefined;
}

/** Diferencias entre el contrato base y el actual, rompientes o no. */
export function compararContratos(base: Contrato, actual: Contrato): CambioDeContrato[] {
  return new Comparador(base, actual).comparar();
}
