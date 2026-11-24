import Type, { type Static } from 'typebox';

/** Respuesta: lista blanca de serialización (design D6). */
export const ClinicaDto = Type.Object({
  id: Type.String(),
  nombre: Type.String(),
  slug: Type.String(),
  zonaHoraria: Type.String(),
  reservaRequiereConfirmacion: Type.Boolean(),
  cancelacionAnticipacionHoras: Type.Integer(),
  granularidadMinutos: Type.Integer(),
});

/** Ajv quita los campos desconocidos (`additionalProperties: false`); el vacío lo valida la aplicación. */
export const ModificarClinicaBody = Type.Object(
  {
    reservaRequiereConfirmacion: Type.Optional(Type.Boolean()),
    cancelacionAnticipacionHoras: Type.Optional(Type.Integer({ minimum: 0, maximum: 720 })),
    granularidadMinutos: Type.Optional(Type.Integer({ minimum: 5, maximum: 240 })),
  },
  { additionalProperties: false },
);
export type ModificarClinicaBody = Static<typeof ModificarClinicaBody>;
