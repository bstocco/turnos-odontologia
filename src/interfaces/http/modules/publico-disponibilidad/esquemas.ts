import Type, { type Static } from 'typebox';

/*
 * Contratos públicos (C-13, design D4/D5). Query y respuesta con `additionalProperties: false`: el
 * serializador de Fastify descarta cualquier campo no declarado (defensa en profundidad).
 */

export const ParamsDeClinica = Type.Object({ slug: Type.String() });

const FORMATO_FECHA = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

export const ConsultaDeDisponibilidadQuery = Type.Object(
  {
    profesionalId: Type.String({ minLength: 1, maxLength: 64 }),
    prestacionId: Type.String({ minLength: 1, maxLength: 64 }),
    desde: Type.String({ pattern: FORMATO_FECHA }),
    hasta: Type.String({ pattern: FORMATO_FECHA }),
  },
  { additionalProperties: false },
);
export type ConsultaDeDisponibilidadQuery = Static<typeof ConsultaDeDisponibilidadQuery>;

export const PrestacionPublicaDto = Type.Object(
  {
    id: Type.String(),
    nombre: Type.String(),
    duracionMinutos: Type.Integer(),
  },
  { additionalProperties: false },
);

export const ListaDePrestacionesPublicas = Type.Object(
  { prestaciones: Type.Array(PrestacionPublicaDto) },
  { additionalProperties: false },
);

export const ProfesionalPublicoDto = Type.Object(
  {
    id: Type.String(),
    nombre: Type.String(),
    apellido: Type.String(),
  },
  { additionalProperties: false },
);

export const ListaDeProfesionalesPublicos = Type.Object(
  { profesionales: Type.Array(ProfesionalPublicoDto) },
  { additionalProperties: false },
);

export const HuecoPublicoDto = Type.Object(
  { inicio: Type.String(), fin: Type.String() },
  { additionalProperties: false },
);

export const DisponibilidadPublicaDto = Type.Object(
  {
    zonaHoraria: Type.String(),
    profesionalId: Type.String(),
    prestacionId: Type.String(),
    desde: Type.String(),
    hasta: Type.String(),
    huecos: Type.Array(HuecoPublicoDto),
  },
  { additionalProperties: false },
);
