import Type, { type Static } from 'typebox';

export const ParamsDeId = Type.Object({ id: Type.String() });

const nombre = () => Type.String({ minLength: 1, maxLength: 100, pattern: '\\S' });

export const SillonDto = Type.Object({
  id: Type.String(),
  nombre: Type.String(),
  bufferMinutos: Type.Integer(),
  activo: Type.Boolean(),
});

export const ListaDeSillones = Type.Array(SillonDto);

export const FiltroDeLista = Type.Object(
  { activo: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
export type FiltroDeLista = Static<typeof FiltroDeLista>;

export const AltaDeSillonBody = Type.Object(
  {
    nombre: nombre(),
    bufferMinutos: Type.Optional(Type.Integer({ minimum: 0, maximum: 240 })),
  },
  { additionalProperties: false },
);
export type AltaDeSillonBody = Static<typeof AltaDeSillonBody>;

export const ModificarSillonBody = Type.Object(
  {
    nombre: Type.Optional(nombre()),
    bufferMinutos: Type.Optional(Type.Integer({ minimum: 0, maximum: 240 })),
    activo: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ModificarSillonBody = Static<typeof ModificarSillonBody>;
