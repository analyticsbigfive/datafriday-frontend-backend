/**
 * Aide pure pour le chargement des catalogues (store analyse).
 *
 * Ne pas confondre « vide » et « échec » : quand un appel a échoué après ses
 * essais, on ne remplace PAS une liste déjà présente par [] (sinon un échec de
 * revalidation en arrière-plan viderait l'écran), et on n'annonce pas le
 * catalogue comme chargé (sinon le cache 15 min réutilise un catalogue vide).
 */

/** Liste à committer : la précédente si l'appel a échoué et rend vide, sinon la nouvelle. */
export function pickCatalogList(next, error, current) {
  const nextList = Array.isArray(next) ? next : []
  if (error && nextList.length === 0 && Array.isArray(current) && current.length > 0) return current
  return nextList
}

/** Vrai s'il reste au moins une ressource en échec dans { clé: erreur|null }. */
export function hasCatalogError(errors) {
  return !!errors && Object.values(errors).some(Boolean)
}

/** Clés (menuItems, ingredients, components, packagings) en échec. */
export function failedCatalogKeys(errors) {
  return Object.keys(errors || {}).filter((k) => errors[k])
}
