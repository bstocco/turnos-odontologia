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
        // C-18: flujos de extremo a extremo, contrato y matriz de permisos. Comparte la base
        // `turnos_test` con `integration`: corre DESPUÉS (groupOrder) y nunca en paralelo.
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          globalSetup: ['test/e2e/soporte/global-setup.ts'],
          setupFiles: ['test/e2e/soporte/entorno-descartable.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['test/api/**/*.test.ts'],
        },
      },
      {
        // C-19: suite de seguridad, cross-tenant, privacidad de logs y postura de BD.
        // Comparte `turnos_test` con `integration` y `e2e`: corre al final (`groupOrder: 2`).
        extends: true,
        test: {
          name: 'security',
          include: ['test/seguridad/**/*.test.ts'],
          globalSetup: ['test/e2e/soporte/global-setup.ts'],
          setupFiles: ['test/e2e/soporte/entorno-descartable.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
