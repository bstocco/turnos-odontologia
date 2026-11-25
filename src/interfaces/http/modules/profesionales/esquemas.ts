import Type, { type Static } from 'typebox';

const PARAMS_ID = Type.Object({ id: Type.String() });
export const ParamsDeId = PARAMS_ID;

/** Texto obligatorio: se rechazan los vacíos y los de solo espacios (el recorte lo hace la aplicación). */
const textoObligatorio = (maximo: number) =>
  Type.String({ minLength: 1, maxLength: maximo, pattern: '\\S' });

/**
 * `string | null` como `type: [...]` (no como `anyOf`): con `coerceTypes` de Ajv, un `anyOf` que
 * empieza por `string` convertiría `null` en `""`.
 */
const textoONulo = (maximo: number) =>
  Type.Unsafe<string | null>({
    type: ['string', 'null'],
    minLength: 1,
    maxLength: maximo,
    pattern: '\\S',
  });

export const ProfesionalDto = Type.Object({
  id: Type.String(),
  nombre: Type.String(),
  apellido: Type.String(),
  matricula: Type.Unsafe<string | null>({ type: ['string', 'null'] }),
  activo: Type.Boolean(),
});

export const ListaDeProfesionales = Type.Array(ProfesionalDto);

export const FiltroDeLista = Type.Object(
  { activo: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
export type FiltroDeLista = Static<typeof FiltroDeLista>;

export const AltaDeProfesionalBody = Type.Object(
  {
    nombre: textoObligatorio(100),
    apellido: textoObligatorio(100),
    matricula: Type.Optional(textoONulo(50)),
  },
  { additionalProperties: false },
);
export type AltaDeProfesionalBody = Static<typeof AltaDeProfesionalBody>;

export const ModificarProfesionalBody = Type.Object(
  {
    nombre: Type.Optional(textoObligatorio(100)),
    apellido: Type.Optional(textoObligatorio(100)),
    matricula: Type.Optional(textoONulo(50)),
    activo: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ModificarProfesionalBody = Static<typeof ModificarProfesionalBody>;

const HORA = '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$';

const Franja = Type.Object(
  {
    diaSemana: Type.Integer({ minimum: 0, maximum: 6 }),
    horaDesde: Type.String({ pattern: HORA }),
    horaHasta: Type.String({ pattern: HORA }),
  },
  { additionalProperties: false },
);

export const HorariosDto = Type.Object({
  profesionalId: Type.String(),
  franjas: Type.Array(Franja),
});

export const ReemplazarHorariosBody = Type.Object(
  { franjas: Type.Array(Franja, { maxItems: 50 }) },
  { additionalProperties: false },
);
export type ReemplazarHorariosBody = Static<typeof ReemplazarHorariosBody>;
