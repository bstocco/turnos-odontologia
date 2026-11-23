import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Paquetes de infraestructura y de framework que el dominio y la aplicación no pueden importar.
const paquetesDeInfraestructura = ['pg', 'pg-boss', 'fastify', 'nodemailer', 'argon2', 'jose'].map(
  (name) => ({
    name,
    message: 'Capa hexagonal: este paquete solo puede usarse desde infrastructure/ o interfaces/.',
  }),
);

export default defineConfig(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'openspec/**',
      'knowledge-base/**',
      'docs/**',
      'discovery/**',
      '.claude/**',
      '.agents/**',
      '.atl/**',
      'test/fixtures/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // process.env solo se lee en src/config/ (D2 del diseño).
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Leé el entorno solo desde src/config/ (loadConfig).',
        },
      ],
    },
  },
  {
    // El dominio es TypeScript puro: sin I/O, sin HTTP y sin otras capas.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: paquetesDeInfraestructura,
          patterns: [
            {
              group: ['@fastify/*'],
              message: 'El dominio no puede depender de plugins HTTP.',
            },
            {
              group: ['**/infrastructure/**', '**/interfaces/**', '**/application/**'],
              message: 'El dominio no puede importar infrastructure, interfaces ni application.',
            },
          ],
        },
      ],
    },
  },
  {
    // La aplicación orquesta casos de uso a través de puertos: sin infraestructura ni HTTP.
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: paquetesDeInfraestructura,
          patterns: [
            {
              group: ['@fastify/*'],
              message: 'La aplicación no puede depender de plugins HTTP.',
            },
            {
              group: ['**/infrastructure/**', '**/interfaces/**'],
              message: 'La aplicación usa puertos; no importa infrastructure ni interfaces.',
            },
          ],
        },
      ],
    },
  },
  {
    // Lugares donde sí se permite leer process.env.
    files: ['src/config/**/*.ts', 'test/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: { 'no-restricted-properties': 'off' },
  },
  prettier,
);
