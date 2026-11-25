export {
  accesoProhibido,
  busquedaInvalida,
  cambiosVacios,
  dniInvalido,
  recursoNoEncontrado,
} from './errores.js';
export { ALTA_Y_MODIFICACION, LECTURA, exigirRol, type RolDePersonal } from './permisos.js';
export {
  normalizarDni,
  normalizarEmail,
  normalizarTelefono,
  validarCriterioDeBusqueda,
  type CriterioDeBusqueda,
} from './validaciones.js';
export * from './puertos.js';
export {
  LIMITE_POR_DEFECTO,
  aDto,
  buscarPacientes,
  crearPaciente,
  modificarPaciente,
  normalizarAlta,
  normalizarCambios,
  obtenerPaciente,
  type BusquedaEntrada,
  type CambiosDePacienteEntrada,
  type NuevoPacienteEntrada,
} from './pacientes.js';
