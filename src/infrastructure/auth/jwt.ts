import { jwtVerify, SignJWT } from 'jose';

/**
 * Tokens de acceso del personal con JWT (diseño DD-03): cortos por construcción,
 * firmados con una clave por entorno (`JWT_ACCESS_SECRET`).
 */

/** Vida útil del token de acceso: corta, como decide el diseño. */
const SEGUNDOS_ACIERTO = 15 * 60;

export interface TokenDeAcceso {
  readonly clinicaId: string;
  readonly usuarioId: string;
  readonly rol: string;
}

/** Firma el token de acceso de la clínica y el usuario indicados; devuelve el JWT compacto. */
export async function firmarTokenDeAcceso(secreto: string, token: TokenDeAcceso): Promise<string> {
  return await new SignJWT({
    clinica_id: token.clinicaId,
    usuario_id: token.usuarioId,
    rol: token.rol,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SEGUNDOS_ACIERTO)
    .sign(new TextEncoder().encode(secreto));
}

/**
 * Verifica el JWT de acceso y devuelve su contexto (clínica, usuario y rol).
 * Devuelve `undefined` si no es válido, vencido o no verifica con la clave.
 */
export async function verificarTokenDeAcceso(
  secreto: string,
  jwt: string,
): Promise<TokenDeAcceso | undefined> {
  try {
    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(secreto));
    return {
      clinicaId: String(payload.clinica_id),
      usuarioId: String(payload.usuario_id),
      rol: String(payload.rol),
    };
  } catch {
    return undefined;
  }
}
