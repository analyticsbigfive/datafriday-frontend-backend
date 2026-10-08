// Espaces d'un composant (demande Bertrand 2026-10-08) : `spaceIds` vide = composant
// commun à tous les espaces. Le filtre Espace de la bibliothèque garde donc, pour un
// espace donné, ses composants ET les composants communs (même règle que le serveur
// pour les comptes restreints, menu-components.service.ts).

export function componentMatchesSpace(component, spaceId) {
  if (!spaceId) return true
  const ids = Array.isArray(component?.spaceIds) ? component.spaceIds.map(String) : []
  return ids.length === 0 || ids.includes(String(spaceId))
}
