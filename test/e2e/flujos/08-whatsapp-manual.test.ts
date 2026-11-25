import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { operacionesDe, type Contrato } from '../contrato/comparar.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';

/*
 * Flujo 8 de 07_flujos_principales.md: WhatsApp manual (RN-CO, US de comunicación manual).
 *
 * BRECHA (no es un `it.fails` porque no hay comportamiento que ejecutar): `GET /turnos/{id}/
 * enlace-whatsapp` NO EXISTE. C-04 entregó solo el dominio (`src/domain/comunicacion/whatsapp.ts`:
 * normalización del teléfono y plantilla) y C-12 no expuso la ruta. Se reporta al Líder como brecha
 * de C-12/C-04. La guarda avisa el día que la operación aparezca en el contrato: ahí hay que
 * escribir el flujo (teléfono normalizado, error con teléfono ausente o inválido, rol sin acceso).
 */
describe('Flujo 8: WhatsApp manual', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('BRECHA (C-12/C-04): la operación GET /turnos/{id}/enlace-whatsapp no está en el contrato', () => {
    const operaciones = [...operacionesDe(entorno.app.swagger() as unknown as Contrato).keys()];
    expect(
      operaciones.some((o) => o.includes('whatsapp')),
      'apareció la ruta de WhatsApp: escribir el Flujo 8 y quitar esta guarda',
    ).toBe(false);
  });

  it.todo('devuelve un enlace wa.me con el teléfono normalizado y el mensaje de la plantilla');
  it.todo('responde un error de dominio con el teléfono del paciente ausente o inválido');
});
