import type { ProveedorEnlacesTurno } from '../../../../application/notificaciones/turnos/puertos.js';
import type { RelojNotificaciones } from '../../../../application/notificaciones/puertos.js';
import {
  crearProveedorEnlacesTurno,
  type EjecutorAccionPublica,
  type EjecutorReservaPublica,
  type EjecutorSolicitudCodigo,
  type NuevoPacientePublico,
  type PacientePublicoRegistro,
} from '../../../../application/reserva-publica/index.js';
import {
  turnoModificadoConcurrentemente,
  turnoSolapadoSillon,
} from '../../../../domain/agenda/errores-agenda.js';
import { ErrorDeDominio } from '../../../../domain/shared/errores.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../../domain/shared/ids.js';
import { valorOLanzar } from '../../../../domain/shared/resultado.js';
import { parsearEstado } from '../../../../domain/turno/estado.js';
import type { EstadoTurno, Turno } from '../../../../domain/turno/index.js';
import { crearAuditoriaPg } from '../../../audit/repositorio-pg.js';
import { cryptoComunicacion } from '../../../crypto/index.js';
import { crearRepositorioNotificacionesPg } from '../../../queue/notificacion-repositorio-pg.js';
import { poolDeLaAplicacion } from '../../pool/index.js';
import { withTenant } from '../../tenant/with-tenant.js';
import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  entero,
  esUuid,
  instante,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';
import { crearConfiguracionClinicaRepository } from '../configuracion-clinica/index.js';
import { crearPacienteRepository, type PacienteRegistro } from '../paciente/index.js';
import { crearPrestacionRepository } from '../prestacion/index.js';
import { crearRecursosReader } from '../recursos/index.js';
import { crearAgendaReader } from '../turno/index.js';

import { traducirErrorReservaPg } from './errores.js';
import { crearRepositorioCodigoVerificacionPg } from './repositorio-otp.js';
import { crearRepositorioTokenAccionPg } from './repositorio-token-accion.js';

const COLUMNAS_TURNO = `id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                         inicio, fin, buffer_minutos, fin_sillon, estado, origen, reprogramado_de,
                         duracion_real_minutos, creado_en, actualizado_en`;

function mapearPaciente(p: PacienteRegistro): PacientePublicoRegistro {
  return {
    id: p.id,
    nombre: p.nombre,
    apellido: p.apellido,
    dni: p.dni,
    telefono: p.telefono,
    email: p.email,
    obraSocial: p.obraSocial,
  };
}

function mapearTurno(fila: Fila): Turno {
  const reprogramadoDe = textoONulo(fila, 'reprogramado_de');
  const duracionReal = fila['duracion_real_minutos'];
  return {
    id: texto(fila, 'id') as TurnoId,
    pacienteId: texto(fila, 'paciente_id') as PacienteId,
    profesionalId: texto(fila, 'profesional_id') as ProfesionalId,
    sillonId: texto(fila, 'sillon_id') as SillonId,
    prestacionId: texto(fila, 'prestacion_id') as PrestacionId,
    inicio: instante(fila, 'inicio'),
    fin: instante(fila, 'fin'),
    bufferMinutos: entero(fila, 'buffer_minutos'),
    finSillon: instante(fila, 'fin_sillon'),
    estado: valorOLanzar(parsearEstado(fila['estado'])),
    origen: texto(fila, 'origen') as Turno['origen'],
    reprogramadoDe: reprogramadoDe === null ? null : (reprogramadoDe as TurnoId),
    duracionRealMinutos:
      typeof duracionReal === 'number' && Number.isInteger(duracionReal) ? duracionReal : null,
    creadoEn: instante(fila, 'creado_en'),
    actualizadoEn: instante(fila, 'actualizado_en'),
  };
}

async function consultarConTraductorReserva(
  ejecutor: EjecutorSql,
  sql: string,
  valores: unknown[],
) {
  try {
    return await ejecutor.query(sql, valores);
  } catch (error) {
    throw traducirErrorReservaPg(error);
  }
}

export function crearEjecutorSolicitudCodigoPg(): EjecutorSolicitudCodigo {
  return {
    iniciarEmision(clinicaId, fn) {
      return withTenant(clinicaId, async (cliente) => {
        const config = await crearConfiguracionClinicaRepository(cliente).obtener();
        return fn({
          nombreClinica: config.nombre,
          codigos: crearRepositorioCodigoVerificacionPg(cliente),
          notificaciones: crearRepositorioNotificacionesPg(cliente),
        });
      });
    },
    finalizarNotificacion(clinicaId, fn) {
      return withTenant(clinicaId, (cliente) => fn(crearRepositorioNotificacionesPg(cliente)));
    },
  };
}

