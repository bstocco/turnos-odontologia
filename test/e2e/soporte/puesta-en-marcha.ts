import { crearClinicaSintetica, crearUsuarioSintetico, type ClinicaSintetica } from './clinica.js';
import type { EntornoE2E } from './entorno.js';
import {
  pacienteSintetico,
  semillaNueva,
  type PacienteSinteticoDatos,
} from './datos-sinteticos.js';
import { proximoDiaHabil, sumarDias, hoyLocal } from './fechas.js';
import { iniciarSesion, type Sesion } from './sesion.js';

export interface ClinicaConfigurada {
  readonly clinica: ClinicaSintetica;
  readonly sesion: Sesion;
  readonly profesionalId: string;
  readonly sillonId: string;
  readonly prestacionId: string;
  readonly pacienteId: string;
  readonly paciente: PacienteSinteticoDatos;
  /** Día hábil futuro sin feriados: el profesional atiende de 09:00 a 13:00 locales. */
  readonly diaConHuecos: string;
  /** Día hábil futuro cargado como feriado de la clínica. */
  readonly diaFeriado: string;
}

/** Pedido autenticado con la sesión del administrador de la clínica; falla si el estado no es el esperado. */
export async function pedirComo<T>(
  entorno: EntornoE2E,
  sesion: Sesion,
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  esperado: number,
  payload?: unknown,
): Promise<T> {
  const respuesta = await entorno.inject({
    method: metodo,
    url,
    headers: sesion.encabezados,
    ...(payload === undefined ? {} : { payload }),
  });
  if (respuesta.statusCode !== esperado) {
    throw new Error(
      `${metodo} ${url} respondió ${respuesta.statusCode} (se esperaba ${esperado}).`,
    );
  }
  return (respuesta.body === '' ? undefined : respuesta.json()) as T;
}

/**
 * Flujo de puesta en marcha por la API: alta interna → configuración de la clínica → profesional
 * con horarios → sillón → prestación → feriados → paciente. Deja una clínica lista para agendar
 * y es la precondición de los Flujos 2 a 10 (spec pruebas-e2e-flujos).
 */
export async function ponerEnMarchaUnaClinica(
  entorno: EntornoE2E,
  flujo: string,
): Promise<ClinicaConfigurada> {
  const clinica = await crearClinicaSintetica(entorno, flujo);
  const admin = await crearUsuarioSintetico(clinica, 'administrador');
  const sesion = await iniciarSesion(entorno, clinica.slug, admin.email, admin.password);

  await pedirComo(entorno, sesion, 'PATCH', '/api/v1/clinica', 200, {
    granularidadMinutos: 30,
    cancelacionAnticipacionHoras: 24,
    reservaRequiereConfirmacion: false,
  });

  const profesional = await pedirComo<{ id: string }>(
    entorno,
    sesion,
    'POST',
    '/api/v1/profesionales',
    201,
    { nombre: 'Profesional', apellido: 'Sintético', matricula: 'MP-0001' },
  );
  const franjas = [1, 2, 3, 4, 5].map((dia) => ({
    diaSemana: dia,
    horaDesde: '09:00',
    horaHasta: '13:00',
  }));
  await pedirComo(entorno, sesion, 'PUT', `/api/v1/profesionales/${profesional.id}/horarios`, 200, {
    franjas,
  });

  const sillon = await pedirComo<{ id: string }>(entorno, sesion, 'POST', '/api/v1/sillones', 201, {
    nombre: 'Sillón 1',
    bufferMinutos: 10,
  });
  const prestacion = await pedirComo<{ id: string }>(
    entorno,
    sesion,
    'POST',
    '/api/v1/prestaciones',
    201,
    { nombre: 'Consulta sintética', duracionMinutos: 30 },
  );

  // La plantilla nacional de un año fijo ejercita el endpoint sin depender del reloj; los días de
  // la prueba se eligen aparte, esquivando cualquier feriado ya cargado.
  await pedirComo(entorno, sesion, 'POST', '/api/v1/feriados/plantilla-nacional', 200, {
    anio: 2026,
  });
  const cargados = await pedirComo<{ fecha: string }[]>(
    entorno,
    sesion,
    'GET',
    '/api/v1/feriados',
    200,
  );
  const ocupadas = new Set(cargados.map((f) => f.fecha));
  const diaConHuecos = proximoDiaHabil(sumarDias(hoyLocal(), 7), ocupadas);
  ocupadas.add(diaConHuecos);
  const diaFeriado = proximoDiaHabil(sumarDias(diaConHuecos, 1), ocupadas);
  await pedirComo(entorno, sesion, 'POST', '/api/v1/feriados', 201, {
    fecha: diaFeriado,
    descripcion: 'Feriado sintético de la clínica',
  });

  const paciente = pacienteSintetico(semillaNueva());
  const creado = await pedirComo<{ id: string }>(
    entorno,
    sesion,
    'POST',
    '/api/v1/pacientes',
    201,
    {
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
      email: paciente.email,
      obraSocial: paciente.obraSocial,
    },
  );

  return {
    clinica,
    sesion,
    profesionalId: profesional.id,
    sillonId: sillon.id,
    prestacionId: prestacion.id,
    pacienteId: creado.id,
    paciente,
    diaConHuecos,
    diaFeriado,
  };
}
