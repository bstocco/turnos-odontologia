import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { clinicaDeTokenDeRefresco } from '../../src/infrastructure/auth/refresco.js';
import { withTenant } from '../../src/infrastructure/db/tenant/with-tenant.js';
import { operacionesDe, type Contrato } from '../e2e/contrato/comparar.js';
import { diferenciasDeCompletitud } from '../e2e/permisos/completitud.js';
import {
  claveInterna,
  crearClinicaSintetica,
  crearUsuarioSintetico,
  type ClinicaSintetica,
  type UsuarioSintetico,
} from '../e2e/soporte/clinica.js';
import { pacienteSintetico, semillaNueva } from '../e2e/soporte/datos-sinteticos.js';
import { abrirEntorno, type EntornoE2E } from '../e2e/soporte/entorno.js';
import { sumarDias } from '../e2e/soporte/fechas.js';
import {
  pedirComo,
  ponerEnMarchaUnaClinica,
  type ClinicaConfigurada,
} from '../e2e/soporte/puesta-en-marcha.js';
import {
  configurarEntornoDeReservaPublica,
  obtenerCodigo,
} from '../e2e/soporte/reserva-publica.js';
import { emitirRefrescoSintetico, iniciarSesion, type Sesion } from '../e2e/soporte/sesion.js';

vi.mock('../../src/infrastructure/email/index.js', async (importarOriginal) => {
  const original =
    await importarOriginal<typeof import('../../src/infrastructure/email/index.js')>();
  const { emailFalso } = await import('../e2e/soporte/email-falso.js');
  return { ...original, crearEmailSenderSmtp: () => emailFalso };
});

interface MundoCrossTenant {
  readonly a: ClinicaConfigurada;
  readonly adminA: UsuarioSintetico;
  readonly pacienteSoloADni: string;
  readonly feriadoAId: string;
  readonly usuarioAId: string;
  readonly turnoAId: string;
  readonly ausenteAId: string;
  readonly bloqueoAId: string;
  readonly exportacionAId: string;
  readonly b: ClinicaSintetica;
  readonly sesionB: Sesion;
  readonly profesionalBId: string;
  readonly prestacionBId: string;
}

interface CasoCrossTenant {
  readonly defecto?: { readonly codigo: string; readonly motivo: string };
  readonly probar: (entorno: EntornoE2E, m: MundoCrossTenant) => Promise<void>;
}

const API = '/api/v1';

function afirmarSinIdentificadoresDeA(cuerpo: string, m: MundoCrossTenant): void {
  const sensiblesA = [
    m.a.clinica.id,
    m.a.profesionalId,
    m.a.sillonId,
    m.a.prestacionId,
    m.a.pacienteId,
    m.pacienteSoloADni,
    m.a.paciente.email,
    m.feriadoAId,
    m.turnoAId,
    m.ausenteAId,
    m.bloqueoAId,
  ];
  for (const valor of sensiblesA) {
    expect(cuerpo).not.toContain(valor);
  }
}

const F1_DEFECTO = {
  codigo: 'F1',
  motivo: 'C-06 usuarios no registra pluginDeAutenticacion y responde 401 con sesión válida',
} as const;

const F6_DEFECTO = {
  codigo: 'F6',
  motivo:
    'C-12 turnos/agenda/bloqueos no registran pluginDeAutenticacion y responden 401 con sesión válida',
} as const;

