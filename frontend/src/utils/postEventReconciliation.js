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
 * Construit `soldUnitsByKey` depuis la consommation explosée du backend
 * (GET /inventory/:spaceId/event-consumption/:eventId — Q35 Option 1).
 *
 * Chaque ligne backend = { elementId, itemKey, quantity } où `itemKey` est un
 * NOM du référentiel Logistic (ingrédient, composant, ou menu item rfs=Yes).
 * La jointure vers l'article compté se fait par nom normalisé — même contrat
 * que Logistique ↔ front partout ailleurs. Pas de jointure → la quantité sort
 * dans `unjoined` (BUG-238 : jamais avalée en silence).
 *
 * @param {Array<{elementId:string, itemKey:string, quantity:number}>} lines
 * @param {object} params
 * @param {Set<string>} params.elementIdSet        PdV/storages du référentiel compté
 * @param {Map<string,string>} params.itemIdByNormName  nom normalisé → itemId compté
 * @param {(s:any)=>string} params.normalize       normalisation partagée (normalizeStr)
 * @returns {{soldUnitsByKey: Record<string, number>, unjoinedItems: Set<string>,
 *   unjoinedShops: Set<string>, unjoinedUnits: number}}
 */
export function buildSoldUnitsFromConsumption(lines, { elementIdSet, itemIdByNormName, normalize }) {
  const soldUnitsByKey = {}
  const unjoinedItems = new Set()
  const unjoinedShops = new Set()
  let unjoinedUnits = 0
  for (const l of lines || []) {
    const qty = toUnits(l?.quantity)
    if (!qty) continue
    const elementId = l?.elementId != null ? String(l.elementId) : ''
    if (!elementId || !elementIdSet.has(elementId)) {
      if (elementId) unjoinedShops.add(elementId)
      unjoinedUnits += qty
      continue
    }
    const itemId = itemIdByNormName.get(normalize(l?.itemKey))
    if (!itemId) {
      if (l?.itemKey) unjoinedItems.add(String(l.itemKey))
      unjoinedUnits += qty
      continue
    }
    const key = reconciliationKey(elementId, itemId)
    soldUnitsByKey[key] = round2((soldUnitsByKey[key] || 0) + qty)
  }
  return { soldUnitsByKey, unjoinedItems, unjoinedShops, unjoinedUnits }
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
 * @param {Set<string>|null} [params.predictableItemIds]  itemIds au grain menu item
 *   (catalogue vendable). Q35 : le scénario prédit des VENTES d'articles — sur une
 *   ligne au grain ingrédient (id de ligne de recette, hors catalogue), « absent du
 *   scénario » ne veut pas dire « prédit 0 », il veut dire « pas ce grain » →
 *   predictedUnits null. Sans le param (anciens appelants/tests) : régime inchangé.
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
  predictableItemIds = null,
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
    // Grain prédictible seulement (Q35) : ligne hors catalogue vendable → null,
    // jamais un 0 fabriqué par changement de grain.
    const predictable = !predictableItemIds || predictableItemIds.has(itemKey)
    const predictedUnits =
      hasScenario && predictable ? round2(toUnits(predictedUnitsByKey?.[key])) : null

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
 *   ou Σ prédit = 0 (éviter le ±Infinity). Depuis Q35 Option 1, `soldUnits`
 *   peut être au grain INGRÉDIENT (ventes explosées) alors que le prédit reste
 *   au grain menu item : le Σ vendu du diffPct ne somme donc que les lignes
 *   PRÉDITES (grains comparables) — sinon les unités d'ingrédients gonflent le
 *   vendu face à un prédit qui ne les contient pas. `totalSold` (chip « Total
 *   vendu ») reste la somme de TOUTES les lignes.
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
  let totalSoldPredictable = 0
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
      totalSoldPredictable += toUnits(l?.soldUnits)
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
        ? round2(((totalSoldPredictable - totalPredicted) / totalPredicted) * 100)
        : null,
    totalMissingUnits: hasMissing ? round2(totalMissingUnits) : null,
    totalMissingValue: hasMissingValue ? round2(totalMissingValue) : null,
  }
}
