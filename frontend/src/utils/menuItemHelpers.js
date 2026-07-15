// Helpers de résolution catégorie / type pour les menu items.
// Port JS de versionReact/src/app/utils/menuItemHelpers.ts (types TS supprimés).

/**
 * Retourne la catégorie d'affichage d'un menu item.
 * Gère la rétro-compat entre l'ancien champ `category` et le nouveau système `categoryId`.
 *
 * @param {Object} item - Le menu item
 * @param {(categoryId: string|undefined) => string} [getCategoryName] - Résout categoryId -> nom
 * @returns {string} Nom de catégorie à afficher
 */
export function getMenuItemCategory(item, getCategoryName) {
  // Si on a un categoryId et un resolver, on utilise le nouveau système
  if (item && item.categoryId && getCategoryName) {
    const resolvedName = getCategoryName(item.categoryId)
    if (resolvedName) return resolvedName
  }

  // Fallback sur l'ancien champ category
  return (item && (item.category || item.categoryLegacy)) || ''
}

/**
 * Retourne le type d'affichage d'un menu item.
 * Gère la rétro-compat entre l'ancien champ `type` et le nouveau système `typeId`.
 *
 * @param {Object} item - Le menu item
 * @param {(typeId: string|undefined) => string} [getTypeName] - Résout typeId -> nom
 * @returns {string} Nom de type à afficher
 */
export function getMenuItemType(item, getTypeName) {
  // Si on a un typeId et un resolver, on utilise le nouveau système
  if (item && item.typeId && getTypeName) {
    const resolvedName = getTypeName(item.typeId)
    if (resolvedName) return resolvedName
  }

  // Fallback sur l'ancien champ type
  return (item && (item.type || item.typeLegacy)) || ''
}
