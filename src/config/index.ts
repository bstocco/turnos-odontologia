import Type, { type Static } from 'typebox';
import Value from 'typebox/value';

import { VARIABLES, type Perfil } from './variables.js';

export type { Perfil } from './variables.js';
export { VARIABLES } from './variables.js';

const NIVELES_DE_LOG = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Esquema del entorno. Las claves deben coincidir con VARIABLES y con `.env.example`. */
export const EsquemaEntorno = Type.Object({
  NODE_ENV: Type.Optional(
    Type.Union([Type.Literal('development'), Type.Literal('test'), Type.Literal('production')], {
      default: 'development',
    }),
  ),
  PORT: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535, default: 3000 })),
  LOG_LEVEL: Type.Optional(
    Type.Union(
      NIVELES_DE_LOG.map((n) => Type.Literal(n)),
      { default: 'info' },
    ),
  ),
  DEFAULT_TIMEZONE: Type.Optional(
    Type.String({ minLength: 1, default: 'America/Argentina/Buenos_Aires' }),
  ),
  RATE_LIMIT_PUBLIC: Type.Optional(
    Type.String({ pattern: '^[1-9][0-9]*/(s|min|h)$', default: '30/min' }),
  ),
  ALLOW_SEED: Type.Optional(
    Type.Union([Type.Literal('true'), Type.Literal('false')], { default: 'false' }),
  ),
  SEED_ALLOWED_HOSTS: Type.Optional(
    Type.String({ minLength: 1, default: 'localhost,127.0.0.1,::1' }),
  ),
  DATABASE_URL: Type.Optional(Type.String({ minLength: 1 })),
  DATABASE_MIGRATION_URL: Type.Optional(Type.String({ minLength: 1 })),
  TEST_DATABASE_URL: Type.Optional(Type.String({ minLength: 1 })),
  TEST_DATABASE_MIGRATION_URL: Type.Optional(Type.String({ minLength: 1 })),
  JWT_ACCESS_SECRET: Type.Optional(Type.String({ minLength: 1 })),
  JWT_REFRESH_SECRET: Type.Optional(Type.String({ minLength: 1 })),
  EMAIL_API_KEY: Type.Optional(Type.String({ minLength: 1 })),
  EMAIL_FROM: Type.Optional(Type.String({ minLength: 1 })),
  PUBLIC_BASE_URL: Type.Optional(Type.String({ minLength: 1 })),
  ADMIN_INTERNAL_KEY: Type.Optional(Type.String({ minLength: 1 })),
});

type EntornoValidado = Static<typeof EsquemaEntorno>;

export interface Config {
  readonly perfil: Perfil;
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly logLevel: (typeof NIVELES_DE_LOG)[number];
  readonly defaultTimezone: string;
  readonly rateLimitPublic: string;
  readonly allowSeed: boolean;
  readonly seedAllowedHosts: readonly string[];
  readonly databaseUrl: string | undefined;
  readonly databaseMigrationUrl: string | undefined;
  readonly testDatabaseUrl: string | undefined;
  readonly testDatabaseMigrationUrl: string | undefined;
  readonly jwtAccessSecret: string | undefined;
  readonly jwtRefreshSecret: string | undefined;
  readonly emailApiKey: string | undefined;
  readonly emailFrom: string | undefined;
  readonly publicBaseUrl: string | undefined;
  readonly adminInternalKey: string | undefined;
}

export interface ProblemaDeConfiguracion {
  readonly variable: string;
  readonly motivo: string;
}

/** Error de arranque. Lista nombres de variables y motivos; jamás valores. */
export class ConfigError extends Error {
  readonly problemas: readonly ProblemaDeConfiguracion[];

  constructor(problemas: readonly ProblemaDeConfiguracion[]) {
    const detalle = problemas.map((p) => `  - ${p.variable}: ${p.motivo}`).join('\n');
    super(`Configuración inválida. Variables con problemas:\n${detalle}`);
    this.name = 'ConfigError';
    this.problemas = problemas;
  }

  get variables(): string[] {
    return this.problemas.map((p) => p.variable);
  }
}

const NOMBRES_CONOCIDOS = new Set(VARIABLES.map((v) => v.nombre));
const NOMBRES_SENSIBLES = new Set(VARIABLES.filter((v) => v.sensible).map((v) => v.nombre));

