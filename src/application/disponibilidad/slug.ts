/** Mismo patrón que el alta interna de clínicas (C-17): minúsculas, dígitos y guiones, 2 a 64. */
const FORMATO_DE_SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** `true` si el slug tiene la forma válida. Un slug inválido se trata como inexistente (404). */
export function validarSlug(slug: string): boolean {
  return FORMATO_DE_SLUG.test(slug);
}
