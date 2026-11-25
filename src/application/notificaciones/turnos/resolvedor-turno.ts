import {
  plantillaCancelacionTurno,
  plantillaConfirmacionTurno,
  plantillaCreacionTurno,
  plantillaRecordatorioTurno,
  plantillaReprogramacionTurno,
  type DatosBaseTurno,
  type PlantillaEmail,
} from '../../../domain/comunicacion/plantillas.js';
import type {
  NotificacionRegistrada,
  RelojNotificaciones,
  ResolvedorContenidoEmail,
  ResultadoResolucionEmail,
} from '../puertos.js';
import type {
  DatosNotificacionTurno,
  LectorDatosNotificacionTurno,
  ProveedorEnlacesTurno,
} from './puertos.js';

export interface DependenciasResolvedorTurno {
  readonly lector: LectorDatosNotificacionTurno;
  readonly reloj: RelojNotificaciones;
  readonly proveedorEnlaces?: ProveedorEnlacesTurno;
}

function nombreCompleto(nombre: string, apellido: string): string {
  return `${nombre} ${apellido}`.trim();
}

function datosBaseDesdeTurno(datos: DatosNotificacionTurno): DatosBaseTurno {
  return {
    nombreClinica: datos.clinicaNombre,
    nombrePaciente: nombreCompleto(datos.pacienteNombre, datos.pacienteApellido),
    nombreProfesional: nombreCompleto(datos.profesionalNombre, datos.profesionalApellido),
    nombrePrestacion: datos.prestacionNombre,
    inicio: datos.inicio,
    zonaHoraria: datos.clinicaZonaHoraria,
  };
}

function codigoDescartePorElegibilidad(
  notificacion: NotificacionRegistrada,
  datos: DatosNotificacionTurno,
  ahora: Date,
): string | null {
  if (notificacion.tipo === 'creacion' || notificacion.tipo === 'confirmacion') {
    if (datos.estadoTurno === 'cancelado' || datos.estadoTurno === 'reprogramado') {
      return 'TURNO_YA_NO_ACTIVO';
    }
    return null;
  }

  if (notificacion.tipo === 'recordatorio') {
    const elegible =
      (datos.estadoTurno === 'pendiente_confirmacion' || datos.estadoTurno === 'confirmado') &&
      datos.inicio.getTime() > ahora.getTime();
    return elegible ? null : 'TURNO_NO_ELEGIBLE_RECORDATORIO';
  }

  if (notificacion.tipo === 'reprogramacion' && datos.inicioAnterior === null) {
    return 'TURNO_ORIGEN_REPROGRAMACION_NO_ENCONTRADO';
  }

  return null;
}

function renderizarPlantilla(
  tipo: Exclude<NotificacionRegistrada['tipo'], 'codigo'>,
  datos: DatosNotificacionTurno,
  enlaces: { readonly enlaceConfirmar?: string; readonly enlaceCancelar?: string },
): PlantillaEmail {
  const base = datosBaseDesdeTurno(datos);

  switch (tipo) {
    case 'creacion':
      return plantillaCreacionTurno({
        ...base,
        estado:
          datos.estadoTurno === 'pendiente_confirmacion' ? 'pendiente_confirmacion' : 'confirmado',
        ...(enlaces.enlaceConfirmar !== undefined
          ? { enlaceConfirmar: enlaces.enlaceConfirmar }
          : {}),
        ...(enlaces.enlaceCancelar !== undefined ? { enlaceCancelar: enlaces.enlaceCancelar } : {}),
      });
    case 'confirmacion':
      return plantillaConfirmacionTurno({
        ...base,
        ...(enlaces.enlaceCancelar !== undefined ? { enlaceCancelar: enlaces.enlaceCancelar } : {}),
      });
    case 'cancelacion':
      return plantillaCancelacionTurno(base);
    case 'reprogramacion':
      return plantillaReprogramacionTurno({
        ...base,
        inicioAnterior: datos.inicioAnterior as Date,
        ...(enlaces.enlaceCancelar !== undefined ? { enlaceCancelar: enlaces.enlaceCancelar } : {}),
      });
    case 'recordatorio':
      return plantillaRecordatorioTurno({
        ...base,
        ...(enlaces.enlaceConfirmar !== undefined
          ? { enlaceConfirmar: enlaces.enlaceConfirmar }
          : {}),
        ...(enlaces.enlaceCancelar !== undefined ? { enlaceCancelar: enlaces.enlaceCancelar } : {}),
      });
  }
}

/**
 * Resuelve destinatario y plantilla de correo en español para notificaciones de turno al momento
 * del envío (`withTenant` vía `LectorDatosNotificacionTurno`), sin almacenar PII en cola.
 */
export function crearResolvedorContenidoTurno(
  deps: DependenciasResolvedorTurno,
): ResolvedorContenidoEmail {
  return {
    async resolver({ clinicaId, notificacion }): Promise<ResultadoResolucionEmail> {
      if (notificacion.tipo === 'codigo') {
        return { estado: 'descartar', codigo: 'TIPO_NO_SOPORTADO_EN_TURNO' };
      }

      if (notificacion.turnoId === null) {
        return { estado: 'descartar', codigo: 'TURNO_NO_ENCONTRADO' };
      }

      const datos = await deps.lector.obtenerPorTurnoId(clinicaId, notificacion.turnoId);
      if (datos === null) {
        return { estado: 'descartar', codigo: 'TURNO_NO_ENCONTRADO' };
      }

      const correo = datos.pacienteEmail?.trim() ?? '';
      if (correo.length === 0) {
        return { estado: 'descartar', codigo: 'PACIENTE_SIN_EMAIL' };
      }

      const codigoDescarte = codigoDescartePorElegibilidad(notificacion, datos, deps.reloj.ahora());
      if (codigoDescarte !== null) {
        return { estado: 'descartar', codigo: codigoDescarte };
      }

      const enlaces =
        deps.proveedorEnlaces !== undefined
          ? await deps.proveedorEnlaces.obtenerEnlaces({
              clinicaId,
              turnoId: datos.turnoId,
              tipo: notificacion.tipo,
              estadoTurno: datos.estadoTurno,
            })
          : {};

      const plantilla = renderizarPlantilla(notificacion.tipo, datos, enlaces);

      return {
        estado: 'listo',
        mensaje: {
          para: correo,
          asunto: plantilla.asunto,
          texto: plantilla.cuerpo,
        },
      };
    },
  };
}
