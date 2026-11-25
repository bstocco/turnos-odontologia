import { randomUUID } from 'node:crypto';

import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import {
  crearClinicaSintetica,
  crearUsuarioSintetico,
  type UsuarioSintetico,
} from '../soporte/clinica.js';
import { pacienteSintetico, semillaNueva } from '../soporte/datos-sinteticos.js';
import type { EntornoE2E } from '../soporte/entorno.js';
import { pedirComo, ponerEnMarchaUnaClinica } from '../soporte/puesta-en-marcha.js';
import { emitirRefrescoSintetico, iniciarSesion } from '../soporte/sesion.js';

import type { Mundo } from './tipos.js';

/** Fecha única por feriado nuevo (2040 en adelante: lejos de cualquier día usado por otros flujos). */
let contadorDeFeriado = 0;
function fechaDeFeriadoNueva(): string {
  contadorDeFeriado += 1;
  return new Date(Date.UTC(2040, 0, 1) + contadorDeFeriado * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Clínica de matriz (A) con un recurso de cada tipo y un usuario por rol, más una clínica B.
 * Todo se crea por la API real; solo los usuarios del personal y el turno de alcance se insertan por
 * fixture (F1 y F2 impiden crearlos por la API).
 */
export async function construirMundo(entorno: EntornoE2E): Promise<Mundo> {
  const a = await ponerEnMarchaUnaClinica(entorno, 'permisos');
  const admin = a.sesion;

  const recepcionista = await crearUsuarioSintetico(a.clinica, 'recepcionista');
  const odontologo = await crearUsuarioSintetico(a.clinica, 'odontologo', {
    profesionalId: a.profesionalId,
  });
  const sesionRecepcion = await iniciarSesion(
    entorno,
    a.clinica.slug,
    recepcionista.email,
    recepcionista.password,
  );
  const sesionOdontologo = await iniciarSesion(
    entorno,
    a.clinica.slug,
    odontologo.email,
    odontologo.password,
  );

  const b = await crearClinicaSintetica(entorno, 'permisos-b');
  const adminB = await crearUsuarioSintetico(b, 'administrador');
  const sesionOtraClinica = await iniciarSesion(entorno, b.slug, adminB.email, adminB.password);

  const profesionalAjeno = await pedirComo<{ id: string }>(
    entorno,
    admin,
    'POST',
    '/api/v1/profesionales',
    201,
    { nombre: 'Otro', apellido: 'Profesional' },
  );

  async function pacienteNuevo(): Promise<{ id: string; dni: string }> {
    const datos = pacienteSintetico(semillaNueva());
    const creado = await pedirComo<{ id: string }>(
      entorno,
      admin,
      'POST',
      '/api/v1/pacientes',
      201,
      {
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni,
        telefono: datos.telefono,
      },
    );
    return { id: creado.id, dni: datos.dni };
  }

  // El odontólogo solo alcanza a pacientes con un turno activo con su profesional.
  const pacienteDelOdontologo = await pacienteNuevo();
  const pacienteAjeno = await pacienteNuevo();
  await withTenant(a.clinica.id, (cliente) =>
    cliente.query(
      `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, inicio, fin, fin_sillon)
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        randomUUID(),
        a.clinica.id,
        pacienteDelOdontologo.id,
        a.profesionalId,
        new Date(Date.UTC(2031, 0, 5, 12, 0, 0)),
        new Date(Date.UTC(2031, 0, 5, 12, 30, 0)),
      ],
    ),
  );

  const sesiones = {
    administrador: admin,
    recepcionista: sesionRecepcion,
    odontologo: sesionOdontologo,
  } as const;

  async function usuarioNuevo(): Promise<UsuarioSintetico> {
    return crearUsuarioSintetico(a.clinica, 'recepcionista');
  }

  return {
    entorno,
    a,
    b,
    sesiones,
    sesionOtraClinica,
    usuarioOdontologo: odontologo,
    pacienteDelOdontologo,
    pacienteAjeno,
    profesionalAjenoId: profesionalAjeno.id,
    nuevo: {
      profesional: async () =>
        (
          await pedirComo<{ id: string }>(entorno, admin, 'POST', '/api/v1/profesionales', 201, {
            nombre: 'Nuevo',
            apellido: 'Profesional',
          })
        ).id,
      sillon: async () =>
        (
          await pedirComo<{ id: string }>(entorno, admin, 'POST', '/api/v1/sillones', 201, {
            nombre: `Sillón ${randomUUID().slice(0, 6)}`,
          })
        ).id,
      prestacion: async () =>
        (
          await pedirComo<{ id: string }>(entorno, admin, 'POST', '/api/v1/prestaciones', 201, {
            nombre: `Prestación ${randomUUID().slice(0, 6)}`,
            duracionMinutos: 30,
          })
        ).id,
      feriado: async () =>
        (
          await pedirComo<{ id: string }>(entorno, admin, 'POST', '/api/v1/feriados', 201, {
            fecha: fechaDeFeriadoNueva(),
            descripcion: 'Feriado sintético de la matriz',
          })
        ).id,
      fechaDeFeriado: fechaDeFeriadoNueva,
      paciente: async () => (await pacienteNuevo()).id,
      usuario: async () => (await usuarioNuevo()).id,
    },
    async credencialesDeLogin() {
      const usuario = await usuarioNuevo();
      return { slug: a.clinica.slug, email: usuario.email, password: usuario.password };
    },
    async refrescoNuevo() {
      const usuario = await usuarioNuevo();
      return emitirRefrescoSintetico(a.clinica.id, usuario.id);
    },
  };
}
