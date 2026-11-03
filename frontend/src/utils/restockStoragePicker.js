/**
 * Sélecteur « Ajouter un article » de l'onglet STOCK (étape 1 de Commande).
 * Fonctions pures : une entrée par produit (nom) à partir des cartes de la page Stockage.
 */

const norm = (s) => String(s || '').trim().toLowerCase()

/**
 * Une entrée par nom de produit (une carte existe par ensemble d'espaces). On garde la première
 * carte portant un marketPriceId, sinon la première. Triées par nom.
 *
 * @returns {Array<{ name: string, marketPriceId: string, reference: string, type: string, category: string }>}
 */
export function pickerProducts(cards) {
  const byName = new Map()
  for (const c of cards || []) {
    const name = String(c?.name || '').trim()
    if (!name) continue
    const key = norm(name)
    const prev = byName.get(key)
    if (!prev || (!prev.marketPriceId && c.marketPriceId)) {
      byName.set(key, {
        name: prev ? prev.name : name,
        marketPriceId: c.marketPriceId ? String(c.marketPriceId) : '',
        reference: c.reference || name,
        type: c.type || '',
        category: c.category || '',
      })
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Cartes de la page Stockage proposées pour un espace : celles dont les espaces (sites du
 * fournisseur) incluent l'espace, ou sans espace (fournisseur commun à tous les espaces, même
 * contrat que Supplier.sites). Sans espace demandé : toutes.
 */
export function cardsForSpace(cards, spaceId) {
  if (!spaceId) return cards || []
  const id = String(spaceId)
  return (cards || []).filter((c) => {
    const ids = c?.spaceIds || []
    return !ids.length || ids.map(String).includes(id)
  })
}
