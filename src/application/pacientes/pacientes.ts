import { conAuditoriaDeCambio, conAuditoriaDeLecturaPaciente } from '../auditoria/index.js';
import type { RequestContext } from '../shared/request-context.js';

import { accesoProhibido, cambiosVacios, recursoNoEncontrado } from './errores.js';
import { ALTA_Y_MODIFICACION, LECTURA, exigirRol } from './permisos.js';
import type {
  CambiosDePacienteDatos,
  DependenciasDePacientes,
  NuevoPacienteDatos,
  PacienteDto,
  PacienteRegistro,
  PacienteResumenDto,
} from './puertos.js';
import {
  normalizarDni,
  normalizarEmail,
  normalizarTelefono,
  validarCriterioDeBusqueda,
} from './validaciones.js';

const ENTIDAD = 'paciente';

export interface NuevoPacienteEntrada {
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email?: string | null | undefined;
  readonly obraSocial?: string | null | undefined;
}

export function aDto(registro: PacienteRegistro): PacienteDto {
  return {
    id: registro.id,
    nombre: registro.nombre,
    apellido: registro.apellido,
    dni: registro.dni,
    telefono: registro.telefono,
    email: registro.email,
    obraSocial: registro.obraSocial,
    creadoEn: registro.creadoEn.toISOString(),
  };
}

/** Normaliza y valida el alta (pura): se invoca antes de abrir la transacción (design D6). */
export function normalizarAlta(entrada: NuevoPacienteEntrada): NuevoPacienteDatos & {
  readonly email: string | null;
  readonly obraSocial: string | null;
} {
  return {
    nombre: entrada.nombre.trim(),
    apellido: entrada.apellido.trim(),
    dni: normalizarDni(entrada.dni),
    telefono: normalizarTelefono(entrada.telefono),
    email: entrada.email == null ? null : normalizarEmail(entrada.email),
    obraSocial: entrada.obraSocial == null ? null : entrada.obraSocial.trim(),
  };
}

/**
 * Alta (design D6/D11). La unicidad del DNI la garantiza la base (409 del repositorio). Se audita
 * con nombres de campo, nunca con valores personales.
 */
export async function crearPaciente(
  deps: DependenciasDePacientes,
  ctx: RequestContext,
  entrada: NuevoPacienteEntrada,
  ip: string | null = null,
): Promise<PacienteDto> {
  exigirRol(ctx, ALTA_Y_MODIFICACION);
  const datos = normalizarAlta(entrada);
  const camposInformados = [
    'nombre',
    'apellido',
    'dni',
    'telefono',
    ...(datos.email === null ? [] : ['email']),
    ...(datos.obraSocial === null ? [] : ['obraSocial']),
  ];
  const creado = await conAuditoriaDeCambio(
    deps.auditoria,
    ctx,
    {
      accion: 'creacion',
      entidad: ENTIDAD,
      antes: null,
      despues: { camposInformados },
      ip,
      extraerEntidadId: (registro: PacienteRegistro) => registro.id,
    },
    () => deps.pacientes.crear(datos),
  );
  return aDto(creado);
}

/** Profesional del odontólogo del contexto; sin vínculo no opera (design D4.1). */
async function profesionalDelOdontologo(
  deps: DependenciasDePacientes,
  ctx: RequestContext,
): Promise<string> {
  const profesionalId = await deps.vinculo.profesionalDelUsuario(ctx.actor.id);
  if (profesionalId === null) throw accesoProhibido();
  return profesionalId;
}

/**
 * Detalle de la ficha (design D3/D4/D11). El odontólogo solo accede a pacientes con turno
 * activo con su profesional; fuera de su alcance es 404 sin auditar (no confirma existencia).
 * Cada lectura entregada queda auditada (`lectura_ficha`, fail-closed).
 */
export async function obtenerPaciente(
  deps: DependenciasDePacientes,
  ctx: RequestContext,
  id: string,
  ip: string | null = null,
): Promise<PacienteDto> {
  exigirRol(ctx, LECTURA);
  const profesionalId =
    ctx.actor.rol === 'odontologo' ? await profesionalDelOdontologo(deps, ctx) : null;
  const ficha = await conAuditoriaDeLecturaPaciente(
    deps.auditoria,
    ctx,
    { pacienteId: id, ip },
    async () => {
      if (
        profesionalId !== null &&
        !(await deps.acceso.esPacienteDeProfesional(id, profesionalId))
      ) {
        return null;
      }
      return deps.pacientes.obtenerPorId(id);
    },
  );
  if (ficha === null || ficha === undefined) throw recursoNoEncontrado();
  return aDto(ficha);
}

export interface CambiosDePacienteEntrada {
  readonly nombre?: string;
  readonly apellido?: string;
  readonly dni?: string;
  readonly telefono?: string;
  /** `null` borra el valor. */
  readonly email?: string | null;
  /** `null` borra el valor. */
  readonly obraSocial?: string | null;
}