const CASOS_CROSS_TENANT: Readonly<Record<string, CasoCrossTenant>> = {
  // --- Salud, interno y auth ------------------------------------------------------------------
  'GET /salud': {
    probar: async (entorno) => {
      const r = await entorno.inject({ method: 'GET', url: '/salud' });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ estado: 'ok' });
    },
  },
  [`POST ${API}/interno/clinicas`]: {
    probar: async (entorno, m) => {
      // Un token de clínica B no puede aprovisionar clínicas ni usar la clave interna.
      const conTokenB = await entorno.inject({
        method: 'POST',
        url: `${API}/interno/clinicas`,
        headers: m.sesionB.encabezados,
        payload: {
          slug: `rechazada-${randomBytes(3).toString('hex')}`,
          nombre: 'Rechazada',
          email: 'x@ejemplo.invalid',
        },
      });
      expect(conTokenB.statusCode).toBe(401);
      expect(claveInterna().length).toBeGreaterThan(0);
    },
  },
  [`POST ${API}/auth/login`]: {
    probar: async (entorno, m) => {
      // Credenciales válidas del administrador de clínica A sobre el slug de clínica B -> 401.
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/auth/login`,
        payload: {
          slug: m.b.slug,
          email: m.adminA.email,
          password: m.adminA.password,
        },
      });
      expect(r.statusCode).toBe(401);
    },
  },
  [`POST ${API}/auth/refresh`]: {
    probar: async (entorno, m) => {
      // Un refresh token pertenece a su clínica emisora; nunca rota hacia clínica B ni sirve como Bearer.
      const refrescoA = await emitirRefrescoSintetico(m.a.clinica.id, m.adminA.id);
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/auth/refresh`,
        payload: { token: refrescoA },
      });
      expect(r.statusCode).toBe(200);
      const { token } = r.json() as { token: string };
      expect(clinicaDeTokenDeRefresco(token)).toBe(m.a.clinica.id);
      expect(clinicaDeTokenDeRefresco(token)).not.toBe(m.b.id);
      const comoBearer = await entorno.inject({
        method: 'GET',
        url: `${API}/clinica`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(comoBearer.statusCode).toBe(401);
    },
  },
  [`POST ${API}/auth/logout`]: {
    probar: async (entorno, m) => {
      const refrescoA = await emitirRefrescoSintetico(m.a.clinica.id, m.adminA.id);
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/auth/logout`,
        headers: m.sesionB.encabezados,
        payload: { token: refrescoA },
      });
      expect([200, 204, 401, 404]).toContain(r.statusCode);
      expect(r.body).not.toContain(m.a.clinica.id);
    },
  },

  // --- Clínica ---------------------------------------------------------------------------------
  [`GET ${API}/clinica`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/clinica`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      expect((r.json() as { id: string }).id).toBe(m.b.id);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`PATCH ${API}/clinica`]: {
    probar: async (entorno, m) => {
      const previoA = await pedirComo<{ cancelacionAnticipacionHoras: number }>(
        entorno,
        m.a.sesion,
        'GET',
        `${API}/clinica`,
        200,
      );
      const r = await entorno.inject({
        method: 'PATCH',
        url: `${API}/clinica`,
        headers: m.sesionB.encabezados,
        payload: { cancelacionAnticipacionHoras: 48 },
      });
      expect(r.statusCode).toBe(200);
      expect((r.json() as { id: string }).id).toBe(m.b.id);

      const despuesA = await pedirComo<{ cancelacionAnticipacionHoras: number }>(
        entorno,
        m.a.sesion,
        'GET',
        `${API}/clinica`,
        200,
      );
      expect(despuesA.cancelacionAnticipacionHoras).toBe(previoA.cancelacionAnticipacionHoras);
    },
  },

  // --- Profesionales y horarios ----------------------------------------------------------------
  [`GET ${API}/profesionales`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/profesionales`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/profesionales`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/profesionales`,
        headers: m.sesionB.encabezados,
        payload: { nombre: 'ProB', apellido: 'CrossTenant' },
      });
      expect(r.statusCode).toBe(201);
      const creadoId = (r.json() as { id: string }).id;
      const lecturaPorA = await entorno.inject({
        method: 'GET',
        url: `${API}/profesionales/${creadoId}`,
        headers: m.a.sesion.encabezados,
      });
      expect(lecturaPorA.statusCode).toBe(404);
    },
  },
  [`GET ${API}/profesionales/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/profesionales/${m.a.profesionalId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`PATCH ${API}/profesionales/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'PATCH',
        url: `${API}/profesionales/${m.a.profesionalId}`,
        headers: m.sesionB.encabezados,
        payload: { apellido: 'Inyectado' },
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`GET ${API}/profesionales/{id}/horarios`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/profesionales/${m.a.profesionalId}/horarios`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`PUT ${API}/profesionales/{id}/horarios`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'PUT',
        url: `${API}/profesionales/${m.a.profesionalId}/horarios`,
        headers: m.sesionB.encabezados,
        payload: { franjas: [{ diaSemana: 1, horaDesde: '10:00', horaHasta: '11:00' }] },
      });
      expect(r.statusCode).toBe(404);
    },
  },

  // --- Sillones --------------------------------------------------------------------------------
  [`GET ${API}/sillones`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/sillones`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/sillones`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/sillones`,
        headers: m.sesionB.encabezados,
        payload: { nombre: `Sillón B ${randomBytes(3).toString('hex')}` },
      });
      expect(r.statusCode).toBe(201);
      const creadoId = (r.json() as { id: string }).id;
      const lecturaPorA = await entorno.inject({
        method: 'GET',
        url: `${API}/sillones/${creadoId}`,
        headers: m.a.sesion.encabezados,
      });
      expect(lecturaPorA.statusCode).toBe(404);
    },
  },
  [`GET ${API}/sillones/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/sillones/${m.a.sillonId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`PATCH ${API}/sillones/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'PATCH',
        url: `${API}/sillones/${m.a.sillonId}`,
        headers: m.sesionB.encabezados,
        payload: { bufferMinutos: 15 },
      });
      expect(r.statusCode).toBe(404);
    },
  },

  // --- Prestaciones ----------------------------------------------------------------------------
  [`GET ${API}/prestaciones`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/prestaciones`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/prestaciones`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/prestaciones`,
        headers: m.sesionB.encabezados,
        payload: { nombre: `Prestación B ${randomBytes(3).toString('hex')}`, duracionMinutos: 30 },
      });
      expect(r.statusCode).toBe(201);
      const creadoId = (r.json() as { id: string }).id;
      const lecturaPorA = await entorno.inject({
        method: 'GET',
        url: `${API}/prestaciones/${creadoId}`,
        headers: m.a.sesion.encabezados,
      });
      expect(lecturaPorA.statusCode).toBe(404);
    },
  },
  [`GET ${API}/prestaciones/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/prestaciones/${m.a.prestacionId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`PATCH ${API}/prestaciones/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'PATCH',
        url: `${API}/prestaciones/${m.a.prestacionId}`,
        headers: m.sesionB.encabezados,
        payload: { duracionMinutos: 45 },
      });
      expect(r.statusCode).toBe(404);
    },
  },

  // --- Feriados --------------------------------------------------------------------------------
  [`GET ${API}/feriados`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/feriados`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/feriados`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/feriados`,
        headers: m.sesionB.encabezados,
        payload: { fecha: '2043-06-15', descripcion: 'Feriado B' },
      });
      expect(r.statusCode).toBe(201);
      const feriadoBId = (r.json() as { id: string }).id;
      const borradoPorA = await entorno.inject({
        method: 'DELETE',
        url: `${API}/feriados/${feriadoBId}`,
        headers: m.a.sesion.encabezados,
      });
      expect(borradoPorA.statusCode).toBe(404);
    },
  },
  [`DELETE ${API}/feriados/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'DELETE',
        url: `${API}/feriados/${m.feriadoAId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`GET ${API}/feriados/plantilla-nacional`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/feriados/plantilla-nacional?anio=2026`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/feriados/plantilla-nacional`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/feriados/plantilla-nacional`,
        headers: m.sesionB.encabezados,
        payload: { anio: 2027 },
      });
      expect(r.statusCode).toBe(200);
      const feriadosA = await pedirComo<{ fecha: string }[]>(
        entorno,
        m.a.sesion,
        'GET',
        `${API}/feriados`,
        200,
      );
      expect(feriadosA.some((f) => f.fecha.startsWith('2027-'))).toBe(false);
    },
  },

  // --- Pacientes -------------------------------------------------------------------------------
  [`GET ${API}/pacientes`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/pacientes?dni=${m.a.paciente.dni}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([]);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/pacientes`]: {
    probar: async (entorno, m) => {
      // Mismo DNI en clínica B no colisiona con clínica A y queda aislado de A.
      const datos = pacienteSintetico(semillaNueva());
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/pacientes`,
        headers: m.sesionB.encabezados,
        payload: {
          nombre: datos.nombre,
          apellido: datos.apellido,
          dni: m.a.paciente.dni,
          telefono: datos.telefono,
        },
      });
      expect(r.statusCode).toBe(201);
      const creadoEnB = (r.json() as { id: string }).id;
      expect(creadoEnB).not.toBe(m.a.pacienteId);
      const lecturaPorA = await entorno.inject({
        method: 'GET',
        url: `${API}/pacientes/${creadoEnB}`,
        headers: m.a.sesion.encabezados,
      });
      expect(lecturaPorA.statusCode).toBe(404);
    },
  },
  [`GET ${API}/pacientes/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/pacientes/${m.a.pacienteId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`PATCH ${API}/pacientes/{id}`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'PATCH',
        url: `${API}/pacientes/${m.a.pacienteId}`,
        headers: m.sesionB.encabezados,
        payload: { obraSocial: 'Inyectada' },
      });
      expect(r.statusCode).toBe(404);
    },
  },

  // --- Usuarios (F1: C-06 no autentica, bloqueante previo a C-20) -----------------------------
  [`GET ${API}/usuarios`]: {
    defecto: F1_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/usuarios`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/usuarios`]: {
    defecto: F1_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/usuarios`,
        headers: m.sesionB.encabezados,
        payload: {
          email: `u.${randomBytes(4).toString('hex')}@ejemplo.invalid`,
          password: randomBytes(12).toString('base64url'),
          rol: 'recepcionista',
        },
      });
      expect(r.statusCode).toBe(201);
    },
  },
  [`PUT ${API}/usuarios/{id}`]: {
    defecto: F1_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'PUT',
        url: `${API}/usuarios/${m.usuarioAId}`,
        headers: m.sesionB.encabezados,
        payload: { activo: false },
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`DELETE ${API}/usuarios/{id}`]: {
    defecto: F1_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'DELETE',
        url: `${API}/usuarios/${m.usuarioAId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },

  // --- Turnos, agenda y bloqueos (F6: C-12 no autentica, bloqueante previo a C-20) -------------
  [`POST ${API}/turnos`]: {
    defecto: F6_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/turnos`,
        headers: m.sesionB.encabezados,
        payload: {
          pacienteId: m.a.pacienteId,
          profesionalId: m.a.profesionalId,
          sillonId: m.a.sillonId,
          prestacionId: m.a.prestacionId,
          inicio: '2044-01-10T12:00:00.000Z',
          duracionMinutos: 30,
          bufferMinutos: 0,
          origen: 'recepcion',
        },
      });
      expect([404, 422]).toContain(r.statusCode);
    },
  },
  [`GET ${API}/turnos/{id}`]: {
    defecto: F6_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/turnos/${m.turnoAId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`POST ${API}/turnos/{id}/{accion}`]: {
    defecto: F6_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/turnos/${m.turnoAId}/cancelar`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`GET ${API}/agenda`]: {
    defecto: F6_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/agenda?desde=${m.a.diaConHuecos}&hasta=${sumarDias(m.a.diaConHuecos, 1)}&profesionalId=${m.a.profesionalId}`,
        headers: m.sesionB.encabezados,
      });
      expect([200, 404]).toContain(r.statusCode);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/bloqueos`]: {
    defecto: F6_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/bloqueos`,
        headers: m.sesionB.encabezados,
        payload: {
          profesionalId: m.a.profesionalId,
          inicio: '2044-02-01T12:00:00.000Z',
          fin: '2044-02-01T13:00:00.000Z',
          motivo: 'Inyección cross-tenant',
        },
      });
      expect([404, 422]).toContain(r.statusCode);
    },
  },
  [`DELETE ${API}/bloqueos/{id}`]: {
    defecto: F6_DEFECTO,
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'DELETE',
        url: `${API}/bloqueos/${m.bloqueoAId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(404);
    },
  },

  // --- Auditoría, ausentismo y exportaciones (C-16: it normales en verde según Q1) -------------
  [`GET ${API}/auditoria`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/auditoria?actorId=${m.adminA.id}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([]);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`GET ${API}/ausentismo`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/ausentismo?pacienteId=${m.a.pacienteId}&profesionalId=${m.a.profesionalId}`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(200);
      const cuerpo = r.json() as { total: number; ausentes: unknown[] };
      expect(cuerpo.total).toBe(0);
      expect(cuerpo.ausentes).toEqual([]);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/exportaciones`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/exportaciones`,
        headers: m.sesionB.encabezados,
      });
      expect(r.statusCode).toBe(201);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`GET ${API}/exportaciones/{id}`]: {
    probar: async (entorno, m) => {
      // C-16 genera exportaciones al vuelo con withTenant(clinicaB): nunca expone filas de clínica A.
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/exportaciones/${m.exportacionAId}`,
        headers: m.sesionB.encabezados,
      });
      expect([200, 404]).toContain(r.statusCode);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },

  // --- Rutas públicas y acción por token -------------------------------------------------------
  [`GET ${API}/publico/{slug}/prestaciones`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/publico/${m.b.slug}/prestaciones`,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`GET ${API}/publico/{slug}/profesionales`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/publico/${m.b.slug}/profesionales`,
      });
      expect(r.statusCode).toBe(200);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`GET ${API}/publico/{slug}/disponibilidad`]: {
    probar: async (entorno, m) => {
      const consulta = new URLSearchParams({
        profesionalId: m.a.profesionalId,
        prestacionId: m.a.prestacionId,
        desde: m.a.diaConHuecos,
        hasta: sumarDias(m.a.diaConHuecos, 1),
      });
      const r = await entorno.inject({
        method: 'GET',
        url: `${API}/publico/${m.b.slug}/disponibilidad?${consulta.toString()}`,
      });
      expect(r.statusCode).toBe(404);
    },
  },
  [`POST ${API}/publico/{slug}/codigo`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/publico/${m.b.slug}/codigo`,
        payload: { email: `cross.otp.${randomBytes(4).toString('hex')}@ejemplo.invalid` },
      });
      expect(r.statusCode).toBe(202);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/publico/{slug}/reservas`]: {
    probar: async (entorno, m) => {
      const datos = pacienteSintetico(semillaNueva());
      const codigo = await obtenerCodigo(entorno, m.b.slug, datos.email);
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/publico/${m.b.slug}/reservas`,
        payload: {
          profesionalId: m.a.profesionalId,
          prestacionId: m.a.prestacionId,
          inicio: `${m.a.diaConHuecos}T13:00:00.000Z`,
          codigoVerificacion: codigo,
          paciente: {
            nombre: datos.nombre,
            apellido: datos.apellido,
            dni: datos.dni,
            telefono: datos.telefono,
            email: datos.email,
            obraSocial: datos.obraSocial,
          },
        },
      });
      expect([404, 422]).toContain(r.statusCode);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
  [`POST ${API}/publico/turnos/accion`]: {
    probar: async (entorno, m) => {
      const r = await entorno.inject({
        method: 'POST',
        url: `${API}/publico/turnos/accion`,
        headers: m.sesionB.encabezados,
        payload: { token: randomBytes(32).toString('base64url') },
      });
      expect(r.statusCode).toBe(404);
      afirmarSinIdentificadoresDeA(r.body, m);
    },
  },
};