function esZonaIana(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

function esUrlConEsquema(valor: string, esquemas: readonly string[]): boolean {
  try {
    return esquemas.includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

/** Solo toma variables conocidas y trata el texto vacío como ausente. */
function seleccionarEntorno(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const nombre of NOMBRES_CONOCIDOS) {
    const valor = env[nombre];
    if (valor !== undefined && valor.trim() !== '') resultado[nombre] = valor;
  }
  return resultado;
}

function nombreDeInstancia(ruta: string): string {
  return ruta.startsWith('/') ? ruta.slice(1) : ruta;
}

/**
 * Valida el entorno según el perfil. Cada perfil exige solo lo que usa.
 * Lanza ConfigError con nombres y motivos, sin valores.
 */
export function loadConfig(
  perfil: Perfil,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Config {
  const crudo = seleccionarEntorno(env);
  const convertido = Value.Default(EsquemaEntorno, Value.Convert(EsquemaEntorno, crudo));
  const problemas: ProblemaDeConfiguracion[] = [];

  // Una unión de literales emite un error por rama: se informa cada variable una sola vez.
  const yaInformadas = new Set<string>();
  const informar = (variable: string, motivo: string): void => {
    if (yaInformadas.has(variable)) return;
    yaInformadas.add(variable);
    problemas.push({ variable, motivo });
  };

  for (const error of Value.Errors(EsquemaEntorno, convertido)) {
    if (error.keyword === 'required') {
      const faltantes =
        (error.params as { requiredProperties?: string[] }).requiredProperties ?? [];
      for (const variable of faltantes) informar(variable, 'falta');
    } else {
      informar(nombreDeInstancia(error.instancePath), 'valor inválido');
    }
  }
  if (problemas.length > 0) throw new ConfigError(problemas);

  const entorno = convertido as EntornoValidado;

  for (const def of VARIABLES) {
    if (
      def.requeridaEn.includes(perfil) &&
      entorno[def.nombre as keyof EntornoValidado] === undefined
    ) {
      problemas.push({ variable: def.nombre, motivo: 'falta' });
    }
  }

  if (entorno.DEFAULT_TIMEZONE !== undefined && !esZonaIana(entorno.DEFAULT_TIMEZONE)) {
    problemas.push({ variable: 'DEFAULT_TIMEZONE', motivo: 'no es una zona horaria IANA válida' });
  }
  for (const nombre of [
    'DATABASE_URL',
    'DATABASE_MIGRATION_URL',
    'TEST_DATABASE_URL',
    'TEST_DATABASE_MIGRATION_URL',
  ] as const) {
    const valor = entorno[nombre];
    if (valor !== undefined && !esUrlConEsquema(valor, ['postgres:', 'postgresql:'])) {
      problemas.push({ variable: nombre, motivo: 'debe ser una URL postgres://' });
    }
  }
  if (
    entorno.PUBLIC_BASE_URL !== undefined &&
    !esUrlConEsquema(entorno.PUBLIC_BASE_URL, ['http:', 'https:'])
  ) {
    problemas.push({ variable: 'PUBLIC_BASE_URL', motivo: 'debe ser una URL http(s)://' });
  }
  if (problemas.length > 0) throw new ConfigError(problemas);

  return {
    perfil,
    nodeEnv: entorno.NODE_ENV ?? 'development',
    port: entorno.PORT ?? 3000,
    logLevel: entorno.LOG_LEVEL ?? 'info',
    defaultTimezone: entorno.DEFAULT_TIMEZONE ?? 'America/Argentina/Buenos_Aires',
    rateLimitPublic: entorno.RATE_LIMIT_PUBLIC ?? '30/min',
    allowSeed: entorno.ALLOW_SEED === 'true',
    seedAllowedHosts: (entorno.SEED_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,::1')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
    databaseUrl: entorno.DATABASE_URL,
    databaseMigrationUrl: entorno.DATABASE_MIGRATION_URL,
    testDatabaseUrl: entorno.TEST_DATABASE_URL,
    testDatabaseMigrationUrl: entorno.TEST_DATABASE_MIGRATION_URL,
    jwtAccessSecret: entorno.JWT_ACCESS_SECRET,
    jwtRefreshSecret: entorno.JWT_REFRESH_SECRET,
    emailApiKey: entorno.EMAIL_API_KEY,
    emailFrom: entorno.EMAIL_FROM,
    publicBaseUrl: entorno.PUBLIC_BASE_URL,
    adminInternalKey: entorno.ADMIN_INTERNAL_KEY,
  };
}

/** Resumen apto para registrar: las variables sensibles se muestran como [REDACTADO] o se omiten. */
export function describirConfig(config: Config): Record<string, unknown> {
  const sensibles: Record<string, unknown> = {
    databaseUrl: config.databaseUrl,
    databaseMigrationUrl: config.databaseMigrationUrl,
    testDatabaseUrl: config.testDatabaseUrl,
    testDatabaseMigrationUrl: config.testDatabaseMigrationUrl,
    jwtAccessSecret: config.jwtAccessSecret,
    jwtRefreshSecret: config.jwtRefreshSecret,
    emailApiKey: config.emailApiKey,
    adminInternalKey: config.adminInternalKey,
  };
  const resumen: Record<string, unknown> = {
    perfil: config.perfil,
    nodeEnv: config.nodeEnv,
    port: config.port,
    logLevel: config.logLevel,
    defaultTimezone: config.defaultTimezone,
    rateLimitPublic: config.rateLimitPublic,
    allowSeed: config.allowSeed,
    seedAllowedHosts: config.seedAllowedHosts,
    emailFrom: config.emailFrom,
    publicBaseUrl: config.publicBaseUrl,
  };
  for (const [clave, valor] of Object.entries(sensibles)) {
    if (valor !== undefined) resumen[clave] = '[REDACTADO]';
  }
  return resumen;
}

/** Nombres de variables sensibles (para pruebas y documentación). */
export function nombresSensibles(): ReadonlySet<string> {
  return NOMBRES_SENSIBLES;
}

/**
 * Clave de servicio del endpoint interno de alta de clínicas (C-17): variable
 * opcional, sin exigir los valores obligatorios del perfil `app` (ninguna URL).
 */
export function cargarAdminInternalKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const valor = env.ADMIN_INTERNAL_KEY;
  return valor === undefined || valor.trim() === '' ? undefined : valor;
}
