import { normalizeStr } from '@/utils/predictiveAnalytics'

/**
 * Netting stock ↔ feuille de course (Règle métier DataFriday).
 *
 * Le besoin de la feuille de course est réduit par le stock déjà présent :
 *  - stock DANS les shops (réduit le besoin, déjà appliqué en produits finis) ;
 *  - stock EN STORAGE (réserve centrale, réduit la quantité à acheter).
 * Le Storage ne réduit JAMAIS le restock d'un shop précis (il n'y est pas
 * physiquement). Un pool est une liste d'entrées de stock agrégées :
 *   { itemId, sourceId, marketPriceId, name, unit, qty }
 * (on y ajoute `remaining` et `matched` au moment de consommer).
 */

/** Identité d'un item (besoin ou entrée de pool) pour le matching. */
export function itemIdentity(item) {
  return {
    itemId: item?.itemId != null ? String(item.itemId) : null,
    sourceId: item?.sourceId != null ? String(item.sourceId) : null,
    marketPriceId: item?.marketPriceId != null ? String(item.marketPriceId) : null,
    name: item?.itemName || item?.name || '',
    unit: item?.unit || '',
  }
}

/** Ensemble des ids d'un item/entrée (itemId, sourceId, marketPriceId). */
function idSet(obj) {
  return new Set(
    [obj?.itemId, obj?.sourceId, obj?.marketPriceId]
      .filter((v) => v != null)
      .map(String),
  )
}

/**
 * Soustrait le stock d'un pool pour un item de besoin. Deux niveaux, du plus
 * fiable au plus souple :
 *   1. intersection d'ids — un id quelconque de l'item (itemId/sourceId/
 *      marketPriceId) présent dans les ids de l'entrée. Robuste au fait que la
 *      clé de comptage Storage (itemId) puisse être le sourceId d'un ingrédient.
 *   2. nom normalisé (accents/casse ignorés) en repli.
 * On s'arrête au premier niveau qui matche (pas de double comptage). Les entrées
 * consommées sont mutées (`remaining = 0`, `matched = true`) → détecte le stock
 * non rattaché (jamais `matched`). Retourne la quantité soustraite.
 */
export function consumeFromPool(item, pool) {
  if (!pool || !pool.length) return 0
  const need = itemIdentity(item)
  const needIds = idSet(need)
  const needName = need.name ? normalizeStr(need.name) : ''
  const matchers = [
    (e) => needIds.size > 0 && [...idSet(e)].some((id) => needIds.has(id)),
    (e) => needName && e.name && normalizeStr(e.name) === needName,
  ]
  let cut = 0
  for (const matches of matchers) {
    for (const e of pool) {
      if (e.remaining <= 0 || !matches(e)) continue
      cut += e.remaining
      e.remaining = 0
      e.matched = true
    }
    if (cut > 0) break
  }
  return cut
}

/** Prépare un pool consommable (copie avec `remaining`/`matched`). */
export function preparePool(entries) {
  return (entries || []).map((e) => ({ ...e, remaining: e.qty, matched: false }))
}