export function crearEjecutorReservaPublicaPg(): EjecutorReservaPublica {
  return {
    verificarOtp(clinicaId, fn) {
      return withTenant(clinicaId, (cliente) => fn(crearRepositorioCodigoVerificacionPg(cliente)));
    },
    reservar(clinicaId, fn) {
      return withTenant(clinicaId, async (cliente) => {
        const clinicaConfig = await crearConfiguracionClinicaRepository(cliente).obtener();
        const repoPacientesBase = crearPacienteRepository(cliente);

        return fn({
          codigos: crearRepositorioCodigoVerificacionPg(cliente),
          clinicaConfig,
          recursos: crearRecursosReader(cliente),
          agenda: crearAgendaReader(cliente),
          prestaciones: crearPrestacionRepository(cliente),
          pacientes: {
            async buscarPorDni(dni: string) {
              const p = await repoPacientesBase.buscarPorDni(dni);
              return p === null ? null : mapearPaciente(p);
            },
            async crearConManejoDeDuplicado(datos: NuevoPacientePublico) {
              await cliente.query('SAVEPOINT sp_paciente_reserva');
              try {
                const creado = await repoPacientesBase.crear(datos);
                await cliente.query('RELEASE SAVEPOINT sp_paciente_reserva');
                return { paciente: mapearPaciente(creado), creado: true };
              } catch (error) {
                await cliente.query('ROLLBACK TO SAVEPOINT sp_paciente_reserva');
                await cliente.query('RELEASE SAVEPOINT sp_paciente_reserva');
                if (error instanceof ErrorDeDominio && error.codigo === 'PACIENTE_DNI_DUPLICADO') {
                  const existente = await repoPacientesBase.buscarPorDni(datos.dni);
                  if (existente !== null) {
                    return { paciente: mapearPaciente(existente), creado: false };
                  }
                }
                throw error;
              }
            },
            async completarEmailSiNulo(pacienteId: string, email: string) {
              const { rows } = await consultar(
                cliente,
                `UPDATE paciente
                 SET email = $2
                 WHERE id = $1::uuid
                   AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
                   AND email IS NULL
                 RETURNING id, nombre, apellido, dni, telefono, email, obra_social`,
                [pacienteId, email],
              );
              const fila = rows[0];
              if (fila === undefined) return null;
              return {
                id: texto(fila, 'id'),
                nombre: texto(fila, 'nombre'),
                apellido: texto(fila, 'apellido'),
                dni: texto(fila, 'dni'),
                telefono: texto(fila, 'telefono'),
                email: textoONulo(fila, 'email'),
                obraSocial: textoONulo(fila, 'obra_social'),
              };
            },
          },
          po09: {
            async bloquearIdentidad(cId: string, dni: string, email: string) {
              // Orden determinista para evitar deadlocks entre locks de DNI y email.
              const claves = [`po09:dni:${cId}:${dni}`, `po09:email:${cId}:${email}`].sort();
              for (const clave of claves) {
                await consultar(
                  cliente,
                  'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
                  [clave, `${clave}:v1`],
                );
              }
            },
            async contarReservasPublicasActivas(dni: string, email: string, ahora: Date) {
              const { rows } = await consultar(
                cliente,
                `SELECT COUNT(*)::integer AS total
                 FROM turno t
                 JOIN paciente p ON p.clinica_id = t.clinica_id AND p.id = t.paciente_id
                 WHERE t.clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
                   AND t.origen = 'enlace_web'
                   AND t.estado IN ('pendiente_confirmacion', 'confirmado')
                   AND t.inicio > $3::timestamptz
                   AND (p.dni = $1 OR lower(p.email) = $2)`,
                [dni, email, ahora],
              );
              return entero(rows[0] ?? { total: 0 }, 'total');
            },
          },
          turnos: {
            async insertarConReintentoSillon(sillonesOrdenados, construirTurno) {
              for (const sillonId of sillonesOrdenados) {
                const nuevo = construirTurno(sillonId);
                await cliente.query('SAVEPOINT sp_turno_sillon');
                try {
                  const { rows } = await consultarConTraductorReserva(
                    cliente,
                    `INSERT INTO turno
                       (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                        inicio, fin, buffer_minutos, fin_sillon, estado, origen, reprogramado_de)
                     VALUES (gen_random_uuid(), ${CLINICA_DEL_CONTEXTO_SQL},
                             $1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8::timestamptz, $9, $10, $11)
                     RETURNING ${COLUMNAS_TURNO}`,
                    [
                      nuevo.pacienteId,
                      nuevo.profesionalId,
                      nuevo.sillonId,
                      nuevo.prestacionId,
                      nuevo.inicio,
                      nuevo.fin,
                      nuevo.bufferMinutos,
                      nuevo.finSillon,
                      nuevo.estado,
                      nuevo.origen,
                      nuevo.reprogramadoDe,
                    ],
                  );
                  await cliente.query('RELEASE SAVEPOINT sp_turno_sillon');
                  const fila = rows[0];
                  if (fila === undefined) {
                    throw new Error('La inserción de turno público no devolvió la fila creada.');
                  }
                  return mapearTurno(fila);
                } catch (error) {
                  await cliente.query('ROLLBACK TO SAVEPOINT sp_turno_sillon');
                  await cliente.query('RELEASE SAVEPOINT sp_turno_sillon');
                  if (error instanceof ErrorDeDominio && error.codigo === 'TURNO_SOLAPADO_SILLON') {
                    continue;
                  }
                  throw error;
                }
              }
              throw turnoSolapadoSillon();
            },
          },
          auditoria: crearAuditoriaPg(cliente),
        });
      });
    },
  };
}

