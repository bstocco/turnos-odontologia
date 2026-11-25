import type { EjecutorDeConsulta } from '../auditoria/index.js';

type Fila = Record<string, unknown>;

function texto(fila: Fila, columna: string): string {
  const valor = fila[columna];
  if (typeof valor !== 'string') {
    throw new Error(`Columna '${columna}' inesperada en la exportación.`);
  }
  return valor;
}

function textoONulo(fila: Fila, columna: string): string | null {
  const valor = fila[columna];
  return valor === null ? null : typeof valor === 'string' ? valor : null;
}

/** paciente: DNI (datos de salud) y teléfono (RN-DA-01: solo para población de salud). */
export interface PacienteExportado {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string | null;
  readonly obraSocial: string | null;
}

export interface TurnoExportado {
  readonly id: string;
  readonly inicio: string;
  readonly fin: string;
  readonly bufferMinutos: number;
  readonly estado: string;
  readonly pacienteId: string | null;
  readonly profesionalId: string | null;
  readonly sillonId: string | null;
  readonly prestacionId: string | null;
}

export interface ProfesionalExportado {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly matricula: string | null;
}

export interface SillonExportado {
  readonly id: string;
  readonly nombre: string;
  readonly bufferMinutos: number;
}

export interface PrestacionExportada {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
  readonly activa: boolean;
}

export interface AuditoriaExportada {
  readonly id: string;
  readonly ocurrioEn: string;
  readonly actorTipo: string;
  readonly actorId: string | null;
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string | null;
  readonly ip: string | null;
}

export interface ExportacionDeClinica {
  readonly formato: 'json';
  readonly fechaExportacion: string;
  readonly pacientes: PacienteExportado[];
  readonly turnos: TurnoExportado[];
  readonly profesionales: ProfesionalExportado[];
  readonly sillones: SillonExportado[];
  readonly prestaciones: PrestacionExportada[];
  readonly auditoria: AuditoriaExportada[];
}

function instanteAISO(fila: Fila, columna: string): string {
  return new Date(fila[columna] as string).toISOString();
}

const SQL_PACIENTES = `SELECT id, nombre, apellido, dni, telefono, email, obra_social
  FROM paciente ORDER BY apellido, nombre`;
const SQL_TURNOS = `SELECT id, inicio, fin, buffer_minutos, estado, paciente_id,
  profesional_id, sillon_id, prestacion_id FROM turno ORDER BY inicio`;
const SQL_PROFESIONALES = `SELECT id, nombre, apellido, matricula FROM profesional
  ORDER BY apellido, nombre`;
const SQL_SILLONES = `SELECT id, nombre, buffer_minutos FROM sillon ORDER BY nombre`;
const SQL_PRESTACIONES = `SELECT id, nombre, duracion_minutos, activa FROM prestacion
  ORDER BY nombre`;
const SQL_AUDITORIA = `SELECT id::text AS id, ocurrio_en, actor_tipo, actor_id, accion,
  entidad, entidad_id, host(ip) AS ip FROM auditoria ORDER BY ocurrio_en DESC`;

function mapearPacientes(filas: readonly Fila[]): PacienteExportado[] {
  return filas.map((f) => ({
    id: texto(f, 'id'),
    nombre: texto(f, 'nombre'),
    apellido: texto(f, 'apellido'),
    dni: texto(f, 'dni'),
    telefono: texto(f, 'telefono'),
    email: textoONulo(f, 'email'),
    obraSocial: textoONulo(f, 'obra_social'),
  }));
}

function mapearTurnos(filas: readonly Fila[]): TurnoExportado[] {
  return filas.map((f) => ({
    id: texto(f, 'id'),
    inicio: new Date(f['inicio'] as string).toISOString(),
    fin: new Date(f['fin'] as string).toISOString(),
    bufferMinutos: Number(f['buffer_minutos']),
    estado: texto(f, 'estado'),
    pacienteId: textoONulo(f, 'paciente_id'),
    profesionalId: textoONulo(f, 'profesional_id'),
    sillonId: textoONulo(f, 'sillon_id'),
    prestacionId: textoONulo(f, 'prestacion_id'),
  }));
}

function mapearProfesionales(filas: readonly Fila[]): ProfesionalExportado[] {
  return filas.map((f) => ({
    id: texto(f, 'id'),
    nombre: texto(f, 'nombre'),
    apellido: texto(f, 'apellido'),
    matricula: textoONulo(f, 'matricula'),
  }));
}

function mapearSillon(filas: readonly Fila[]): SillonExportado[] {
  return filas.map((f) => ({
    id: texto(f, 'id'),
    nombre: texto(f, 'nombre'),
    bufferMinutos: Number(f['buffer_minutos']),
  }));
}

function mapearPrestaciones(filas: readonly Fila[]): PrestacionExportada[] {
  return filas.map((f) => ({
    id: texto(f, 'id'),
    nombre: texto(f, 'nombre'),
    duracionMinutos: Number(f['duracion_minutos']),
    activa: f['activa'] === true,
  }));
}

function mapearAuditoria(filas: readonly Fila[]): AuditoriaExportada[] {
  return filas.map((f) => ({
    id: texto(f, 'id'),
    ocurrioEn: instanteAISO(f, 'ocurrio_en'),
    actorTipo: texto(f, 'actor_tipo'),
    actorId: textoONulo(f, 'actor_id'),
    accion: texto(f, 'accion'),
    entidad: texto(f, 'entidad'),
    entidadId: textoONulo(f, 'entidad_id'),
    ip: textoONulo(f, 'ip'),
  }));
}

/**
 * Genera la exportación de la clínica del contexto (RLS de `C-03` garantiza el aislamiento).
 * Datos: pacientes, turnos, profesionales, sillones, prestaciones y auditoría.
 */
export async function generarExportacionDeClinica(
  ejecutor: EjecutorDeConsulta,
): Promise<ExportacionDeClinica> {
  const [pacientes, turnos, profesionales, sillones, prestaciones, auditoria] = await Promise.all([
    ejecutor.query(SQL_PACIENTES),
    ejecutor.query(SQL_TURNOS),
    ejecutor.query(SQL_PROFESIONALES),
    ejecutor.query(SQL_SILLONES),
    ejecutor.query(SQL_PRESTACIONES),
    ejecutor.query(SQL_AUDITORIA),
  ]);
  return {
    formato: 'json',
    fechaExportacion: new Date().toISOString(),
    pacientes: mapearPacientes(pacientes.rows),
    turnos: mapearTurnos(turnos.rows),
    profesionales: mapearProfesionales(profesionales.rows),
    sillones: mapearSillon(sillones.rows),
    prestaciones: mapearPrestaciones(prestaciones.rows),
    auditoria: mapearAuditoria(auditoria.rows),
  };
}
