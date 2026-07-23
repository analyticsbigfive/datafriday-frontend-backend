// Construction des lignes de réconciliation post-événement (Post-event Inventory).
//
// Pour chaque article × PdV : écart entre le COMPTÉ (inventaire post-match) et
// « ce qui devrait rester après les ventes » (inventaire pré-événement − vendus).
// Fonctions PURES (aucun accès store/API/DOM) — les appelants fournissent des
// index déjà réduits en UNITÉS (la conversion packed/loose × conditionnement
// reste chez eux, cf. formule canonique `totalForItem`).
//
// Sémantique des null (jamais 0 par défaut — un 0 fabriqué fausse les écarts) :
// - `predictedUnitsByKey` null (aucun scénario Event Predict) → predictedUnits null.
//   Scénario présent mais article absent → 0 (le scénario prédit réellement 0).
// - `preEventUnitsByKey` null (aucun inventaire pré-événement) → leftFromSales,
//   missingUnits, missingValue null.
// - `unitCost` absent → missingValue null (pas de valorisation inventée).
//
// Consommateurs : SpaceInventoryView (création du document à la sauvegarde),
// InventoryReconciliationView (chips résumé via computeReconciliationSummary).
// Doc : docs/modules/10_POST_EVENT_INVENTORY.md §7.

const round2 = (n) => Math.round(n * 100) / 100

const toUnits = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Clé canonique d'une ligne : PdV + article. */
export function reconciliationKey(elementId, itemId) {
  return `${elementId}|${itemId}`
}

/**
 * Construit les lignes du document.
 *
 * Tous les index sont des Object/Map `reconciliationKey(elementId,itemId) → unités`,
 * SAUF `predictedUnitsByKey`/`preEventUnitsByKey` qui peuvent être null (source
 * absente — voir sémantique ci-dessus). L'union des clés des quatre sources fait
 * foi : un article compté jamais vendu, ou vendu jamais compté, produit bien une
 * ligne.
 *
 * @param {object} params
 * @param {Record<string, number>} params.countedUnitsByKey   comptage post-événement
 * @param {Record<string, number>|null} [params.preEventUnitsByKey]  inventaire pré-événement
 * @param {Record<string, number>} [params.soldUnitsByKey]    ventes pendant l'événement
 * @param {Record<string, number>|null} [params.predictedUnitsByKey] prédictions du scénario
 * @param {Record<string, number>} [params.unitCostByItemId]  coût unitaire par article
 * @param {Map<string, string>|Record<string, string>} [params.elementNameById]
 * @param {Map<string, string>|Record<string, string>} [params.itemNameById]
 * @returns {Array<object>} lignes triées (PdV puis article)
 */
export function buildPostEventReconciliationLines({
  countedUnitsByKey = {},
  preEventUnitsByKey = null,
  soldUnitsByKey = {},
  predictedUnitsByKey = null,
  unitCostByItemId = {},
  elementNameById = {},
  itemNameById = {},
} = {}) {
  const nameOf = (source, id) => {
    if (!source) return ''
    const v = source instanceof Map ? source.get(String(id)) : source[String(id)]
    return v || ''
  }

  const keys = new Set([
    ...Object.keys(countedUnitsByKey || {}),
    ...Object.keys(soldUnitsByKey || {}),
    ...Object.keys(predictedUnitsByKey || {}),
    ...Object.keys(preEventUnitsByKey || {}),
  ])

  const hasPreEvent = preEventUnitsByKey != null
  const hasScenario = predictedUnitsByKey != null

  const lines = []
  for (const key of keys) {
    const sep = key.indexOf('|')
    if (sep <= 0) continue // clé inadressable (elementId vide) → ligne inexploitable
    const elementId = key.slice(0, sep)
    const itemKey = key.slice(sep + 1)
    if (!itemKey) continue

    const soldUnits = round2(toUnits(soldUnitsByKey?.[key]))
    const countedUnits = round2(toUnits(countedUnitsByKey?.[key]))
    const predictedUnits = hasScenario ? round2(toUnits(predictedUnitsByKey?.[key])) : null

    let leftFromSales = null
    let missingUnits = null
    let missingValue = null
    let unitCost = null
    if (hasPreEvent) {
      const preEvent = toUnits(preEventUnitsByKey?.[key])
      leftFromSales = round2(preEvent - soldUnits)
      missingUnits = round2(leftFromSales - countedUnits)
      const cost = Number(unitCostByItemId?.[itemKey])
      if (Number.isFinite(cost)) {
        unitCost = cost
        missingValue = round2(missingUnits * cost)
      }
    }

    lines.push({
      elementId,
      elementName: nameOf(elementNameById, elementId),
      itemKey,
      itemName: nameOf(itemNameById, itemKey),
      soldUnits,
      predictedUnits,
      leftFromSales,
      countedUnits,
      missingUnits,
      missingValue,
      unitCost,
    })
  }

  lines.sort(
    (a, b) =>
      a.elementName.localeCompare(b.elementName) ||
      a.itemName.localeCompare(b.itemName) ||
      a.itemKey.localeCompare(b.itemKey),
  )
  return lines
}

/**
 * Chips résumé d'un document (recalculées à l'affichage — le document ne
 * persiste pas de summary, il reste self-contained par ses lignes).
 *
 * - `diffPct` = (Σ vendu − Σ prédit) / Σ prédit — null si aucune ligne prédite
 *   ou Σ prédit = 0 (éviter le ±Infinity).
 * - `totalMissingUnits`/`totalMissingValue` ne somment que les manquants
 *   POSITIFS (un surplus sur un article ne « rembourse » pas la perte d'un
 *   autre) ; null si aucune ligne n'a de missing calculable.
 *
 * @param {Array<object>} lines
 * @returns {{totalSold:number, totalPredicted:number|null, diffPct:number|null,
 *   totalMissingUnits:number|null, totalMissingValue:number|null}}
 */
export function computeReconciliationSummary(lines = []) {
  let totalSold = 0
  let totalPredicted = 0
  let hasPredicted = false
  let totalMissingUnits = 0
  let hasMissing = false
  let totalMissingValue = 0
  let hasMissingValue = false

  for (const l of lines) {
    totalSold += toUnits(l?.soldUnits)
    if (l?.predictedUnits != null) {
      hasPredicted = true
      totalPredicted += toUnits(l.predictedUnits)
    }
    if (l?.missingUnits != null) {
      hasMissing = true
      if (l.missingUnits > 0) {
        totalMissingUnits += l.missingUnits
        if (l?.missingValue != null && l.missingValue > 0) {
          hasMissingValue = true
          totalMissingValue += l.missingValue
        }
      }
    }
  }

  return {
    totalSold: round2(totalSold),
    totalPredicted: hasPredicted ? round2(totalPredicted) : null,
    diffPct:
      hasPredicted && totalPredicted > 0
        ? round2(((totalSold - totalPredicted) / totalPredicted) * 100)
        : null,
    totalMissingUnits: hasMissing ? round2(totalMissingUnits) : null,
    totalMissingValue: hasMissingValue ? round2(totalMissingValue) : null,
  }
}