export function crearProveedorEnlacesTurnoPg(opciones: {
  readonly publicBaseUrl: string;
  readonly reloj?: RelojNotificaciones;
}): ProveedorEnlacesTurno {
  return crearProveedorEnlacesTurno({
    publicBaseUrl: opciones.publicBaseUrl,
    crypto: cryptoComunicacion,
    reloj: opciones.reloj ?? { ahora: () => new Date() },
    ejecutor: {
      ejecutar(clinicaId, turnoId, fn) {
        return withTenant(clinicaId, async (cliente) => {
          let inicioTurno: Date | null = null;
          if (esUuid(turnoId)) {
            const { rows } = await consultar(
              cliente,
              `SELECT inicio FROM turno WHERE id = $1::uuid AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}`,
              [turnoId],
            );
            const fila = rows[0];
            if (fila !== undefined) {
              inicioTurno = instante(fila, 'inicio');
            }
          }
          return fn({
            inicioTurno,
            tokens: crearRepositorioTokenAccionPg(cliente),
          });
        });
      },
    },
  });
}

export function crearEjecutorAccionPublicaPg(): EjecutorAccionPublica {
  return {
    ejecutar(clinicaId, fn) {
      return withTenant(clinicaId, async (cliente) => {
        const clinicaConfig = await crearConfiguracionClinicaRepository(cliente).obtener();
        return fn({
          clinicaConfig,
          tokens: crearRepositorioTokenAccionPg(cliente),
          turnos: {
            async obtenerPorIdParaActualizar(turnoId: TurnoId) {
              if (!esUuid(turnoId)) return null;
              const { rows } = await consultar(
                cliente,
                `SELECT ${COLUMNAS_TURNO}
                 FROM turno
                 WHERE id = $1::uuid AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
                 FOR UPDATE`,
                [turnoId],
              );
              const fila = rows[0];
              return fila === undefined ? null : mapearTurno(fila);
            },
            async actualizarEstado(turno: Turno, estadoEsperado: EstadoTurno) {
              const { rows, rowCount } = await consultar(
                cliente,
                `UPDATE turno
                 SET estado = $1, actualizado_en = now()
                 WHERE id = $2::uuid AND estado = $3 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
                 RETURNING ${COLUMNAS_TURNO}`,
                [turno.estado, turno.id, estadoEsperado],
              );
              if ((rowCount ?? 0) === 0 || rows[0] === undefined) {
                throw turnoModificadoConcurrentemente();
              }
              return mapearTurno(rows[0]);
            },
          },
          auditoria: crearAuditoriaPg(cliente),
        });
      });
    },
  };
}

export function resolverClinicaPorHashTokenConPool(hashToken: string): Promise<string | null> {
  return consultar(poolDeLaAplicacion(), 'SELECT resolver_clinica_por_hash_token($1) AS id', [
    hashToken,
  ]).then(({ rows }) => {
    const id = rows[0]?.['id'];
    return typeof id === 'string' && esUuid(id) ? id : null;
  });
}
