/**
 * Redactor de logs (D5). Recorre a cualquier profundidad lo que se registra y reemplaza los
 * datos personales y las credenciales por [REDACTADO]. No muta el objeto original.
 *
 * Criterios:
 * - Nombres de campo comparados sin distinguir mayúsculas ni separadores
 *   (`obra_social`, `obraSocial` y `OBRA-SOCIAL` son el mismo campo).
 * - Datos personales: coincidencia exacta del nombre (evita enmascarar de más).
 * - Credenciales: el nombre CONTIENE la palabra (`accessToken`, `jwtSecret`, `x-api-key`).
 * - En textos de error se enmascaran correos, números de 7 u 8 dígitos (DNI), credenciales en
 *   URLs y tokens Bearer. Es un respaldo de mejor esfuerzo: la regla es no interpolar datos
 *   personales en los mensajes.
 */
export const MARCADOR = '[REDACTADO]';
const TRUNCADO = '[TRUNCADO]';
const CIRCULAR = '[CIRCULAR]';

const CAMPOS_PERSONALES: ReadonlySet<string> = new Set([
  'dni',
  'telefono',
  'email',
  'nombre',
  'apellido',
  'obrasocial',
]);

const PALABRAS_DE_CREDENCIAL: readonly string[] = [
  'contrasena',
  'password',
  'passwd',
  'token',
  // Solo el código de verificación del paciente: `codigo` a secas es el código de error de dominio.
  'codigoverificacion',
  'codigodeverificacion',
  'verificationcode',
  'authorization',
  'cookie',
  'secret',
  'apikey',
];

/** Campos cuyo texto libre se limpia con patrones (mensajes y trazas de error). */
const CAMPOS_DE_TEXTO: ReadonlySet<string> = new Set(['msg', 'message', 'mensaje', 'stack']);

export const PROFUNDIDAD_MAXIMA = 8;

function normalizar(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function esCampoSensible(nombre: string): boolean {
  const n = normalizar(nombre);
  if (CAMPOS_PERSONALES.has(n)) return true;
  return PALABRAS_DE_CREDENCIAL.some((palabra) => n.includes(palabra));
}

const PATRON_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PATRON_DNI = /\b\d{7,8}\b/g;
const PATRON_URL_CON_CREDENCIALES = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi;
const PATRON_BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function limpiarTexto(texto: string): string {
  return texto
    .replace(PATRON_URL_CON_CREDENCIALES, `$1${MARCADOR}@`)
    .replace(PATRON_BEARER, `Bearer ${MARCADOR}`)
    .replace(PATRON_EMAIL, MARCADOR)
    .replace(PATRON_DNI, MARCADOR);
}

function redactarError(error: Error, profundidad: number, vistos: WeakSet<object>): unknown {
  const plano: Record<string, unknown> = {
    type: error.name,
    message: limpiarTexto(error.message),
  };
  if (error.stack !== undefined) plano.stack = limpiarTexto(error.stack);
  for (const [clave, valor] of Object.entries(error)) {
    if (clave in plano) continue;
    plano[clave] = esCampoSensible(clave)
      ? MARCADOR
      : redactarValor(valor, profundidad + 1, vistos);
  }
  return plano;
}

function redactarValor(valor: unknown, profundidad: number, vistos: WeakSet<object>): unknown {
  if (valor === null || typeof valor !== 'object') return valor;
  if (valor instanceof Date) return valor.toISOString();
  if (profundidad >= PROFUNDIDAD_MAXIMA) return TRUNCADO;
  if (vistos.has(valor)) return CIRCULAR;
  vistos.add(valor);

  let resultado: unknown;
  if (valor instanceof Error) {
    resultado = redactarError(valor, profundidad, vistos);
  } else if (Array.isArray(valor)) {
    resultado = valor.map((elemento) => redactarValor(elemento, profundidad + 1, vistos));
  } else {
    const copia: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor)) {
      if (esCampoSensible(clave)) {
        copia[clave] = MARCADOR;
      } else if (typeof contenido === 'string' && CAMPOS_DE_TEXTO.has(normalizar(clave))) {
        copia[clave] = limpiarTexto(contenido);
      } else {
        copia[clave] = redactarValor(contenido, profundidad + 1, vistos);
      }
    }
    resultado = copia;
  }

  // Solo la ruta actual cuenta como ciclo: un mismo objeto repetido en ramas distintas es válido.
  vistos.delete(valor);
  return resultado;
}

/** Devuelve una copia redactada de lo que se va a registrar. */
export function redactar<T>(entrada: T): T {
  return redactarValor(entrada, 0, new WeakSet<object>()) as T;
}
