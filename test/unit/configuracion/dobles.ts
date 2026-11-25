import type {
  ConfiguracionClinica,
  ConfiguracionClinicaPuerto,
  CambiosDeConfiguracion,
  ServicioAuditoria,
  VinculoProfesionalPuerto,
} from '../../../src/application/configuracion/index.js';
import type {
  EntradaAuditoria,
  RegistroAuditoriaCreado,
} from '../../../src/application/auditoria/index.js';
import type { FechaLocal, FranjaAtencion } from '../../../src/domain/agenda/index.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';

export const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
export const ID_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

export function ctxConRol(
  rol: string,
  usuarioId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
): RequestContext {
  return { clinicaId: CLINICA_ID, actor: { tipo: 'usuario', id: usuarioId, rol } };
}

export const CTX_ADMIN = ctxConRol('administrador');
export const CTX_RECEPCION = ctxConRol('recepcionista');
export const CTX_ODONTOLOGO = ctxConRol('odontologo');

export interface EventoRegistrado {
  readonly ctx: RequestContext;
  readonly entrada: EntradaAuditoria;
}

export interface AuditoriaEspia extends ServicioAuditoria {
  readonly eventos: EventoRegistrado[];
}

/** Servicio de auditoría en memoria que guarda lo que se le pide registrar. */
export function auditoriaEspia(opciones: { fallar?: boolean } = {}): AuditoriaEspia {
  const eventos: EventoRegistrado[] = [];
  return {
    eventos,
    async registrar(ctx, entrada): Promise<RegistroAuditoriaCreado> {
      if (opciones.fallar === true) throw new Error('fallo de auditoría simulado');
      eventos.push({ ctx, entrada });
      return {
        id: String(eventos.length),
        clinicaId: ctx.clinicaId,
        ocurrioEn: new Date(0),
        actorTipo: ctx.actor.tipo,
        actorId: ctx.actor.id,
        accion: entrada.accion,
        entidad: entrada.entidad,
        entidadId: entrada.entidadId ?? null,
        datosAntes: entrada.antes ?? null,
        datosDespues: entrada.despues ?? null,
        ip: entrada.ip ?? null,
      };
    },
  };
}

export interface ConfiguracionEnMemoria extends ConfiguracionClinicaPuerto {
  actual: ConfiguracionClinica;
  readonly llamadas: string[];
}

export function configuracionEnMemoria(
  inicial: Partial<ConfiguracionClinica> = {},
): ConfiguracionEnMemoria {
  const llamadas: string[] = [];
  const doble: ConfiguracionEnMemoria = {
    llamadas,
    actual: {
      id: CLINICA_ID,
      nombre: 'Clínica sintética',
      slug: 'clinica-sintetica',
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      reservaRequiereConfirmacion: false,
      cancelacionAnticipacionHoras: 24,
      granularidadMinutos: 15,
      ...inicial,
    },
    async obtener(opciones) {
      llamadas.push(opciones?.bloquear === true ? 'obtener:bloquear' : 'obtener');
      return doble.actual;
    },
    async actualizar(cambios: CambiosDeConfiguracion) {
      llamadas.push('actualizar');
      doble.actual = { ...doble.actual, ...cambios };
      return doble.actual;
    },
  };
  return doble;
}

export interface CatalogoEnMemoria<T extends { id: string }, N, C> {
  readonly items: T[];
  readonly llamadas: string[];
  crear(datos: N): Promise<T>;
  obtenerPorId(id: string): Promise<T | null>;
  listar(): Promise<readonly T[]>;
  actualizar(id: string, cambios: C): Promise<T | null>;
}

