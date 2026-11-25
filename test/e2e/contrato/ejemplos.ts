import { operacionesDe, type Contrato } from './comparar.js';

export interface ResultadoDeEjemplos {
  /** Operaciones del contrato a las que corresponden los pedidos del archivo, en orden. */
  readonly operaciones: string[];
  /** Un mensaje por problema, con `archivo:línea` y el ejemplo afectado. */
  readonly problemas: string[];
}

const LINEA_DE_PEDIDO = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/;
const BEARER = /Bearer\s+(\S+)/i;
const CAMPO_SECRETO =
  /"(password|passwordTemporal|clave|claveInterna|codigoVerificacion|token|refreshToken|secret|apiKey)"\s*:\s*"([^"]*)"/g;
const VARIABLE_SECRETA = /^@(\w*(token|clave|password|secret|key)\w*)\s*=\s*(.*)$/i;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const ES_VARIABLE = /^\{\{[^{}]+\}\}$/;

function segmentos(ruta: string): string[] {
  return ruta.split('/').filter((s) => s !== '');
}

/** `/api/v1/pacientes/{{id}}?x=1` → `/api/v1/pacientes/{{id}}` (sin la URL base ni la consulta). */
function rutaDelEjemplo(destino: string): string {
  const sinBase = destino.replace(/^\{\{baseUrl\}\}/, '');
  return sinBase.split('?')[0] ?? sinBase;
}

/** Plantilla del contrato (`/a/{id}`) que corresponde a la ruta del ejemplo, o `undefined`. */
function plantillaDe(ruta: string, plantillas: readonly string[]): string | undefined {
  const partes = segmentos(ruta);
  return plantillas.find((plantilla) => {
    const esperadas = segmentos(plantilla);
    return (
      esperadas.length === partes.length &&
      esperadas.every((s, i) => (s.startsWith('{') && s.endsWith('}') ? true : s === partes[i]))
    );
  });
}

/**
 * Valida un archivo de ejemplos `.http` (formato de REST Client y del HTTP Client de JetBrains):
 * cada pedido debe existir en el contrato y no puede haber credenciales ni datos que no sean
 * sintéticos (spec "Colección de ejemplos validada").
 */
export function analizarEjemplos(
  archivo: string,
  texto: string,
  contrato: Contrato,
): ResultadoDeEjemplos {
  const operaciones = operacionesDe(contrato);
  const plantillasPorMetodo = new Map<string, string[]>();
  for (const nombre of operaciones.keys()) {
    const [metodo = '', ruta = ''] = nombre.split(' ');
    plantillasPorMetodo.set(metodo, [...(plantillasPorMetodo.get(metodo) ?? []), ruta]);
  }

  const resultado: ResultadoDeEjemplos = { operaciones: [], problemas: [] };
  texto.split(/\r?\n/).forEach((linea, indice) => {
    const donde = `${archivo}:${indice + 1}`;

    const pedido = LINEA_DE_PEDIDO.exec(linea);
    if (pedido !== null) {
      const metodo = pedido[1] ?? '';
      const ruta = rutaDelEjemplo(pedido[2] ?? '');
      const plantilla = plantillaDe(ruta, plantillasPorMetodo.get(metodo) ?? []);
      if (plantilla === undefined) {
        const normalizada = segmentos(ruta)
          .map((s) => (s.startsWith('{{') ? '{param}' : s))
          .join('/');
        resultado.problemas.push(
          `${donde}: el ejemplo ${metodo} /${normalizada} no corresponde a ninguna operación del contrato.`,
        );
      } else {
        resultado.operaciones.push(`${metodo} ${plantilla}`);
      }
    }

    if (JWT.test(linea)) {
      resultado.problemas.push(`${donde}: contiene un JWT literal; usá una variable.`);
    }
    const bearer = BEARER.exec(linea);
    if (bearer !== null && !ES_VARIABLE.test(bearer[1] ?? '')) {
      resultado.problemas.push(`${donde}: Bearer con un valor literal; usá {{token}}.`);
    }
    for (const campo of linea.matchAll(CAMPO_SECRETO)) {
      if (!ES_VARIABLE.test(campo[2] ?? '')) {
        resultado.problemas.push(
          `${donde}: el campo ${campo[1] ?? ''} tiene un valor literal; usá una variable {{...}}.`,
        );
      }
    }
    const variable = VARIABLE_SECRETA.exec(linea);
    if (
      variable !== null &&
      (variable[3] ?? '').trim() !== '' &&
      !ES_VARIABLE.test((variable[3] ?? '').trim())
    ) {
      resultado.problemas.push(
        `${donde}: la variable @${variable[1] ?? ''} tiene un valor literal.`,
      );
    }
    for (const email of linea.matchAll(EMAIL)) {
      if (!email[0].endsWith('@ejemplo.invalid')) {
        resultado.problemas.push(
          `${donde}: el email del ejemplo no pertenece al dominio sintético @ejemplo.invalid (campo email).`,
        );
      }
    }
  });
  return resultado;
}
