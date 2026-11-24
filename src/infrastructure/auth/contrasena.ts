import { hash, verify } from 'argon2';

/** Hash argon2id de la contraseña (regla 10): contraseñas nunca se guardan en claro. */
export async function hashContrasena(contrasena: string): Promise<string> {
  return await hash(contrasena);
}

/** Verifica la contraseña contra el hash argon2id guardado; `false` al no coincidir. */
export async function verificarContrasena(
  hashGuardado: string,
  contrasena: string,
): Promise<boolean> {
  return (await verify(hashGuardado, contrasena)) === true;
}
