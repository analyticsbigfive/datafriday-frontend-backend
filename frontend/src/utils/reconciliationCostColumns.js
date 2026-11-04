// Colonnes « Coût inventaire » et « Coût perte » des tableaux de réconciliation.
//
// Règle maison : jamais un 0 € fabriqué. Une ligne sans coût unitaire (absent ou
// nul) vaut null (affichée « — ») ; un total agrégé ignore ces lignes, et reste
// null si AUCUNE ligne du groupe n'est valorisable.
//
// Fonctions PURES (testables sans Vue).

const round2 = (n) => Math.round(n * 100) / 100

const positive = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const finiteOrNull = (v) => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Coûts d'UNE ligne de réconciliation.
 *  - inventoryCost : quantité comptée × coût unitaire.
 *  - lossCost : quantité manquante × coût unitaire, en valeur positive.
 *    Post-event : missingUnits. Pre-event : écart négatif, max(0, -deltaUnits).
 *    Un surplus n'est pas une perte (0 si la ligne est valorisable).
 * Rétro-compatible : tout est recalculé depuis les unités et `unitCost`, aucun
 * champ nouveau n'est requis sur les réconciliations déjà figées.
 *
 * @param {object} line  { unitCost, countedUnits, missingUnits | deltaUnits }
 * @param {{isPre?: boolean}} [opts]
 * @returns {{inventoryCost:number|null, lossCost:number|null}}
 */
export function lineCostColumns(line, { isPre = false } = {}) {
  const cost = positive(line?.unitCost)
  if (cost == null) return { inventoryCost: null, lossCost: null }
  const counted = finiteOrNull(line?.countedUnits)
  const inventoryCost = counted == null ? null : round2(counted * cost)
  const missing = isPre
    ? (finiteOrNull(line?.deltaUnits) == null ? null : -Number(line.deltaUnits))
    : finiteOrNull(line?.missingUnits)
  const lossCost = missing == null ? null : round2(Math.max(0, missing) * cost)
  return { inventoryCost, lossCost }
}

/**
 * Somme null-aware des coûts d'une liste d'entrées { inventoryCost, lossCost }
 * (les lignes d'un groupe). Null si aucune entrée n'est valorisée.
 * @returns {{inventoryCost:number|null, lossCost:number|null}}
 */
export function sumCostColumns(entries) {
  let inv = null
  let loss = null
  for (const e of entries || []) {
    if (e?.inventoryCost != null) inv = (inv ?? 0) + e.inventoryCost
    if (e?.lossCost != null) loss = (loss ?? 0) + e.lossCost
  }
  return {
    inventoryCost: inv == null ? null : round2(inv),
    lossCost: loss == null ? null : round2(loss),
  }
}
