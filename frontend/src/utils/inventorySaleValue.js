// Valeur de vente HT du stock compté (« Résumé Inventaire ») : fonctions PURES.
//
// Une ligne agrégée porte `shops[]`, une entrée par PdV :
//   { shopId, itemId, totalUnits, cost, ... }
// `itemId` relie l'entrée à son prix de vente HT (map itemId -> unitPriceHt, même base
// d'unité que le coût unitaire). Valeur HT d'une entrée = lineCost(unités, prix).
//
// Règles : jamais de 0 fabriqué (pas de prix = pas de valeur) ; la marge n'est calculée
// que sur les entrées qui ont À LA FOIS un prix de vente et un coût, pour ne jamais
// mélanger une ligne sans prix (ou sans coût) dans le numérateur ou le dénominateur.
import { lineCost } from '@/utils/reconciliationAggregate'
import { effectiveSelection } from '@/utils/inventoryFilters'

const round2 = (n) => Math.round(n * 100) / 100

/** Marge en % = (HT - coût) / HT ; null si HT absent ou <= 0 (formule du projet). */
export function marginPercent(totalHt, cost) {
  const ht = Number(totalHt)
  if (!(ht > 0)) return null
  return ((ht - (Number(cost) || 0)) / ht) * 100
}

/** Prix HT unitaire d'un article dans la map (clé en chaîne), null si absent. */
function priceOf(prices, itemId) {
  if (itemId == null || !prices) return null
  const p = prices instanceof Map ? prices.get(String(itemId)) : prices[String(itemId)]
  const n = Number(p)
  return p != null && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Valeur de vente d'une ligne agrégée.
 * @returns {{ ht: number|null, margin: number|null, hasUnits: boolean }}
 *   ht = somme des entrées avec prix ; margin = % sur les entrées avec prix ET coût ;
 *   hasUnits = la ligne a du stock compté (sert à signaler « sans prix »).
 */
export function rowSaleValue(row, prices) {
  let ht = null
  let marginHt = 0
  let marginCost = 0
  let hasUnits = false
  for (const s of row?.shops || []) {
    const units = Number(s.totalUnits || 0)
    if (units > 0) hasUnits = true
    const value = lineCost(units, priceOf(prices, s.itemId))
    if (value == null) continue
    ht = (ht || 0) + value
    const cost = Number(s.cost)
    if (cost > 0) {
      marginHt += value
      marginCost += cost
    }
  }
  return {
    ht: ht == null ? null : round2(ht),
    margin: marginPercent(marginHt, marginCost),
    hasUnits,
  }
}

/**
 * Totaux sur le périmètre filtré : les articles sélectionnés seulement, sinon toute la
 * liste affichée (même règle que le coût total).
 * @returns {{ totalHt: number|null, margin: number|null, unpricedCount: number }}
 */
export function summarizeSaleValue(rows, prices, selectedNames = []) {
  const list = rows || []
  const selected = effectiveSelection(list, selectedNames)
  const scope = selected.length ? list.filter((r) => selected.includes(r.itemName)) : list
  let totalHt = null
  let marginHt = 0
  let marginCost = 0
  let unpricedCount = 0
  for (const row of scope) {
    const { ht, hasUnits } = rowSaleValue(row, prices)
    if (ht == null) {
      if (hasUnits) unpricedCount += 1
      continue
    }
    totalHt = (totalHt || 0) + ht
    // Marge globale : on ne recompte que les entrées prix + coût de chaque ligne.
    for (const s of row.shops || []) {
      const value = lineCost(Number(s.totalUnits || 0), priceOf(prices, s.itemId))
      const cost = Number(s.cost)
      if (value != null && cost > 0) {
        marginHt += value
        marginCost += cost
      }
    }
  }
  return {
    totalHt: totalHt == null ? null : round2(totalHt),
    margin: marginPercent(marginHt, marginCost),
    unpricedCount,
  }
}
