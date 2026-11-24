import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  autorizacion,
  cerrarPool,
  crearAppDePrueba,
  insertarPaciente,
  prepararBaseDePacientes,
} from './soporte.js';

/*
 * Ley 25.326 (regla dura 1): ningún dato personal del paciente llega a los logs de la app,
 * ni siquiera el DNI de `GET /pacientes?dni=…` (el logger descarta la query string).
 */
let app: FastifyInstance;
let logs: Awaited<ReturnType<typeof crearAppDePrueba>>['logs'];
let id: string;

const PROHIBIDOS = [
  '36111222',
  '36.111.222',
  'Zoraida',
  'Quimerica',
  '+5491155556666',
  '5491155556666',
  'zoraida.q@ejemplo.invalid',
  'Prepaga Quimerica',
];

beforeAll(async () => {
  await prepararBaseDePacientes();
  ({ app, logs } = await crearAppDePrueba());
  id = await insertarPaciente(CLINICA_A.id, {
    nombre: 'Zoraida',
    apellido: 'Quimerica',
    dni: '36111222',
    telefono: '+5491155556666',
    email: 'zoraida.q@ejemplo.invalid',
    obraSocial: 'Prepaga Quimerica',
  });
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

describe('datos personales fuera de logs y errores', () => {
  it('búsqueda por DNI, detalle, conflicto 409 y 400 de teléfono no dejan datos en los logs', async () => {
    const headers = await autorizacion('recepcionista', CLINICA_A.id);
    const inicio = logs.lineas.length;

    const busqueda = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes?dni=36111222',
      headers,
    });
    expect(busqueda.statusCode).toBe(200);
    const apellido = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes?apellido=Quimerica',
      headers,
    });
    expect(apellido.statusCode).toBe(200);
    const detalle = await app.inject({ method: 'GET', url: `/api/v1/pacientes/${id}`, headers });
    expect(detalle.statusCode).toBe(200);
    const conflicto = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers,
      payload: {
        nombre: 'Zoraida',
        apellido: 'Quimerica',
        dni: '36.111.222',
        telefono: '011 15 5555-6666',
        email: 'zoraida.q@ejemplo.invalid',
      },
    });
    expect(conflicto.statusCode).toBe(409);
    const telefono = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers,
      payload: { nombre: 'Zoraida', apellido: 'Quimerica', dni: '36111999', telefono: '5556666' },
    });
    expect(telefono.statusCode).toBe(400);

    // Cuerpos de error sin datos del paciente.
    for (const r of [conflicto, telefono]) {
      for (const valor of PROHIBIDOS) expect(r.body).not.toContain(valor);
    }
    // Y los logs de la ejecución capturaron los pedidos (hay líneas) sin ningún valor prohibido.
    const nuevas = logs.lineas.slice(inicio).join('\n');
    expect(logs.lineas.length - inicio).toBeGreaterThanOrEqual(5);
    expect(nuevas).toContain('/api/v1/pacientes');
    for (const valor of PROHIBIDOS) expect(nuevas).not.toContain(valor);
  });
});
