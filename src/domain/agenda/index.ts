/** API pública de `agenda`. CONTRATO CONGELADO (regla dura 14): cambios solo por PR del dueño con aviso. */
export {
  calcularDisponibilidad,
  type EntradaDisponibilidad,
  type Hueco,
} from './disponibilidad.js';
export * from './errores-agenda.js';
export {
  contiene,
  crearIntervalo,
  crearIntervaloOLanzar,
  esAdyacente,
  seSolapa,
  type Intervalo,
} from './intervalo.js';
export {
  detectarSolape,
  rangoProfesional,
  rangoSillon,
  type OcupacionCandidata,
  type OcupacionExistente,
} from './ocupacion.js';
export type {
  AgendaReader,
  Bloqueo,
  ConfiguracionAgenda,
  FranjaAtencion,
  Prestacion,
  Profesional,
  RecursosReader,
  Sillon,
} from './puertos.js';
export {
  franjaAIntervalo,
  validarDentroDeHorario,
  validarGranularidad,
  validarInicioNoPasado,
  validarNoFeriado,
  validarSinBloqueo,
  validarTurnoPrevio,
  type EntradaValidacionPrevia,
} from './validaciones.js';
export {
  crearFechaLocal,
  diaSemanaDe,
  instanteALocal,
  localAInstante,
  parsearHoraLocal,
  sumarDias,
  type FechaLocal,
  type InstanteLocal,
} from './zona-horaria.js';