describe('aislamiento cross-tenant sobre todos los endpoints registrados', () => {
  let entorno: EntornoE2E;
  let mundo: MundoCrossTenant;

  beforeAll(async () => {
    configurarEntornoDeReservaPublica();
    entorno = await abrirEntorno();

    const a = await ponerEnMarchaUnaClinica(entorno, 'cross-a');
    const adminA = await crearUsuarioSintetico(a.clinica, 'administrador');
    const datosPacienteSoloA = pacienteSintetico(semillaNueva());
    await pedirComo<{ id: string }>(entorno, a.sesion, 'POST', `${API}/pacientes`, 201, {
      nombre: datosPacienteSoloA.nombre,
      apellido: datosPacienteSoloA.apellido,
      dni: datosPacienteSoloA.dni,
      telefono: datosPacienteSoloA.telefono,
    });
    const feriadoA = await pedirComo<{ id: string }>(
      entorno,
      a.sesion,
      'POST',
      `${API}/feriados`,
      201,
      { fecha: '2042-05-01', descripcion: 'Feriado A' },
    );

    const turnoAId = randomUUID();
    const ausenteAId = randomUUID();
    const bloqueoAId = randomUUID();
    await withTenant(a.clinica.id, async (cliente) => {
      await cliente.query(
        `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id, inicio, fin, fin_sillon, estado)
         VALUES ($1, $2, $3, $4, $5, $6, '2042-06-10T12:00:00Z', '2042-06-10T12:30:00Z', '2042-06-10T12:30:00Z', 'confirmado'),
                ($7, $2, $3, $4, $5, $6, '2025-01-10T12:00:00Z', '2025-01-10T12:30:00Z', '2025-01-10T12:30:00Z', 'ausente')`,
        [
          turnoAId,
          a.clinica.id,
          a.pacienteId,
          a.profesionalId,
          a.sillonId,
          a.prestacionId,
          ausenteAId,
        ],
      );
      await cliente.query(
        `INSERT INTO bloqueo (id, clinica_id, profesional_id, inicio, fin, creado_por)
         VALUES ($1, $2, $3, '2042-07-10T12:00:00Z', '2042-07-10T13:00:00Z', $4)`,
        [bloqueoAId, a.clinica.id, a.profesionalId, adminA.id],
      );
    });

    const expA = await pedirComo<{ id: string }>(
      entorno,
      a.sesion,
      'POST',
      `${API}/exportaciones`,
      201,
    );

    const b = await crearClinicaSintetica(entorno, 'cross-b');
    const adminB = await crearUsuarioSintetico(b, 'administrador');
    const sesionB = await iniciarSesion(entorno, b.slug, adminB.email, adminB.password);
    const profesionalB = await pedirComo<{ id: string }>(
      entorno,
      sesionB,
      'POST',
      `${API}/profesionales`,
      201,
      { nombre: 'ProfesionalB', apellido: 'Aislado' },
    );
    const prestacionB = await pedirComo<{ id: string }>(
      entorno,
      sesionB,
      'POST',
      `${API}/prestaciones`,
      201,
      { nombre: 'Consulta B', duracionMinutos: 30 },
    );

    mundo = {
      a,
      adminA,
      pacienteSoloADni: datosPacienteSoloA.dni,
      feriadoAId: feriadoA.id,
      usuarioAId: adminA.id,
      turnoAId,
      ausenteAId,
      bloqueoAId,
      exportacionAId: expA.id,
      b,
      sesionB,
      profesionalBId: profesionalB.id,
      prestacionBId: prestacionB.id,
    };
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('cubre el 100% de las operaciones registradas en el contrato OpenAPI de la aplicación', () => {
    const registradas = [...operacionesDe(entorno.app.swagger() as unknown as Contrato).keys()];
    const diferencias = diferenciasDeCompletitud(registradas, Object.keys(CASOS_CROSS_TENANT));
    expect(diferencias).toEqual({ sinFila: [], filasSobrantes: [] });
  });

  for (const [operacion, caso] of Object.entries(CASOS_CROSS_TENANT)) {
    if (caso.defecto !== undefined) {
      it.fails(`DEFECTO ${caso.defecto.codigo} (${caso.defecto.motivo}) — ${operacion}`, async () =>
        caso.probar(entorno, mundo),
      );
    } else {
      it(operacion, async () => caso.probar(entorno, mundo));
    }
  }
});
