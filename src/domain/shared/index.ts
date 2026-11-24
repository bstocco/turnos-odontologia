/** API pública de `shared`. CONTRATO CONGELADO (regla dura 14): cambios solo por PR del dueño con aviso. */
export { ErrorDeDominio, type TipoDeError } from './errores.js';
export type { Marcado, PacienteId, PrestacionId, ProfesionalId, SillonId, TurnoId } from './ids.js';
export { error, ok, valorOLanzar, type Resultado } from './resultado.js';
