export {
  accesoProhibido,
  cambiosVacios,
  franjaInvalida,
  franjaSolapada,
  granularidadInvalida,
  plantillaFeriadosNoDisponible,
  recursoNoEncontrado,
} from './errores.js';
export { ESCRITURA, LECTURA, exigirRol, type RolDePersonal } from './permisos.js';
export * from './puertos.js';
export {
  detectarSolapeDeFranjas,
  esGranularidadValida,
  formatearMinutos,
  validarFranjas,
  type FranjaEntrada,
} from './validaciones.js';
export {
  modificarConfiguracionClinica,
  obtenerConfiguracionClinica,
  type DependenciasDeClinica,
} from './clinica.js';
export type { FiltroDeLista } from './catalogo.js';
export {
  crearProfesional,
  listarProfesionales,
  modificarProfesional,
  obtenerProfesional,
  type CambiosDeProfesionalEntrada,
  type DependenciasDeProfesionales,
  type NuevoProfesionalEntrada,
} from './profesionales.js';
export {
  crearSillon,
  listarSillones,
  modificarSillon,
  obtenerSillon,
  type CambiosDeSillonEntrada,
  type DependenciasDeSillones,
  type NuevoSillonEntrada,
} from './sillones.js';
export {
  crearPrestacion,
  listarPrestaciones,
  modificarPrestacion,
  obtenerPrestacion,
  type CambiosDePrestacionEntrada,
  type DependenciasDePrestaciones,
  type NuevaPrestacionEntrada,
} from './prestaciones.js';
export {
  obtenerHorarios,
  reemplazarHorarios,
  type DependenciasDeHorarios,
  type HorariosDto,
} from './horarios.js';
export {
  PLANTILLAS_FERIADOS_NACIONALES,
  plantillaDeFeriados,
  type FeriadoDePlantilla,
} from './feriados-nacionales.js';
export {
  copiarPlantilla,
  crearFeriado,
  eliminarFeriado,
  listarFeriados,
  obtenerPlantilla,
  type DependenciasDeFeriados,
  type PlantillaDeFeriados,
  type ResultadoDeCopia,
} from './feriados.js';
