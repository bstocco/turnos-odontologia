export { consultar } from './consultar.js';
export { CLINICA_DEL_CONTEXTO_SQL, type EjecutorSql, type ResultadoSql } from './ejecutor.js';
export {
  ErrorDePersistencia,
  bloqueoSolapado,
  datosInvalidos,
  feriadoDuplicado,
  franjaSolapada,
  pacienteDniDuplicado,
  recursoNoEncontrado,
  traducirErrorPg,
} from './errores.js';
export { booleano, entero, esUuid, instante, texto, textoONulo, type Fila } from './filas.js';
export { horaAMinutos, minutosAHora } from './horas.js';
