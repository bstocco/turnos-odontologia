import Type, { type Static } from 'typebox';

const FORMATO_UUID =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const FORMATO_FECHA_HORA_ISO =
  '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$';

export const ParamsDeClinica = Type.Object(
  {
    slug: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);
export type ParamsDeClinica = Static<typeof ParamsDeClinica>;

export const SolicitudCodigoBody = Type.Object(
  {
    email: Type.String({ minLength: 3, maxLength: 254 }),
  },
  { additionalProperties: false },
);
export type SolicitudCodigoBody = Static<typeof SolicitudCodigoBody>;

export const RespuestaCodigoDto = Type.Object(
  {
    enviado: Type.Literal(true),
    vigenciaMinutos: Type.Integer(),
  },
  { additionalProperties: false },
);

export const ErrorPublicoDto = Type.Object(
  {
    codigo: Type.String(),
    mensaje: Type.String(),
  },
  { additionalProperties: false },
);

export const PacienteReservaBody = Type.Object(
  {
    nombre: Type.String({ minLength: 1, maxLength: 120 }),
    apellido: Type.String({ minLength: 1, maxLength: 120 }),
    dni: Type.String({ minLength: 7, maxLength: 20 }),
    telefono: Type.String({ minLength: 6, maxLength: 30 }),
    email: Type.String({ minLength: 3, maxLength: 254 }),
    obraSocial: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
  },
  { additionalProperties: false },
);

export const SolicitudReservaBody = Type.Object(
  {
    profesionalId: Type.String({ pattern: FORMATO_UUID }),
    prestacionId: Type.String({ pattern: FORMATO_UUID }),
    inicio: Type.String({ pattern: FORMATO_FECHA_HORA_ISO }),
    codigoVerificacion: Type.String({ minLength: 4, maxLength: 12 }),
    paciente: PacienteReservaBody,
  },
  { additionalProperties: false },
);
export type SolicitudReservaBody = Static<typeof SolicitudReservaBody>;

export const RespuestaReservaDto = Type.Object(
  {
    turnoId: Type.String(),
    estado: Type.String(),
    inicio: Type.String(),
    fin: Type.String(),
    zonaHoraria: Type.String(),
    profesionalId: Type.String(),
    prestacionId: Type.String(),
  },
  { additionalProperties: false },
);

export const AccionTurnoBody = Type.Object(
  {
    token: Type.String({ minLength: 1, maxLength: 256 }),
    accion: Type.Optional(Type.Union([Type.Literal('confirmar'), Type.Literal('cancelar')])),
  },
  { additionalProperties: false },
);
export type AccionTurnoBody = Static<typeof AccionTurnoBody>;

export const RespuestaAccionTurnoDto = Type.Object(
  {
    turnoId: Type.String(),
    accion: Type.Union([Type.Literal('confirmar'), Type.Literal('cancelar')]),
    estado: Type.String(),
    inicio: Type.String(),
    fin: Type.String(),
  },
  { additionalProperties: false },
);
