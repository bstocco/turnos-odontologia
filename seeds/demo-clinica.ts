import { Faker, base, es } from '@faker-js/faker';

import type { Config } from '../src/config/index.js';
import {
  crearFechaLocal,
  crearIntervaloOLanzar,
  type FechaLocal,
} from '../src/domain/agenda/index.js';
import { poolDeLaAplicacion } from '../src/infrastructure/db/pool/index.js';
import { crearBloqueoRepository } from '../src/infrastructure/db/repositories/bloqueo/index.js';
import { crearFeriadoRepository } from '../src/infrastructure/db/repositories/feriado/index.js';
import { crearHorarioRepository } from '../src/infrastructure/db/repositories/horario/index.js';
import { crearPacienteRepository } from '../src/infrastructure/db/repositories/paciente/index.js';
import { crearPrestacionRepository } from '../src/infrastructure/db/repositories/prestacion/index.js';
import { crearProfesionalRepository } from '../src/infrastructure/db/repositories/profesional/index.js';
import { crearSillonRepository } from '../src/infrastructure/db/repositories/sillon/index.js';
import { withTenant } from '../src/infrastructure/db/tenant/with-tenant.js';
import { assertNoProduction } from '../src/infrastructure/seed/assert-no-production.js';

/*
 * Seed de la clínica de demostración (C-05, D13). Solo datos INVENTADOS (RN-DA-01):
 *  - nombres y apellidos de faker (locale `es`; faker 10 no trae `es_AR`);
 *  - emails en el dominio reservado `example.com` (RFC 2606);
 *  - DNI en el rango 90000000-99999999 y teléfonos `+54911…`, generados por este módulo: no
 *    corresponden a una persona real y solo se usan en entornos sin envío real (WhatsApp es
 *    manual, el email va a `example.com`).
 * Determinista: semilla fija y ids derivados de ella. Idempotente: si la clínica ya existe, no
 * escribe nada. La salida nunca incluye datos de pacientes (Ley 25.326).
 */

export const ID_CLINICA_DEMO = '0d3a0000-0000-4000-8000-000000000001';
export const SLUG_CLINICA_DEMO = 'clinica-demo';
const NOMBRE_CLINICA_DEMO = 'Clínica de demostración';

const SEMILLA = 20260501;
const CANTIDAD_DE_PACIENTES = 20;
/** Autor sintético de los bloqueos: la tabla `usuario` y su FK llegan con C-12. */
const USUARIO_SINTETICO = '0d3a0000-0000-4000-8000-0000000000ff';

// --- Datos fijos (públicos) -------------------------------------------------------------------

/** Prestaciones de ejemplo del Discovery (discovery/): consulta 30, limpieza 45, conducto 60 min. */
const PRESTACIONES = [
  { nombre: 'Consulta', duracionMinutos: 30 },
  { nombre: 'Limpieza', duracionMinutos: 45 },
  { nombre: 'Tratamiento de conducto', duracionMinutos: 60 },
] as const;

/** Sillón sin buffer y sillón con 10 minutos de limpieza entre turnos (RN-AG-05). */
const SILLONES = [
  { nombre: 'Sillón 1', bufferMinutos: 0 },
  { nombre: 'Sillón 2', bufferMinutos: 10 },
] as const;

/** Feriados nacionales inamovibles de 2026 (calendario público del Ministerio del Interior). */
const FERIADOS_2026 = [
  { fecha: '2026-01-01', descripcion: 'Año Nuevo' },
  { fecha: '2026-03-24', descripcion: 'Día Nacional de la Memoria' },
  { fecha: '2026-04-02', descripcion: 'Día del Veterano y de los Caídos en Malvinas' },
  { fecha: '2026-05-01', descripcion: 'Día del Trabajador' },
  { fecha: '2026-05-25', descripcion: 'Día de la Revolución de Mayo' },
  { fecha: '2026-06-20', descripcion: 'Paso a la Inmortalidad del General Belgrano' },
  { fecha: '2026-07-09', descripcion: 'Día de la Independencia' },
  { fecha: '2026-12-08', descripcion: 'Inmaculada Concepción de María' },
  { fecha: '2026-12-25', descripcion: 'Navidad' },
] as const;

/** Lunes a viernes, 09:00-13:00 y 14:00-18:00 (minutos desde la medianoche local). */
const FRANJAS_LABORALES = [1, 2, 3, 4, 5].flatMap((diaSemana) => [
  { diaSemana, desdeMinutos: 540, hastaMinutos: 780 },
  { diaSemana, desdeMinutos: 840, hastaMinutos: 1080 },
]);

/** Bloqueo del primer profesional: 10-dic-2026 de 12:00 a 13:00 UTC. */
const BLOQUEO_DEMO = {
  inicio: new Date(Date.UTC(2026, 11, 10, 12, 0)),
  fin: new Date(Date.UTC(2026, 11, 10, 13, 0)),
  motivo: 'Capacitación',
} as const;

const OBRAS_SOCIALES = ['Obra Social Demo', 'Prepaga Demo', 'Mutual Demo'] as const;

// --- Generadores ------------------------------------------------------------------------------

