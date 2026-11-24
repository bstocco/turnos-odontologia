export interface DatosDeNuevaClinica {
  readonly slug: string;
  readonly nombre: string;
  readonly email: string;
}

export interface ClinicaAprovisionada {
  readonly id: string;
  readonly slug: string;
  /** Contraseña temporal asignada al primer usuario: el llamador la entrega al operador. */
  readonly passwordTemporal: string;
}

export interface AprovisionadorRepositorio {
  crearClinicaConAdmin(datos: DatosDeNuevaClinica): Promise<ClinicaAprovisionada>;
}

/**
 * Aprovisionamiento de una clínica nueva (C-17): orquesta el repositorio
 * (`src/application/aprovisionamiento/**` usa puertos, sin infraestructura — esquema
 * hexagonal).
 */
export async function aprovisionarClinica(
  repositorio: AprovisionadorRepositorio,
  datos: DatosDeNuevaClinica,
): Promise<ClinicaAprovisionada> {
  return await repositorio.crearClinicaConAdmin(datos);
}
