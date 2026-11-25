import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { claveInterna } from '../soporte/clinica.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';

import { configurarEntornoDeReservaPublica } from '../soporte/reserva-publica.js';

import { MATRIZ } from './matriz.js';
import { construirMundo } from './mundo.js';
import type { Actor, FilaDeMatriz, Mundo, PedidoDePrueba, RolDePersonal } from './tipos.js';

// Único doble de la matriz: el proveedor de email de las operaciones públicas (C-15).
vi.mock('../../../src/infrastructure/email/index.js', async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import('../../../src/infrastructure/email/index.js')>();
  const { emailFalso } = await import('../soporte/email-falso.js');
  return { ...original, crearEmailSenderSmtp: () => emailFalso };
});

const ROLES: readonly RolDePersonal[] = ['administrador', 'recepcionista', 'odontologo'];

/** Celdas marcadas como defecto: el resumen final las informa (spec "Diferencias documentadas"). */
const celdasConDefecto: string[] = [];

describe('matriz de permisos: endpoint por actor sobre la API real', () => {
  let entorno: EntornoE2E;
  let mundo: Mundo;

  beforeAll(async () => {
    configurarEntornoDeReservaPublica();
    entorno = await abrirEntorno();
    mundo = await construirMundo(entorno);
  });

  afterAll(async () => {
    if (celdasConDefecto.length > 0) {
      console.info(
        `Celdas marcadas como defecto (it.fails): ${celdasConDefecto.length}\n${celdasConDefecto
          .map((c) => `  - ${c}`)
          .join('\n')}`,
      );
    }
    await entorno.cerrar();
  });

  function ejecutar(pedido: PedidoDePrueba, encabezados?: Record<string, string>) {
    return entorno.inject({
      method: pedido.metodo,
      url: pedido.url,
      ...(encabezados === undefined ? {} : { headers: encabezados }),
      ...(pedido.payload === undefined ? {} : { payload: pedido.payload }),
    });
  }

  function encabezadosDe(actor: Actor): Record<string, string> | undefined {
    if (actor === 'anonimo') return undefined;
    if (actor === 'otra_clinica') return mundo.sesionOtraClinica.encabezados;
    return mundo.sesiones[actor].encabezados;
  }

  /** `it` normal, o `it.fails` con el defecto en el nombre si la celda está marcada. */
  function celda(
    operacion: string,
    fila: FilaDeMatriz,
    actor: Actor,
    nombre: string,
    prueba: () => Promise<void>,
  ): void {
    const marcada =
      fila.defecto !== undefined &&
      (fila.defecto.actores === undefined
        ? actor !== 'anonimo'
        : fila.defecto.actores.includes(actor));
    if (marcada && fila.defecto !== undefined) {
      const titulo = `DEFECTO ${fila.defecto.change} (${fila.defecto.motivo}) — ${nombre}`;
      celdasConDefecto.push(
        `${operacion} / ${actor}: ${fila.defecto.motivo} [${fila.defecto.change}]`,
      );
      it.fails(titulo, prueba);
    } else {
      it(nombre, prueba);
    }
  }

  for (const [operacion, fila] of Object.entries(MATRIZ)) {
    describe(operacion, () => {
      if (fila.tipo === 'personal') {
        celda(operacion, fila, 'anonimo', 'anónimo → 401', async () => {
          const respuesta = await ejecutar(await fila.pedido(mundo));
          expect(respuesta.statusCode).toBe(401);
        });

        for (const rol of ROLES) {
          const esperado = fila.roles?.[rol];
          if (esperado === undefined) throw new Error(`${operacion}: falta el rol ${rol}.`);
          if (esperado === 'prohibido') {
            celda(operacion, fila, rol, `${rol} → 403 ACCESO_PROHIBIDO`, async () => {
              const respuesta = await ejecutar(await fila.pedido(mundo), encabezadosDe(rol));
              expect(respuesta.statusCode).toBe(403);
              expect((respuesta.json() as { codigo: string }).codigo).toBe('ACCESO_PROHIBIDO');
            });
          } else {
            celda(operacion, fila, rol, `${rol} → ${esperado} (ni 401 ni 403)`, async () => {
              const respuesta = await ejecutar(await fila.pedido(mundo), encabezadosDe(rol));
              expect([401, 403]).not.toContain(respuesta.statusCode);
              expect(respuesta.statusCode).toBeLessThan(500);
            });
          }
        }

        if (fila.roles?.odontologo === 'permitido_con_alcance') {
          const alcance = fila.alcance;
          if (alcance === undefined)
            throw new Error(`${operacion}: falta la afirmación de alcance.`);
          celda(operacion, fila, 'odontologo', 'odontólogo: el resultado excluye lo ajeno', () =>
            alcance(mundo),
          );
        }

        if (fila.conId === true) {
          celda(
            operacion,
            fila,
            'otra_clinica',
            'administrador de otra clínica → 404 (nunca 403)',
            async () => {
              const respuesta = await ejecutar(
                await fila.pedido(mundo),
                encabezadosDe('otra_clinica'),
              );
              expect(respuesta.statusCode).toBe(404);
            },
          );
        }
      }

      if (fila.tipo === 'publica') {
        celda(operacion, fila, 'anonimo', 'acceso sin sesión (ni 401 ni 403)', async () => {
          const respuesta = await ejecutar(await fila.pedido(mundo));
          expect([401, 403]).not.toContain(respuesta.statusCode);
          expect(respuesta.statusCode).toBeLessThan(500);
        });
        celda(
          operacion,
          fila,
          'administrador',
          'con token responde lo mismo que sin token',
          async () => {
            const sinToken = await ejecutar(await fila.pedido(mundo));
            const conToken = await ejecutar(
              await fila.pedido(mundo),
              encabezadosDe('administrador'),
            );
            expect(conToken.statusCode).toBe(sinToken.statusCode);
            if (fila.comparacion !== 'estado') expect(conToken.body).toBe(sinToken.body);
          },
        );
      }

      if (fila.tipo === 'interna') {
        celda(operacion, fila, 'anonimo', 'sin clave de servicio → 401', async () => {
          const respuesta = await ejecutar(await fila.pedido(mundo));
          expect(respuesta.statusCode).toBe(401);
        });
        celda(
          operacion,
          fila,
          'administrador',
          'con el token de un administrador (no es la clave) → 401',
          async () => {
            const respuesta = await ejecutar(
              await fila.pedido(mundo),
              encabezadosDe('administrador'),
            );
            expect(respuesta.statusCode).toBe(401);
          },
        );
        celda(operacion, fila, 'anonimo', 'con una clave errónea → 401', async () => {
          const respuesta = await ejecutar(await fila.pedido(mundo), {
            authorization: `Bearer ${claveInterna()}-incorrecta`,
          });
          expect(respuesta.statusCode).toBe(401);
        });
        celda(
          operacion,
          fila,
          'anonimo',
          'con la clave de servicio → permitido (ni 401 ni 403)',
          async () => {
            const respuesta = await ejecutar(await fila.pedido(mundo), {
              authorization: `Bearer ${claveInterna()}`,
            });
            expect([401, 403]).not.toContain(respuesta.statusCode);
            expect(respuesta.statusCode).toBeLessThan(500);
          },
        );
      }
    });
  }
});
