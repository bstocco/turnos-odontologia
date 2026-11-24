import Type, { type Static } from 'typebox';

export const ParamsDeId = Type.Object({ id: Type.String() });

const ANIO = () => Type.Integer({ minimum: 2000, maximum: 2100 });

export const FeriadoDto = Type.Object({
  id: Type.String(),
  fecha: Type.String(),
  descripcion: Type.String(),
});

export const ListaDeFeriados = Type.Array(FeriadoDto);

export const FiltroDeFeriados = Type.Object(
  { anio: Type.Optional(ANIO()) },
  { additionalProperties: false },
);
export type FiltroDeFeriados = Static<typeof FiltroDeFeriados>;

/** El patrón solo fija la forma; que la fecha exista en el calendario lo valida la aplicación. */
export const AltaDeFeriadoBody = Type.Object(
  {
    fecha: Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
    descripcion: Type.String({ minLength: 1, maxLength: 200, pattern: '[^\\s]' }),
  },
  { additionalProperties: false },
);
export type AltaDeFeriadoBody = Static<typeof AltaDeFeriadoBody>;

export const AnioQuery = Type.Object({ anio: ANIO() }, { additionalProperties: false });
export type AnioQuery = Static<typeof AnioQuery>;

export const CopiarPlantillaBody = Type.Object({ anio: ANIO() }, { additionalProperties: false });
export type CopiarPlantillaBody = Static<typeof CopiarPlantillaBody>;

export const PlantillaDto = Type.Object({
  anio: Type.Integer(),
  feriados: Type.Array(Type.Object({ fecha: Type.String(), descripcion: Type.String() })),
});

export const ResultadoDeCopiaDto = Type.Object({
  anio: Type.Integer(),
  creados: Type.Array(FeriadoDto),
  omitidas: Type.Array(Type.String()),
});
