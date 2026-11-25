import Type, { type Static } from 'typebox';

export const ParamsDeId = Type.Object({ id: Type.String() });

const nombre = () => Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' });
const duracion = () => Type.Integer({ minimum: 1, maximum: 480 });

export const PrestacionDto = Type.Object({
  id: Type.String(),
  nombre: Type.String(),
  duracionMinutos: Type.Integer(),
  activa: Type.Boolean(),
});

export const ListaDePrestaciones = Type.Array(PrestacionDto);

/** El filtro se llama `activo` en todos los catálogos; para prestaciones mapea a `activa`. */
export const FiltroDeLista = Type.Object(
  { activo: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
export type FiltroDeLista = Static<typeof FiltroDeLista>;

export const AltaDePrestacionBody = Type.Object(
  { nombre: nombre(), duracionMinutos: duracion() },
  { additionalProperties: false },
);
export type AltaDePrestacionBody = Static<typeof AltaDePrestacionBody>;

export const ModificarPrestacionBody = Type.Object(
  {
    nombre: Type.Optional(nombre()),
    duracionMinutos: Type.Optional(duracion()),
    activa: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ModificarPrestacionBody = Static<typeof ModificarPrestacionBody>;
