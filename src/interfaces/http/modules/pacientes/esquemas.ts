import Type, { type Static } from 'typebox';

export const ParamsDeId = Type.Object({ id: Type.String() });

/** Texto obligatorio: se rechazan los vacíos y los de solo espacios (el recorte lo hace la aplicación). */
const textoObligatorio = (maximo: number) =>
  Type.String({ minLength: 1, maxLength: maximo, pattern: '\\S' });

/**
 * `string | null` como `type: [...]` (no como `anyOf`): con `coerceTypes` de Ajv, un `anyOf` que
 * empieza por `string` convertiría `null` en `""`.
 */
const textoONulo = (maximo: number, formato?: string) =>
  Type.Unsafe<string | null>({
    type: ['string', 'null'],
    minLength: 1,
    maxLength: maximo,
    pattern: '\\S',
    ...(formato === undefined ? {} : { format: formato }),
  });

/** Ficha completa (design D10): lista blanca de serialización, sin `clinicaId`. */
export const PacienteDto = Type.Object({
  id: Type.String(),
  nombre: Type.String(),
  apellido: Type.String(),
  dni: Type.String(),
  telefono: Type.String(),
  email: Type.Unsafe<string | null>({ type: ['string', 'null'] }),
  obraSocial: Type.Unsafe<string | null>({ type: ['string', 'null'] }),
  creadoEn: Type.String(),
});

/** Elemento de la lista de búsqueda (design D8): sin teléfono, email ni obra social. */
export const PacienteResumenDto = Type.Object({
  id: Type.String(),
  nombre: Type.String(),
  apellido: Type.String(),
  dni: Type.String(),
});

export const ListaDePacientes = Type.Array(PacienteResumenDto);

/** El DNI y el teléfono se validan en la aplicación (códigos propios `DNI_INVALIDO` y `TELEFONO_INVALIDO`). */
export const AltaDePacienteBody = Type.Object(
  {
    nombre: textoObligatorio(100),
    apellido: textoObligatorio(100),
    dni: Type.String({ minLength: 1, maxLength: 20 }),
    telefono: Type.String({ minLength: 1, maxLength: 30 }),
    email: Type.Optional(textoONulo(254, 'email')),
    obraSocial: Type.Optional(textoONulo(100)),
  },
  { additionalProperties: false },
);
export type AltaDePacienteBody = Static<typeof AltaDePacienteBody>;

export const ModificarPacienteBody = Type.Object(
  {
    nombre: Type.Optional(textoObligatorio(100)),
    apellido: Type.Optional(textoObligatorio(100)),
    dni: Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
    telefono: Type.Optional(Type.String({ minLength: 1, maxLength: 30 })),
    email: Type.Optional(textoONulo(254, 'email')),
    obraSocial: Type.Optional(textoONulo(100)),
  },
  { additionalProperties: false },
);
export type ModificarPacienteBody = Static<typeof ModificarPacienteBody>;

/** Exactamente un criterio lo exige la aplicación (`BUSQUEDA_INVALIDA`). */
export const BusquedaQuery = Type.Object(
  {
    dni: Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
    apellido: Type.Optional(Type.String({ maxLength: 100 })),
    limite: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);
export type BusquedaQuery = Static<typeof BusquedaQuery>;
