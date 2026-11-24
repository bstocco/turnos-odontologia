/** Tipos marcados (branded) para que los identificadores no se mezclen entre sí. */
declare const marca: unique symbol;
export type Marcado<T, M extends string> = T & { readonly [marca]: M };

export type TurnoId = Marcado<string, 'TurnoId'>;
export type ProfesionalId = Marcado<string, 'ProfesionalId'>;
export type SillonId = Marcado<string, 'SillonId'>;
export type PrestacionId = Marcado<string, 'PrestacionId'>;
export type PacienteId = Marcado<string, 'PacienteId'>;