/** Catálogo genérico en memoria: el mismo molde sirve para profesionales, sillones y prestaciones. */
export function catalogoEnMemoria<T extends { id: string }, N, C>(opciones: {
  readonly crearDe: (datos: N, id: string) => T;
  readonly aplicar: (actual: T, cambios: C) => T;
  readonly semilla?: readonly T[];
}): CatalogoEnMemoria<T, N, C> {
  const items: T[] = [...(opciones.semilla ?? [])];
  const llamadas: string[] = [];
  return {
    items,
    llamadas,
    async crear(datos) {
      llamadas.push('crear');
      const creado = opciones.crearDe(
        datos,
        `00000000-0000-4000-8000-${String(items.length + 1).padStart(12, '0')}`,
      );
      items.push(creado);
      return creado;
    },
    async obtenerPorId(id) {
      llamadas.push('obtenerPorId');
      return items.find((i) => i.id === id) ?? null;
    },
    async listar() {
      llamadas.push('listar');
      return [...items];
    },
    async actualizar(id, cambios) {
      llamadas.push('actualizar');
      const indice = items.findIndex((i) => i.id === id);
      const actual = items[indice];
      if (actual === undefined) return null;
      const nuevo = opciones.aplicar(actual, cambios);
      items[indice] = nuevo;
      return nuevo;
    },
  };
}

export interface HorariosEnMemoria {
  franjas: Map<string, FranjaAtencion[]>;
  readonly llamadas: string[];
  franjasDeAtencion(profesionalId: string): Promise<readonly FranjaAtencion[]>;
  reemplazarFranjas(profesionalId: string, franjas: readonly FranjaAtencion[]): Promise<void>;
}

export function horariosEnMemoria(
  inicial: Record<string, FranjaAtencion[]> = {},
): HorariosEnMemoria {
  const llamadas: string[] = [];
  const doble: HorariosEnMemoria = {
    franjas: new Map(Object.entries(inicial)),
    llamadas,
    async franjasDeAtencion(profesionalId) {
      llamadas.push('franjasDeAtencion');
      return doble.franjas.get(profesionalId) ?? [];
    },
    async reemplazarFranjas(profesionalId, franjas) {
      llamadas.push('reemplazarFranjas');
      doble.franjas.set(profesionalId, [...franjas]);
    },
  };
  return doble;
}

/** Vínculo usuario -> profesional en memoria. */
export function vinculoEnMemoria(
  vinculos: Record<string, string | null>,
): VinculoProfesionalPuerto & { readonly llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    async profesionalDelUsuario(usuarioId) {
      llamadas.push(usuarioId);
      return vinculos[usuarioId] ?? null;
    },
  };
}

export interface FeriadosEnMemoria {
  readonly items: { id: string; fecha: string; descripcion: string }[];
  readonly llamadas: string[];
  crear(
    fecha: string,
    descripcion: string,
  ): Promise<{ id: string; fecha: FechaLocal; descripcion: string }>;
  eliminar(id: string): Promise<boolean>;
  listar(): Promise<readonly { id: string; fecha: FechaLocal; descripcion: string }[]>;
}

export function feriadosEnMemoria(
  semilla: readonly { id: string; fecha: string; descripcion: string }[] = [],
): FeriadosEnMemoria {
  const items = [...semilla];
  const llamadas: string[] = [];
  return {
    items,
    llamadas,
    async crear(fecha, descripcion) {
      llamadas.push('crear');
      if (items.some((i) => i.fecha === fecha)) throw new Error('duplicado simulado');
      const creado = {
        id: `f0000000-0000-4000-8000-${String(items.length + 1).padStart(12, '0')}`,
        fecha,
        descripcion,
      };
      items.push(creado);
      return creado as { id: string; fecha: FechaLocal; descripcion: string };
    },
    async eliminar(id) {
      llamadas.push('eliminar');
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return false;
      items.splice(i, 1);
      return true;
    },
    async listar() {
      llamadas.push('listar');
      return [...items].sort((a, b) => a.fecha.localeCompare(b.fecha)) as {
        id: string;
        fecha: FechaLocal;
        descripcion: string;
      }[];
    },
  };
}