function sinTildes(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function fechaLocal(valor: string): FechaLocal {
  const resultado = crearFechaLocal(valor);
  if (!resultado.ok) throw resultado.error;
  return resultado.valor;
}

export interface ResumenSeedDemo {
  readonly creada: boolean;
  readonly conteos: Readonly<Record<string, number>>;
}

const TABLAS_RESUMIDAS = [
  'profesional',
  'horario_atencion',
  'sillon',
  'prestacion',
  'feriado',
  'bloqueo',
  'paciente',
] as const;

/**
 * Carga la clínica de demostración. Las guardas de RN-DA-02 se ejecutan ANTES de abrir ninguna
 * conexión. `log` recibe solo ids, slug y conteos.
 */
export async function ejecutarSeedDemo(
  config: Config,
  log: (linea: string) => void,
): Promise<ResumenSeedDemo> {
  assertNoProduction(config);

  const existente = await poolDeLaAplicacion().query('SELECT id FROM clinica WHERE slug = $1', [
    SLUG_CLINICA_DEMO,
  ]);
  if (existente.rows.length > 0) {
    log(`La clínica de demostración ya existe (slug ${SLUG_CLINICA_DEMO}): no se escribió nada.`);
    return { creada: false, conteos: {} };
  }

  const faker = new Faker({ locale: [es, base] });
  faker.seed(SEMILLA);

  const dnisUsados = new Set<string>();
  const nuevoDni = (): string => {
    let dni = String(faker.number.int({ min: 90_000_000, max: 99_999_999 }));
    while (dnisUsados.has(dni))
      dni = String(faker.number.int({ min: 90_000_000, max: 99_999_999 }));
    dnisUsados.add(dni);
    return dni;
  };
  // `+54911` (celular de Buenos Aires) + abonado de 8 dígitos que no empieza con 0 ni 15 (C-04).
  const nuevoTelefono = (): string =>
    `+54911${faker.string.numeric({ length: 1, exclude: ['0', '1'] })}${faker.string.numeric(7)}`;

  const conteos = await withTenant(ID_CLINICA_DEMO, async (cliente) => {
    await cliente.query('INSERT INTO clinica (id, nombre, slug) VALUES ($1, $2, $3)', [
      ID_CLINICA_DEMO,
      NOMBRE_CLINICA_DEMO,
      SLUG_CLINICA_DEMO,
    ]);
    await cliente.query('INSERT INTO clinica_config (clinica_id) VALUES ($1)', [ID_CLINICA_DEMO]);

    const profesionales = crearProfesionalRepository(cliente);
    const horarios = crearHorarioRepository(cliente);
    const sillones = crearSillonRepository(cliente);
    const prestaciones = crearPrestacionRepository(cliente);
    const feriados = crearFeriadoRepository(cliente);
    const bloqueos = crearBloqueoRepository(cliente);
    const pacientes = crearPacienteRepository(cliente);

    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const profesional = await profesionales.crear({
        id: faker.string.uuid(),
        nombre: faker.person.firstName(),
        apellido: faker.person.lastName(),
        matricula: `MP-DEMO-${i + 1}`,
      });
      await horarios.reemplazarFranjas(profesional.id, FRANJAS_LABORALES);
      ids.push(profesional.id);
    }

    for (const sillon of SILLONES) await sillones.crear({ id: faker.string.uuid(), ...sillon });
    for (const prestacion of PRESTACIONES) {
      await prestaciones.crear({ id: faker.string.uuid(), ...prestacion });
    }
    for (const feriado of FERIADOS_2026) {
      await feriados.crear(fechaLocal(feriado.fecha), feriado.descripcion, faker.string.uuid());
    }

    const primerProfesional = ids[0];
    if (primerProfesional === undefined) throw new Error('No se creó ningún profesional');
    await bloqueos.crear({
      id: faker.string.uuid(),
      profesionalId: primerProfesional,
      intervalo: crearIntervaloOLanzar(BLOQUEO_DEMO.inicio, BLOQUEO_DEMO.fin),
      motivo: BLOQUEO_DEMO.motivo,
      creadoPor: USUARIO_SINTETICO,
    });

    for (let n = 1; n <= CANTIDAD_DE_PACIENTES; n += 1) {
      const nombre = faker.person.firstName();
      const apellido = faker.person.lastName();
      await pacientes.crear({
        id: faker.string.uuid(),
        nombre,
        apellido,
        dni: nuevoDni(),
        telefono: nuevoTelefono(),
        email: `${sinTildes(nombre)}.${sinTildes(apellido)}.${n}@example.com`,
        obraSocial: n % 4 === 0 ? null : OBRAS_SOCIALES[n % OBRAS_SOCIALES.length],
      });
    }

    const resultado: Record<string, number> = {};
    for (const tabla of TABLAS_RESUMIDAS) {
      // `tabla` sale de la lista fija de arriba, nunca de la entrada.
      const { rows } = await cliente.query(`SELECT count(*)::int AS n FROM ${tabla}`);
      resultado[tabla] = Number(rows[0]?.['n']);
    }
    return resultado;
  });

  log(`Clínica de demostración creada: id=${ID_CLINICA_DEMO} slug=${SLUG_CLINICA_DEMO}`);
  for (const [tabla, cantidad] of Object.entries(conteos)) log(`  ${tabla}: ${cantidad}`);
  return { creada: true, conteos };
}
