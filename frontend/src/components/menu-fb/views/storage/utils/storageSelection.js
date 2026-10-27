/** Logique pure de la sélection multiple de la page Stockage (par clé de carte). */

/** Garde uniquement les clés qui existent encore parmi les cartes. */
export function pruneSelection(keys, cards) {
  const existing = new Set((cards || []).map((c) => c.key))
  return (keys || []).filter((k) => existing.has(k))
}

/** Ajoute ou retire une clé, sans muter le tableau d'origine. */
export function toggleKey(keys, key) {
  const list = keys || []
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
}

/** Cartes cochées, dans l'ordre des cartes. */
export function selectedCardsOf(cards, keys) {
  const set = new Set(keys || [])
  return (cards || []).filter((c) => set.has(c.key))
}

/** Espaces communs à toutes les cartes (intersection des spaceIds, ordre de la première carte). */
export function commonSpaceIds(cards) {
  const list = cards || []
  if (!list.length) return []
  const sets = list.map((c) => new Set((c.spaceIds || []).map(String)))
  return Array.from(sets[0]).filter((id) => sets.every((s) => s.has(id)))
}

/**
 * Espaces affichés sur une carte : si la carte est cochée et que la sélection compte au moins
 * 2 cartes, uniquement les espaces communs à toutes les cartes cochées ; sinon ses propres espaces.
 */
export function displayedSpaceIds(card, selectedCards) {
  if (selectedCards.length >= 2 && selectedCards.some((c) => c.key === card.key)) {
    return commonSpaceIds(selectedCards)
  }
  return (card.spaceIds || []).map(String)
}

/** Noms de produits distincts (ordre conservé) d'une liste de cartes. */
export function distinctProductNames(cards) {
  return Array.from(new Set((cards || []).map((c) => c.name).filter(Boolean)))
}

/**
 * Produits à passer au drawer lors d'un clic sur un espace : tous les produits cochés si la carte
 * est cochée et que la sélection compte au moins 2 cartes, sinon le seul produit de la carte.
 */
export function productsForSpaceClick(card, selectedCards) {
  if (selectedCards.length >= 2 && selectedCards.some((c) => c.key === card.key)) {
    return distinctProductNames(selectedCards)
  }
  return [card.name]
}
