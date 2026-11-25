import { randomBytes } from 'node:crypto';

import { pacienteSintetico, semillaNueva } from '../soporte/datos-sinteticos.js';
import { sumarDias } from '../soporte/fechas.js';

import type { Defecto, Esperado, FilaDeMatriz, RolDePersonal } from './tipos.js';

/*
 * Matriz de permisos: una fila por operación registrada (`METODO /ruta`, como en el contrato) y,
 * por actor, el resultado esperado según `03_actores_y_roles.md §RBAC`. NUNCA se cambia un valor
 * esperado para que pase: una celda que difiere se marca con `defecto` (se ejecuta como
 * `it.fails` y avisa el día que se corrija).
 *
 * El RBAC vive dentro de cada handler, no en la configuración de la ruta, por eso la matriz se
 * declara y se EJECUTA contra la API real; la prueba de completitud impide olvidar un endpoint.
 */

type Roles = Readonly<Record<RolDePersonal, Esperado>>;

/** Lectura de catálogos de la clínica: R para los tres roles. */
const TODOS: Roles = {
  administrador: 'permitido',
  recepcionista: 'permitido',
  odontologo: 'permitido',
};
/** Configuración y usuarios: solo el administrador (C U D). */
const SOLO_ADMIN: Roles = {
  administrador: 'permitido',
  recepcionista: 'prohibido',
  odontologo: 'prohibido',
};
/** Pacientes (C R U): administrador y recepcionista; el odontólogo no crea ni modifica. */
const ADMIN_Y_RECEPCION: Roles = {
  administrador: 'permitido',
  recepcionista: 'permitido',
  odontologo: 'prohibido',
};
/** Pacientes (R): el odontólogo solo los de sus turnos. */
const LECTURA_DE_PACIENTES: Roles = {
  administrador: 'permitido',
  recepcionista: 'permitido',
  odontologo: 'permitido_con_alcance',
};

const API = '/api/v1';

/**
 * F1 (C-06): el módulo `usuarios` no autentica; `request.userContext` nunca se completa y todo
 * pedido autenticado responde 401. Se informa al Líder; no se corrige en C-18.
 */
const F1: Defecto = {
  change: 'C-06',
  motivo:
    'F1: el módulo usuarios no registra la autenticación y responde 401 incluso al administrador',
};

const conAnio = (anio: number): string => `?anio=${anio}`;

