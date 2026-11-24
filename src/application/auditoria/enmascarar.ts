/**
 * Enmascaramiento recursivo puro de datos sensibles para auditoría (`Ley 25.326`, `Q1`).
 * Vive en `src/application/auditoria/` para respetar la frontera hexagonal (`eslint.config.mjs`)
 * sin depender de infraestructura de logs ni de base de datos. No muta los objetos originales.
 */
export const MARCADOR_AUDITORIA = '[REDACTADO]';
export const TRUNCADO_AUDITORIA = '[TRUNCADO]';
export const CIRCULAR_AUDITORIA = '[CIRCULAR]';
export const PROFUNDIDAD_MAXIMA_AUDITORIA = 8;

const CAMPOS_PERSONALES: ReadonlySet<string> = new Set([
  'dni',
  'telefono',
  'email',
  'nombre',
  'apellido',
  'obrasocial',
  'nombrepaciente',
  'apellidopaciente',
  'dnipaciente',
  'telefonopaciente',
  'emailpaciente',
  'obrasocialpaciente',
  'pacientenombre',
  'pacienteapellido',
  'pacientedni',
  'pacientetelefono',
  'pacienteemail',
  'pacienteobrasocial',
]);

const PALABRAS_DE_CREDENCIAL: readonly string[] = [
  'contrasena',
  'password',
  'passwd',
  'token',
  // Mantiene `codigo` a secas libre para códigos de error de dominio.
  'codigoverificacion',
  'codigodeverificacion',
  'verificationcode',
  'hashcodigo',
  'authorization',
  'cookie',
  'secret',
  'apikey',
];

const CAMPOS_DE_TEXTO: ReadonlySet<string> = new Set([
  'motivo',
  'mensaje',
  'message',
  'msg',
  'stack',
  'observacion',
  'observaciones',
  'detalle',
  'descripcion',
]);

const PATRON_URL_CON_CREDENCIALES = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi;
const PATRON_BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const PATRON_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PATRON_DNI = /\b\d{7,8}\b/g;

function normalizarClave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Determina si una clave representa un dato personal o una credencial/secreto. */
export function esCampoSensibleAuditoria(nombre: string): boolean {
  const normalizada = normalizarClave(nombre);
  if (CAMPOS_PERSONALES.has(normalizada)) return true;
  return PALABRAS_DE_CREDENCIAL.some((palabra) => normalizada.includes(palabra));
}

/** Sanea correos, DNIs de 7 u 8 dígitos, tokens Bearer y credenciales en URLs de un texto. */
export function limpiarTextoAuditoria(texto: string): string {
  return texto
    .replace(PATRON_URL_CON_CREDENCIALES, `$1${MARCADOR_AUDITORIA}@`)
    .replace(PATRON_BEARER, `Bearer ${MARCADOR_AUDITORIA}`)
    .replace(PATRON_EMAIL, MARCADOR_AUDITORIA)
    .replace(PATRON_DNI, MARCADOR_AUDITORIA);
}

function sanitizarPropiedad(
  clave: string,
  contenido: unknown,
  profundidad: number,
  vistos: WeakSet<object>,
): unknown {
  if (esCampoSensibleAuditoria(clave)) return MARCADOR_AUDITORIA;
  if (typeof contenido === 'string' && CAMPOS_DE_TEXTO.has(normalizarClave(clave))) {
    return limpiarTextoAuditoria(contenido);
  }
  return sanitizarValor(contenido, profundidad + 1, vistos);
}

function sanitizarError(
  error: Error,
  profundidad: number,
  vistos: WeakSet<object>,
): Record<string, unknown> {
  const plano: Record<string, unknown> = {
    type: error.name,
    message: limpiarTextoAuditoria(error.message),
  };
  if (error.stack !== undefined) {
    plano.stack = limpiarTextoAuditoria(error.stack);
  }
  for (const [clave, valor] of Object.entries(error)) {
    if (clave in plano || valor === undefined) continue;
    plano[clave] = sanitizarPropiedad(clave, valor, profundidad, vistos);
  }
  return plano;
}

function sanitizarValor(valor: unknown, profundidad: number, vistos: WeakSet<object>): unknown {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'bigint') return valor.toString();
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'boolean' || typeof valor === 'string') return valor;
  if (typeof valor !== 'object') return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  }
  if (profundidad >= PROFUNDIDAD_MAXIMA_AUDITORIA) return TRUNCADO_AUDITORIA;
  if (vistos.has(valor)) return CIRCULAR_AUDITORIA;

  vistos.add(valor);
  try {
    if (valor instanceof Error) {
      return sanitizarError(valor, profundidad, vistos);
    }
    if (Array.isArray(valor)) {
      return valor.map((elemento) => sanitizarValor(elemento, profundidad + 1, vistos));
    }
    const copia: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor)) {
      if (contenido === undefined) continue;
      copia[clave] = sanitizarPropiedad(clave, contenido, profundidad, vistos);
    }
    return copia;
  } finally {
    // Solo la ruta activa cuenta como ciclo; un objeto compartido en dos ramas es válido.
    vistos.delete(valor);
  }
}

/** Devuelve una copia serializable y enmascarada apta para persistir en `jsonb`. */
export function enmascararDatosAuditoria(entrada: unknown): unknown {
  return sanitizarValor(entrada, 0, new WeakSet<object>());
}
