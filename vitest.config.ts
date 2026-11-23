import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// Carga `.env` (si existe) antes de que arranquen los procesos de prueba, para que
// TEST_DATABASE_URL y TEST_DATABASE_MIGRATION_URL no haya que exportarlas a mano.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['test/api/**/*.test.ts'],
        },
      },
    ],
  },
});
