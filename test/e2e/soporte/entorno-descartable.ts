import { randomBytes } from 'node:crypto';

import { configDeBaseDePrueba } from '../../support/base-de-datos.js';

/*
 * Se ejecuta en cada archivo de prueba e2e antes de cualquier import de la aplicación.
 * Fija el entorno de la app con valores DESCARTABLES generados al azar en cada ejecución: nunca
 * se leen secretos reales (regla dura 13). La base sale de TEST_DATABASE_URL (rol `app`).
 */
const config = configDeBaseDePrueba();
// Se pisa siempre, aunque el entorno o `.env` traiga valores: nunca se usa un secreto real.
process.env.DATABASE_URL = config.testDatabaseUrl as string;
process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET = randomBytes(32).toString('hex');
process.env.ADMIN_INTERNAL_KEY = randomBytes(24).toString('hex');
process.env.LOG_LEVEL = 'info';