export const MATRIZ: Readonly<Record<string, FilaDeMatriz>> = {
  // --- Raíz y autenticación ------------------------------------------------------------------
  'GET /salud': {
    tipo: 'publica',
    pedido: async () => ({ metodo: 'GET', url: '/salud' }),
  },
  [`POST ${API}/auth/login`]: {
    tipo: 'publica',
    comparacion: 'estado',
    pedido: async (m) => ({
      metodo: 'POST',
      url: `${API}/auth/login`,
      payload: await m.credencialesDeLogin(),
    }),
  },
  [`POST ${API}/auth/refresh`]: {
    tipo: 'publica',
    comparacion: 'estado',
    pedido: async (m) => ({
      metodo: 'POST',
      url: `${API}/auth/refresh`,
      payload: { token: await m.refrescoNuevo() },
    }),
  },
  [`POST ${API}/auth/logout`]: {
    tipo: 'publica',
    comparacion: 'estado',
    pedido: async (m) => ({
      metodo: 'POST',
      url: `${API}/auth/logout`,
      payload: { token: await m.refrescoNuevo() },
    }),
  },
  [`POST ${API}/interno/clinicas`]: {
    tipo: 'interna',
    pedido: async () => {
      const sufijo = randomBytes(4).toString('hex');
      return {
        metodo: 'POST',
        url: `${API}/interno/clinicas`,
        payload: {
          slug: `e2e-matriz-${sufijo}`,
          nombre: `Clínica sintética matriz ${sufijo}`,
          email: `inicial.${sufijo}@ejemplo.invalid`,
        },
      };
    },
  },

  // --- Clínica ---------------------------------------------------------------------------------
  [`GET ${API}/clinica`]: {
    tipo: 'personal',
    roles: TODOS,
    pedido: async () => ({ metodo: 'GET', url: `${API}/clinica` }),
  },
  [`PATCH ${API}/clinica`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    pedido: async () => ({
      metodo: 'PATCH',
      url: `${API}/clinica`,
      payload: { cancelacionAnticipacionHoras: 24 },
    }),
  },

  // --- Profesionales y horarios ------------------------------------------------------------------
  [`GET ${API}/profesionales`]: {
    tipo: 'personal',
    roles: TODOS,
    pedido: async () => ({ metodo: 'GET', url: `${API}/profesionales` }),
  },
  [`POST ${API}/profesionales`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    pedido: async () => ({
      metodo: 'POST',
      url: `${API}/profesionales`,
      payload: { nombre: 'Matriz', apellido: 'Sintético' },
    }),
  },
  [`GET ${API}/profesionales/{id}`]: {
    tipo: 'personal',
    roles: TODOS,
    conId: true,
    pedido: async (m) => ({ metodo: 'GET', url: `${API}/profesionales/${m.a.profesionalId}` }),
  },
  [`PATCH ${API}/profesionales/{id}`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    pedido: async (m) => ({
      metodo: 'PATCH',
      url: `${API}/profesionales/${await m.nuevo.profesional()}`,
      payload: { apellido: 'Modificado' },
    }),
  },
  [`GET ${API}/profesionales/{id}/horarios`]: {
    tipo: 'personal',
    // 03 §RBAC: horarios "R (propios)" para el odontólogo.
    roles: {
      administrador: 'permitido',
      recepcionista: 'permitido',
      odontologo: 'permitido_con_alcance',
    },
    conId: true,
    pedido: async (m) => ({
      metodo: 'GET',
      url: `${API}/profesionales/${m.a.profesionalId}/horarios`,
    }),
    alcance: async (m) => {
      const respuesta = await m.entorno.inject({
        method: 'GET',
        url: `${API}/profesionales/${m.profesionalAjenoId}/horarios`,
        headers: m.sesiones.odontologo.encabezados,
      });
      if (![403, 404].includes(respuesta.statusCode)) {
        throw new Error(`El odontólogo obtuvo horarios ajenos (estado ${respuesta.statusCode}).`);
      }
    },
  },
  [`PUT ${API}/profesionales/{id}/horarios`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    pedido: async (m) => ({
      metodo: 'PUT',
      url: `${API}/profesionales/${await m.nuevo.profesional()}/horarios`,
      payload: { franjas: [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' }] },
    }),
  },

  // --- Sillones --------------------------------------------------------------------------------
  [`GET ${API}/sillones`]: {
    tipo: 'personal',
    roles: TODOS,
    pedido: async () => ({ metodo: 'GET', url: `${API}/sillones` }),
  },
  [`POST ${API}/sillones`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    pedido: async () => ({
      metodo: 'POST',
      url: `${API}/sillones`,
      payload: { nombre: `Sillón matriz ${randomBytes(3).toString('hex')}` },
    }),
  },
  [`GET ${API}/sillones/{id}`]: {
    tipo: 'personal',
    roles: TODOS,
    conId: true,
    pedido: async (m) => ({ metodo: 'GET', url: `${API}/sillones/${m.a.sillonId}` }),
  },
  [`PATCH ${API}/sillones/{id}`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    pedido: async (m) => ({
      metodo: 'PATCH',
      url: `${API}/sillones/${await m.nuevo.sillon()}`,
      payload: { bufferMinutos: 5 },
    }),
  },

  // --- Prestaciones ----------------------------------------------------------------------------
  [`GET ${API}/prestaciones`]: {
    tipo: 'personal',
    roles: TODOS,
    pedido: async () => ({ metodo: 'GET', url: `${API}/prestaciones` }),
  },
  [`POST ${API}/prestaciones`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    pedido: async () => ({
      metodo: 'POST',
      url: `${API}/prestaciones`,
      payload: {
        nombre: `Prestación matriz ${randomBytes(3).toString('hex')}`,
        duracionMinutos: 45,
      },
    }),
  },
  [`GET ${API}/prestaciones/{id}`]: {
    tipo: 'personal',
    roles: TODOS,
    conId: true,
    pedido: async (m) => ({ metodo: 'GET', url: `${API}/prestaciones/${m.a.prestacionId}` }),
  },
  [`PATCH ${API}/prestaciones/{id}`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    pedido: async (m) => ({
      metodo: 'PATCH',
      url: `${API}/prestaciones/${await m.nuevo.prestacion()}`,
      payload: { duracionMinutos: 60 },
    }),
  },

  // --- Feriados --------------------------------------------------------------------------------
  [`GET ${API}/feriados`]: {
    tipo: 'personal',
    roles: TODOS,
    pedido: async () => ({ metodo: 'GET', url: `${API}/feriados` }),
  },
  [`POST ${API}/feriados`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    pedido: async (m) => ({
      metodo: 'POST',
      url: `${API}/feriados`,
      payload: { fecha: m.nuevo.fechaDeFeriado(), descripcion: 'Feriado sintético de la matriz' },
    }),
  },
  [`DELETE ${API}/feriados/{id}`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    pedido: async (m) => ({
      metodo: 'DELETE',
      url: `${API}/feriados/${await m.nuevo.feriado()}`,
    }),
  },
  [`GET ${API}/feriados/plantilla-nacional`]: {
    tipo: 'personal',
    roles: TODOS,
    pedido: async () => ({
      metodo: 'GET',
      url: `${API}/feriados/plantilla-nacional${conAnio(2026)}`,
    }),
  },
  [`POST ${API}/feriados/plantilla-nacional`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    pedido: async () => ({
      metodo: 'POST',
      url: `${API}/feriados/plantilla-nacional`,
      payload: { anio: 2026 },
    }),
  },

  // --- Pacientes -------------------------------------------------------------------------------
  [`GET ${API}/pacientes`]: {
    tipo: 'personal',
    roles: LECTURA_DE_PACIENTES,
    pedido: async (m) => ({
      metodo: 'GET',
      url: `${API}/pacientes?dni=${m.pacienteDelOdontologo.dni}`,
    }),
    alcance: async (m) => {
      const respuesta = await m.entorno.inject({
        method: 'GET',
        url: `${API}/pacientes?dni=${m.pacienteAjeno.dni}`,
        headers: m.sesiones.odontologo.encabezados,
      });
      if (respuesta.statusCode !== 200 || (respuesta.json() as unknown[]).length !== 0) {
        throw new Error('El odontólogo obtuvo pacientes que no tienen turnos con él.');
      }
    },
  },
  [`POST ${API}/pacientes`]: {
    tipo: 'personal',
    roles: ADMIN_Y_RECEPCION,
    pedido: async () => {
      const datos = pacienteSintetico(semillaNueva());
      return {
        metodo: 'POST',
        url: `${API}/pacientes`,
        payload: {
          nombre: datos.nombre,
          apellido: datos.apellido,
          dni: datos.dni,
          telefono: datos.telefono,
        },
      };
    },
  },
  [`GET ${API}/pacientes/{id}`]: {
    tipo: 'personal',
    roles: LECTURA_DE_PACIENTES,
    conId: true,
    pedido: async (m) => ({
      metodo: 'GET',
      url: `${API}/pacientes/${m.pacienteDelOdontologo.id}`,
    }),
    alcance: async (m) => {
      const respuesta = await m.entorno.inject({
        method: 'GET',
        url: `${API}/pacientes/${m.pacienteAjeno.id}`,
        headers: m.sesiones.odontologo.encabezados,
      });
      if (respuesta.statusCode !== 404) {
        throw new Error(
          `El odontólogo no debe obtener fichas ajenas (estado ${respuesta.statusCode}).`,
        );
      }
    },
  },
  [`PATCH ${API}/pacientes/{id}`]: {
    tipo: 'personal',
    roles: ADMIN_Y_RECEPCION,
    conId: true,
    pedido: async (m) => ({
      metodo: 'PATCH',
      url: `${API}/pacientes/${await m.nuevo.paciente()}`,
      payload: { obraSocial: 'Obra social sintética' },
    }),
  },

  // --- Usuarios (F1) -----------------------------------------------------------------------------
  [`GET ${API}/usuarios`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    defecto: F1,
    pedido: async () => ({ metodo: 'GET', url: `${API}/usuarios` }),
  },
  [`POST ${API}/usuarios`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    defecto: F1,
    pedido: async () => ({
      metodo: 'POST',
      url: `${API}/usuarios`,
      payload: {
        email: `nuevo.${randomBytes(4).toString('hex')}@ejemplo.invalid`,
        password: randomBytes(12).toString('base64url'),
        rol: 'recepcionista',
      },
    }),
  },
  [`PUT ${API}/usuarios/{id}`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    defecto: F1,
    pedido: async (m) => ({
      metodo: 'PUT',
      url: `${API}/usuarios/${await m.nuevo.usuario()}`,
      payload: { activo: true },
    }),
  },
  [`DELETE ${API}/usuarios/{id}`]: {
    tipo: 'personal',
    roles: SOLO_ADMIN,
    conId: true,
    defecto: F1,
    pedido: async (m) => ({
      metodo: 'DELETE',
      url: `${API}/usuarios/${await m.nuevo.usuario()}`,
    }),
  },

  // --- Consulta pública (sin sesión) -------------------------------------------------------------
  [`GET ${API}/publico/{slug}/prestaciones`]: {
    tipo: 'publica',
    pedido: async (m) => ({
      metodo: 'GET',
      url: `${API}/publico/${m.a.clinica.slug}/prestaciones`,
    }),
  },
  [`GET ${API}/publico/{slug}/profesionales`]: {
    tipo: 'publica',
    pedido: async (m) => ({
      metodo: 'GET',
      url: `${API}/publico/${m.a.clinica.slug}/profesionales`,
    }),
  },
  [`GET ${API}/publico/{slug}/disponibilidad`]: {
    tipo: 'publica',
    pedido: async (m) => ({
      metodo: 'GET',
      url: `${API}/publico/${m.a.clinica.slug}/disponibilidad?${new URLSearchParams({
        profesionalId: m.a.profesionalId,
        prestacionId: m.a.prestacionId,
        desde: m.a.diaConHuecos,
        hasta: sumarDias(m.a.diaConHuecos, 1),
      }).toString()}`,
    }),
  },
};
