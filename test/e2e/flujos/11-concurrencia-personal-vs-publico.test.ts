import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { sumarDias } from '../soporte/fechas.js';
import { ponerEnMarchaUnaClinica, type ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
import {
  configurarEntornoDeReservaPublica,
  cuerpoDeReserva,
  huecosDelDia,
  obtenerCodigo,
  pacienteNuevo,
  reservar,
} from '../soporte/reserva-publica.js';
import { afirmarDefectoF6, cuerpoDeTurno, sesionDeRecepcion } from '../soporte/turnos.js';
import type { Sesion } from '../soporte/sesion.js';

/*
 * Concurrencia entre la reserva del personal y la reserva pública (C-12 + C-15) sobre el MISMO
 * profesional, sillón y horario. La garantía final es la restricción de exclusión de PostgreSQL:
 * en cada intento exactamente uno gana y el otro recibe un conflicto con código de dominio.
 *
 * - `POST /turnos` (recepción) contra `POST /publico/{slug}/reservas`: hoy `POST /turnos` responde
 *   401 con sesión válida (F6, C-12), así que el escenario se escribe con el comportamiento esperado
 *   y se ejecuta como `it.fails`; la guarda normal avisa el día que C-12 lo corrija.
 * - Mientras tanto la misma carrera se prueba contra el INSERT directo del turno de recepción (lo que
 *   hace la capa de persistencia de C-09) para verificar que la base resuelve el conflicto.
 */
vi.mock('../../../src/infrastructure/email/index.js', async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import('../../../src/infrastructure/email/index.js')>();
  const { emailFalso: falso } = await import('../soporte/email-falso.js');
  return { ...original, crearEmailSenderSmtp: () => falso };
});

const REPETICIONES = 3;

describe('Concurrencia: reserva del personal vs. reserva pública sobre el mismo hueco', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let recepcion: Sesion;
  let huecos: readonly { inicio: string }[];

  beforeAll(async () => {
    configurarEntornoDeReservaPublica();
    entorno = await abrirEntorno();
  });

  /** Clínica nueva por escenario: los turnos de uno no bloquean los huecos del otro. */
  async function prepararClinica(): Promise<void> {
    lista = await ponerEnMarchaUnaClinica(entorno, 'concurrencia');
    recepcion = (await sesionDeRecepcion(entorno, lista)).sesion;
    huecos = await huecosDelDia(
      entorno,
      lista.clinica.slug,
      lista,
      lista.diaConHuecos,
      sumarDias(lista.diaConHuecos, 1),
    );
    // Un hueco por intento, no contiguos para que el buffer del sillón no los acople.
    expect(huecos.length).toBeGreaterThanOrEqual(REPETICIONES * 2);
  }

  afterAll(async () => {
    await entorno.cerrar();
  });

  /** Cantidad de turnos activos que ocupan al profesional en el hueco (consulta con RLS por clínica). */
  async function turnosActivosEn(inicio: string): Promise<number> {
    return withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query<{ cantidad: string }>(
        `SELECT count(*) AS cantidad FROM turno
         WHERE profesional_id = $1 AND inicio = $2
           AND estado IN ('pendiente_confirmacion', 'confirmado')`,
        [lista.profesionalId, inicio],
      );
      return Number(rows[0]?.cantidad);
    });
  }

  /** No hay dos turnos activos solapados del profesional en toda la clínica (garantía final). */
  async function haySolapamientos(): Promise<boolean> {
    return withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT 1 FROM turno a JOIN turno b
           ON a.id < b.id AND a.profesional_id = b.profesional_id
          AND tstzrange(a.inicio, a.fin) && tstzrange(b.inicio, b.fin)
        WHERE a.estado IN ('pendiente_confirmacion', 'confirmado')
          AND b.estado IN ('pendiente_confirmacion', 'confirmado')
        LIMIT 1`,
      );
      return rows.length > 0;
    });
  }

  it('guarda de F6 (C-12): con sesión válida, el módulo turnos responde 401', async () => {
    await prepararClinica();
    await afirmarDefectoF6(entorno, recepcion);
  });

  it.fails(
    'F6: recepción y reserva pública por el mismo hueco en simultáneo: un solo éxito y un 409 por intento',
    async () => {
      await prepararClinica();
      for (let intento = 0; intento < REPETICIONES; intento += 1) {
        const inicio = huecos[intento * 2]!.inicio;
        const paciente = pacienteNuevo();
        const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);

        const [personal, publico] = await Promise.all([
          entorno.inject({
            method: 'POST',
            url: '/api/v1/turnos',
            headers: recepcion.encabezados,
            payload: cuerpoDeTurno(lista, inicio),
          }),
          reservar(entorno, lista.clinica.slug, cuerpoDeReserva(lista, inicio, codigo, paciente)),
        ]);

        const estados = [personal.statusCode, publico.statusCode].sort();
        expect(estados).toEqual([201, 409]);
        const perdedora = personal.statusCode === 409 ? personal : publico;
        expect(['TURNO_SOLAPADO_PROFESIONAL', 'TURNO_SOLAPADO_SILLON']).toContain(
          (perdedora.json() as { codigo: string }).codigo,
        );
        expect(await turnosActivosEn(inicio)).toBe(1);
      }
      expect(await haySolapamientos()).toBe(false);
    },
  );

  it('la base resuelve la carrera: reserva pública vs. turno de recepción insertado por la capa de persistencia, un solo ganador por intento', async () => {
    await prepararClinica();
    for (let intento = 0; intento < REPETICIONES; intento += 1) {
      const inicio = huecos[intento * 2]!.inicio;
      const paciente = pacienteNuevo();
      const codigo = await obtenerCodigo(entorno, lista.clinica.slug, paciente.email);

      const [publico, personal] = await Promise.allSettled([
        reservar(entorno, lista.clinica.slug, cuerpoDeReserva(lista, inicio, codigo, paciente)),
        withTenant(lista.clinica.id, (cliente) =>
          cliente.query(
            `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                                inicio, fin, buffer_minutos, fin_sillon, estado, origen)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::timestamptz,
                     $6::timestamptz + interval '30 minutes', 10,
                     $6::timestamptz + interval '40 minutes', 'confirmado', 'recepcion')`,
            [
              lista.clinica.id,
              lista.pacienteId,
              lista.profesionalId,
              lista.sillonId,
              lista.prestacionId,
              inicio,
            ],
          ),
        ),
      ]);

      // La reserva pública siempre responde (201 o 409 con código de dominio); nunca 5xx.
      expect(publico.status).toBe('fulfilled');
      const respuesta = (publico as PromiseFulfilledResult<Awaited<ReturnType<typeof reservar>>>)
        .value;
      expect([201, 409]).toContain(respuesta.statusCode);
      if (respuesta.statusCode === 409) {
        expect(['TURNO_SOLAPADO_PROFESIONAL', 'TURNO_SOLAPADO_SILLON']).toContain(
          (respuesta.json() as { codigo: string }).codigo,
        );
      }

      // Exactamente uno gana; el insert del personal pierde con la violación de exclusión (23P01).
      const publicoGana = respuesta.statusCode === 201;
      const personalGana = personal.status === 'fulfilled';
      expect(publicoGana !== personalGana).toBe(true);
      if (personal.status === 'rejected') {
        expect((personal.reason as { code?: string }).code).toBe('23P01');
      }
      expect(await turnosActivosEn(inicio)).toBe(1);
    }
    expect(await haySolapamientos()).toBe(false);
  }, 60_000);
});