const CAMPOS_EDITABLES = ['nombre', 'apellido', 'dni', 'telefono', 'email', 'obraSocial'] as const;

/** Normaliza solo los campos presentes; `undefined` significa "no tocar". */
function normalizarCamposPresentes(entrada: CambiosDePacienteEntrada): CambiosDePacienteDatos {
  const cambios: {
    -readonly [K in keyof CambiosDePacienteDatos]: CambiosDePacienteDatos[K];
  } = {};
  if (entrada.nombre !== undefined) cambios.nombre = entrada.nombre.trim();
  if (entrada.apellido !== undefined) cambios.apellido = entrada.apellido.trim();
  if (entrada.dni !== undefined) cambios.dni = normalizarDni(entrada.dni);
  if (entrada.telefono !== undefined) cambios.telefono = normalizarTelefono(entrada.telefono);
  if (entrada.email !== undefined) {
    cambios.email = entrada.email === null ? null : normalizarEmail(entrada.email);
  }
  if (entrada.obraSocial !== undefined) {
    cambios.obraSocial = entrada.obraSocial === null ? null : entrada.obraSocial.trim();
  }
  return cambios;
}

/** Normaliza y valida los cambios (pura); sin ningún campo, `CAMBIOS_VACIOS` (design D6/D7). */
export function normalizarCambios(entrada: CambiosDePacienteEntrada): CambiosDePacienteDatos {
  const cambios = normalizarCamposPresentes(entrada);
  if (CAMPOS_EDITABLES.every((campo) => cambios[campo] === undefined)) throw cambiosVacios();
  return cambios;
}

/**
 * Modificación parcial (design D6/D11). La auditoría registra los nombres de los campos cuyo
 * valor cambió realmente respecto de la ficha leída antes, nunca los valores.
 */
export async function modificarPaciente(
  deps: DependenciasDePacientes,
  ctx: RequestContext,
  id: string,
  entrada: CambiosDePacienteEntrada,
  ip: string | null = null,
): Promise<PacienteDto> {
  exigirRol(ctx, ALTA_Y_MODIFICACION);
  const cambios = normalizarCambios(entrada);

  const antes = await deps.pacientes.obtenerPorId(id);
  if (antes === null) throw recursoNoEncontrado();

  const actualizado = await conAuditoriaDeCambio(
    deps.auditoria,
    ctx,
    {
      accion: 'modificacion',
      entidad: ENTIDAD,
      entidadId: id,
      antes: null,
      ip,
      extraerDespues: (despues: PacienteRegistro) => ({
        camposModificados: CAMPOS_EDITABLES.filter(
          (campo) => cambios[campo] !== undefined && despues[campo] !== antes[campo],
        ),
      }),
    },
    async () => {
      const resultado = await deps.pacientes.actualizar(id, cambios);
      if (resultado === null) throw recursoNoEncontrado();
      return resultado;
    },
  );
  return aDto(actualizado);
}

export const LIMITE_POR_DEFECTO = 20;

export interface BusquedaEntrada {
  readonly dni?: string | undefined;
  readonly apellido?: string | undefined;
  readonly limite?: number | undefined;
}

function aResumen(registro: PacienteRegistro): PacienteResumenDto {
  return {
    id: registro.id,
    nombre: registro.nombre,
    apellido: registro.apellido,
    dni: registro.dni,
  };
}

/**
 * Búsqueda por exactamente un criterio (design D8). Devuelve solo el resumen mínimo y no audita
 * (Q3). El odontólogo ve únicamente pacientes de su alcance, filtrados en la consulta (D4.3).
 */
export async function buscarPacientes(
  deps: DependenciasDePacientes,
  ctx: RequestContext,
  entrada: BusquedaEntrada,
): Promise<readonly PacienteResumenDto[]> {
  exigirRol(ctx, LECTURA);
  const criterio = validarCriterioDeBusqueda(entrada);
  const limite = entrada.limite ?? LIMITE_POR_DEFECTO;
  const profesionalId =
    ctx.actor.rol === 'odontologo' ? await profesionalDelOdontologo(deps, ctx) : null;

  if (criterio.tipo === 'dni') {
    const encontrado =
      profesionalId === null
        ? await deps.pacientes.buscarPorDni(criterio.dni)
        : await deps.acceso.buscarPorDniDeProfesional(criterio.dni, profesionalId);
    return encontrado === null ? [] : [aResumen(encontrado)];
  }
  const encontrados =
    profesionalId === null
      ? await deps.pacientes.buscarPorApellido(criterio.prefijo, limite)
      : await deps.acceso.buscarPorApellidoDeProfesional(criterio.prefijo, profesionalId, limite);
  return encontrados.map(aResumen);
}
