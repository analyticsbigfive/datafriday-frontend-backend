// Tri des cartes de l'écran Inventory (colonne centre).
//
// Extrait de `SpaceInventoryView.filteredCards` pour être testable sans monter
// une vue de 3400 lignes. Purs : aucun Vuex, aucun Vuetify — les accesseurs sont
// injectés par l'appelant.
//
// Historique du défaut corrigé : « Stock croissant » réduisait `it.expected ??
// it.quantity`, deux champs qui n'existent sur AUCUN item de carte
// (`buildConsolidatedInventory` / `buildStorageInventory` / merch n'en produisent
// pas). Toutes les cartes scoraient 0, le tri stable retombait sur l'ordre source
// et la chip semblait « ne rien faire ». La clé est désormais l'indice de
// référence de l'écran (besoin prédit avant match, stock restant après), avec
// repli sur le compté quand il n'y a pas d'indice.

/** Articles d'une carte, quel que soit l'onglet (shops / storage / merch). */
export function itemsOfCard(card) {
  return card?.consolidatedInventory || card?.storageInventory || card?.merchInventory || []
}

/**
 * Score « stock » d'une carte = Σ des indices article par article, avec repli sur
 * les unités comptées. Coalescence PAR ARTICLE (pas par carte) : un PdV dont la
 * moitié des articles est prédite garde l'information des deux moitiés.
 * @param {object} card
 * @param {{expectedUnitsFor?: Function, countedUnitsFor?: Function}} accessors
 */
export function cardStockScore(card, { expectedUnitsFor, countedUnitsFor } = {}) {
  let sum = 0
  for (const item of itemsOfCard(card)) {
    const expected = expectedUnitsFor ? expectedUnitsFor(card.element.id, item) : null
    if (Number.isFinite(expected)) {
      sum += expected
      continue
    }
    const counted = countedUnitsFor ? countedUnitsFor(card.element.id, item) : 0
    sum += Number(counted) || 0
  }
  return sum
}

/** Nombre d'articles non comptés d'une carte. */
export function cardToCountScore(card, { isItemCounted } = {}) {
  if (!isItemCounted) return 0
  return itemsOfCard(card).filter((it) => !isItemCounted(card.element.id, it.id)).length
}

/**
 * Comparateur de cartes. Cartes vides toujours en dernier (rien à y compter),
 * puis le critère du mode, puis le NOM — ce départage évite de retomber sur
 * l'ordre d'insertion de l'API quand tous les scores sont égaux (le cas courant
 * dans l'onglet « Comptés », où tout vaut 0).
 * @param {'name'|'to-count'|'stock-asc'} mode
 */
export function compareInventoryCards(a, b, { mode = 'name', ...accessors } = {}) {
  const emptyA = itemsOfCard(a).length === 0 ? 1 : 0
  const emptyB = itemsOfCard(b).length === 0 ? 1 : 0
  if (emptyA !== emptyB) return emptyA - emptyB

  if (mode === 'to-count') {
    const d = cardToCountScore(b, accessors) - cardToCountScore(a, accessors)
    if (d) return d
  } else if (mode === 'stock-asc') {
    const d = cardStockScore(a, accessors) - cardStockScore(b, accessors)
    if (d) return d
  }
  return String(a?.element?.name || '').localeCompare(String(b?.element?.name || ''), 'fr', {
    sensitivity: 'base',
  })
}
