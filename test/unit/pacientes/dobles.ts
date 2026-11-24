import type {
  AccesoPacientesPuerto,
  CambiosDePacienteDatos,
  DependenciasDePacientes,
  NuevoPacienteDatos,
  PacienteRegistro,
  PacientesPuerto,
  ServicioAuditoria,
  VinculoProfesionalPuerto,
} from '../../../src/application/pacientes/index.js';
import type { EntradaAuditoria } from '../../../src/application/auditoria/index.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

/* Dobles en memoria y datos sintéticos (regla dura 2). */

export const CLINICA = '11111111-1111-4111-8111-111111111111';
export const ID_PACIENTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ID_OTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ID_PROFESIONAL = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';

export function ctxConRol(rol: string): RequestContext {
  return {
    clinicaId: CLINICA,
    actor: { tipo: 'usuario', id: '33333333-3333-4333-8333-333333333333', rol },
  };
}

export function ficha(sobrescribir: Partial<PacienteRegistro> = {}): PacienteRegistro {
  return {
    id: ID_PACIENTE,
    nombre: 'Lucía',
    apellido: 'Sintética',
    dni: '30111222',
    telefono: '+5491155551234',
    email: 'lucia.sintetica@ejemplo.invalid',
    obraSocial: 'Obra Social Ficticia',
    creadoEn: new Date('2026-01-02T03:04:05.000Z'),
    ...sobrescribir,
  };
}

export interface Llamada {
  readonly puerto: string;
  readonly metodo: string;
  readonly args: readonly unknown[];
}

export interface Dobles {
  readonly deps: DependenciasDePacientes;
  readonly llamadas: Llamada[];
  readonly eventos: EntradaAuditoria[];
  readonly almacen: Map<string, PacienteRegistro>;
  /** Ids de pacientes con turno activo del profesional vinculado. */
  readonly delProfesional: Set<string>;
  vinculo: { profesionalId: string | null };
  falloDeAuditoria: { activo: boolean };
  errorAlCrear: { error: Error | null };
}

export function crearDobles(): Dobles {
  const llamadas: Llamada[] = [];
  const eventos: EntradaAuditoria[] = [];
  const almacen = new Map<string, PacienteRegistro>([[ID_PACIENTE, ficha()]]);
  const delProfesional = new Set<string>();
  const vinculo = { profesionalId: ID_PROFESIONAL as string | null };
  const falloDeAuditoria = { activo: false };
  const errorAlCrear = { error: null as Error | null };
  const anotar = (puerto: string, metodo: string, args: readonly unknown[]): void => {
    llamadas.push({ puerto, metodo, args });
  };

  const pacientes: PacientesPuerto = {
    async crear(datos: NuevoPacienteDatos) {
      anotar('pacientes', 'crear', [datos]);
      if (errorAlCrear.error !== null) throw errorAlCrear.error;
      const creado = ficha({
        id: ID_OTRO,
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni,
        telefono: datos.telefono,
        email: datos.email ?? null,
        obraSocial: datos.obraSocial ?? null,
      });
      almacen.set(creado.id, creado);
      return creado;
    },
    async obtenerPorId(id) {
      anotar('pacientes', 'obtenerPorId', [id]);
      return almacen.get(id) ?? null;
    },
    async buscarPorDni(dni) {
      anotar('pacientes', 'buscarPorDni', [dni]);
      return [...almacen.values()].find((p) => p.dni === dni) ?? null;
    },
    async buscarPorApellido(prefijo, limite) {
      anotar('pacientes', 'buscarPorApellido', [prefijo, limite]);
      return [...almacen.values()].slice(0, limite);
    },
    async actualizar(id, cambios: CambiosDePacienteDatos) {
      anotar('pacientes', 'actualizar', [id, cambios]);
      const actual = almacen.get(id);
      if (actual === undefined) return null;
      const nuevo: PacienteRegistro = { ...actual, ...cambios };
      almacen.set(id, nuevo);
      return nuevo;
    },
  };

  const acceso: AccesoPacientesPuerto = {
    async esPacienteDeProfesional(pacienteId, profesionalId) {
      anotar('acceso', 'esPacienteDeProfesional', [pacienteId, profesionalId]);
      return delProfesional.has(pacienteId);
    },
    async buscarPorDniDeProfesional(dni, profesionalId) {
      anotar('acceso', 'buscarPorDniDeProfesional', [dni, profesionalId]);
      return [...almacen.values()].find((p) => p.dni === dni && delProfesional.has(p.id)) ?? null;
    },
    async buscarPorApellidoDeProfesional(prefijo, profesionalId, limite) {
      anotar('acceso', 'buscarPorApellidoDeProfesional', [prefijo, profesionalId, limite]);
      return [...almacen.values()].filter((p) => delProfesional.has(p.id)).slice(0, limite);
    },
  };

  const vinculoPuerto: VinculoProfesionalPuerto = {
    async profesionalDelUsuario(usuarioId) {
      anotar('vinculo', 'profesionalDelUsuario', [usuarioId]);
      return vinculo.profesionalId;
    },
  };

  const auditoria: ServicioAuditoria = {
    async registrar(_ctx, entrada) {
      anotar('auditoria', 'registrar', [entrada]);
      if (falloDeAuditoria.activo) throw new Error('fallo de auditoría simulado');
      eventos.push(entrada);
      return undefined as never;
    },
  };

  return {
    deps: { pacientes, acceso, vinculo: vinculoPuerto, auditoria },
    llamadas,
    eventos,
    almacen,
    delProfesional,
    vinculo,
    falloDeAuditoria,
    errorAlCrear,
  };
}

export async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorDeDominio) return error.codigo;
    throw error;
  }
  return 'SIN_ERROR';
}
