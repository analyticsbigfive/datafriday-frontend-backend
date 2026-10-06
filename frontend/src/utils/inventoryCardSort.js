// Tri des cartes de l'écran Inventory (colonne centre).
//
// Extrait de `SpaceInventoryView.filteredCards` pour être testable sans monter
// la vue. Pur : aucun Vuex, aucun Vuetify.
//
// Document Bertrand « Pre et Post event Inventory cycle » (2026-10-06, pages 7
// et 8) : les tris « Nom », « À compter d'abord » et « Stock croissant » sont
// supprimés, la liste est toujours classée par ordre alphabétique.

/** Articles d'une carte, quel que soit l'onglet (shops / storage / merch). */
export function itemsOfCard(card) {
  return card?.consolidatedInventory || card?.storageInventory || card?.merchInventory || []
}

/**
 * Comparateur de cartes : ordre alphabétique (insensible à la casse et aux
 * accents). Les cartes vides restent en dernier : rien à y compter, leur bouton
 * est désactivé.
 */
export function compareInventoryCards(a, b) {
  const emptyA = itemsOfCard(a).length === 0 ? 1 : 0
  const emptyB = itemsOfCard(b).length === 0 ? 1 : 0
  if (emptyA !== emptyB) return emptyA - emptyB
  return String(a?.element?.name || '').localeCompare(String(b?.element?.name || ''), 'fr', {
    sensitivity: 'base',
  })
}
