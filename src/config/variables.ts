/**
 * Catálogo de variables de entorno. Es la fuente de `.env.example` y del README:
 * una prueba exige que cada clave del esquema figure aquí y en `.env.example`.
 */
export type Perfil = 'app' | 'migrate' | 'seed' | 'test';

export interface DefinicionVariable {
  readonly nombre: string;
  readonly descripcion: string;
  readonly sensible: boolean;
  /** Perfiles que la exigen. Vacío: opcional (con o sin valor por defecto). */
  readonly requeridaEn: readonly Perfil[];
  /** Valor por defecto documentado. Nunca existe para variables sensibles. */
  readonly porDefecto?: string;
  readonly ejemplo: string;
}

export const VARIABLES: readonly DefinicionVariable[] = [
  {
    nombre: 'NODE_ENV',
    descripcion: 'Entorno de ejecución: development, test o production',
    sensible: false,
    requeridaEn: [],
    porDefecto: 'development',
    ejemplo: 'development',
  },
  {
    nombre: 'PORT',
    descripcion: 'Puerto HTTP del servicio',
    sensible: false,
    requeridaEn: [],
    porDefecto: '3000',
    ejemplo: '3000',
  },
  {
    nombre: 'LOG_LEVEL',
    descripcion: 'Nivel de log: fatal, error, warn, info, debug, trace o silent',
    sensible: false,
    requeridaEn: [],
    porDefecto: 'info',
    ejemplo: 'info',
  },
  {
    nombre: 'DEFAULT_TIMEZONE',
    descripcion: 'Zona horaria IANA por defecto de una clínica nueva',
    sensible: false,
    requeridaEn: [],
    porDefecto: 'America/Argentina/Buenos_Aires',
    ejemplo: 'America/Argentina/Buenos_Aires',
  },
  {
    nombre: 'RATE_LIMIT_PUBLIC',
    descripcion: 'Límite de pedidos de las rutas públicas, con formato <n>/<s|min|h>',
    sensible: false,
    requeridaEn: [],
    porDefecto: '30/min',
    ejemplo: '30/min',
  },
  {
    nombre: 'RATE_LIMIT_GLOBAL',
    descripcion: 'Límite de pedidos global por IP, con formato <n>/<s|min|h>',
    sensible: false,
    requeridaEn: [],
    porDefecto: '120/min',
    ejemplo: '120/min',
  },
  {
    nombre: 'CORS_ALLOWED_ORIGINS',
    descripcion:
      'Orígenes CORS http(s):// permitidos separados por coma (vacío = denegación por defecto, nunca *)',
    sensible: false,
    requeridaEn: [],
    ejemplo: '',
  },
  {
    nombre: 'HTTP_BODY_LIMIT_BYTES',
    descripcion: 'Tamaño máximo de cuerpo HTTP en bytes (entre 1024 y 1048576)',
    sensible: false,
    requeridaEn: [],
    porDefecto: '102400',
    ejemplo: '102400',
  },
  {
    nombre: 'ALLOW_SEED',
    descripcion:
      'Habilita los seeds. Solo el valor exacto "true" los habilita. Nunca en producción',
    sensible: false,
    requeridaEn: [],
    porDefecto: 'false',
    ejemplo: 'false',
  },
  {
    nombre: 'SEED_ALLOWED_HOSTS',
    descripcion: 'Hosts de base de datos donde se permiten los seeds, separados por coma',
    sensible: false,
    requeridaEn: [],
    porDefecto: 'localhost,127.0.0.1,::1',
    ejemplo: 'localhost,127.0.0.1,::1',
  },
  {
    nombre: 'DATABASE_URL',
    descripcion: 'Conexión del rol de la aplicación (sin BYPASSRLS ni propiedad de las tablas)',
    sensible: true,
    requeridaEn: ['app', 'seed'],
    ejemplo: 'postgres://app:CAMBIAR@localhost:5432/turnos',
  },
  {
    nombre: 'DATABASE_MIGRATION_URL',
    descripcion: 'Conexión del rol de migraciones (propietario del esquema)',
    sensible: true,
    requeridaEn: ['migrate'],
    ejemplo: 'postgres://migra:CAMBIAR@localhost:5432/turnos',
  },
  {
    nombre: 'TEST_DATABASE_URL',
    descripcion: 'Conexión del rol de la aplicación para las pruebas de integración (base efímera)',
    sensible: true,
    requeridaEn: ['test'],
    ejemplo: 'postgres://app:CAMBIAR@localhost:5432/turnos_test',
  },
  {
    nombre: 'TEST_DATABASE_MIGRATION_URL',
    descripcion: 'Conexión del rol de migraciones para las pruebas de integración (base efímera)',
    sensible: true,
    requeridaEn: ['test'],
    ejemplo: 'postgres://migra:CAMBIAR@localhost:5432/turnos_test',
  },
  {
    nombre: 'JWT_ACCESS_SECRET',
    descripcion: 'Firma del token de acceso (obligatoria desde C-06)',
    sensible: true,
    requeridaEn: [],
    ejemplo: 'CAMBIAR-por-un-valor-aleatorio-largo',
  },
  {
    nombre: 'JWT_REFRESH_SECRET',
    descripcion: 'Firma del token de refresco (obligatoria desde C-06)',
    sensible: true,
    requeridaEn: [],
    ejemplo: 'CAMBIAR-por-un-valor-aleatorio-largo',
  },
  {
    nombre: 'EMAIL_API_KEY',
    descripcion: 'Clave del proveedor de email (obligatoria desde C-11)',
    sensible: true,
    requeridaEn: [],
    ejemplo: 'CAMBIAR',
  },
  {
    nombre: 'EMAIL_FROM',
    descripcion: 'Remitente de los emails (obligatoria desde C-11)',
    sensible: false,
    requeridaEn: [],
    ejemplo: 'turnos@clinica.example',
  },
  {
    nombre: 'PUBLIC_BASE_URL',
    descripcion: 'Base de los enlaces incluidos en los emails (obligatoria desde C-15)',
    sensible: false,
    requeridaEn: [],
    ejemplo: 'http://localhost:3000',
  },
  {
    nombre: 'ADMIN_INTERNAL_KEY',
    descripcion: 'Clave de servicio del endpoint interno de alta de clínicas (C-17)',
    sensible: true,
    requeridaEn: [],
    ejemplo: 'cambiar-por-una-clave-larga-aleatoria',
  },
];
