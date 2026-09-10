// Prédit de la réconciliation post-event, au GRAIN INVENTAIRE (BUG-378-02).
//
// Jusqu'ici la réconciliation lisait les records bruts d'Event Predict
// (`shopId|menuItemId`, n'importe quelle version du miroir localStorage) alors
// que le comptage est au grain ingrédient (`componentIngredientId`). Les clés ne
// se rejoignaient jamais : un menu item décomposé produisait une ligne orpheline
// « prédit N / vendu 0 / compté 0 » sans nom, et le Diff % comparait un vendu
// explosé à un prédit qui ne l'était pas.
//
// Source désormais : l'index « Besoin prédit » de `usePredictedNeed`
// (version PAR DÉFAUT, explosion `buildStockRequirements`, mêmes identités que
// le comptage), le même que le chip du TOTAL et que le document pre-event.
// Le prédit est posé PAR ARTICLE COMPTÉ : une prédiction qui ne trouve aucun
// article compté (PdV hors périmètre, ingrédient non assigné) ne fabrique pas
// de ligne, elle sort dans `unjoined` pour être archivée et affichée (même
// contrat que les ventes non jointes, BUG-238).
//
// Fonctions PURES : aucun accès store/API. L'appelant fournit l'index, la
// version et le périmètre compté.

import { reconciliationKey } from './postEventReconciliation'
import { expectedKey } from './preEventExpected'

const round2 = (n) => Math.round(n * 100) / 100

const toUnits = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Unités prédites d'un article compté : id d'abord, nom normalisé en repli
 * (même règle que `lookupPredictedNeed`, réimplémentée ici pour rester pure).
 * @returns {number|null} null = rien de prédit pour cet article
 */
function predictedFor(index, elementId, item, normalize) {
  const byId = item?.id != null ? index.byItemId?.[expectedKey(elementId, item.id)] : undefined
  if (Number.isFinite(byId)) return byId
  const nk = normalize(item?.name)
  const byName = nk ? index.byItemName?.[expectedKey(elementId, nk)] : undefined
  return Number.isFinite(byName) ? byName : null
}

/**
 * Une ligne d'explosion (`index.rows`) rejoint-elle un article compté du même
 * PdV ? Par id, par sourceId, puis par nom normalisé.
 */
function rowMatchesCounted(row, items, normalize) {
  const ids = new Set()
  if (row?.itemId != null) ids.add(String(row.itemId))
  if (row?.sourceId != null) ids.add(String(row.sourceId))
  const rowName = normalize(row?.itemName)
  for (const it of items) {
    if (it?.id != null && ids.has(String(it.id))) return true
    if (rowName && normalize(it?.name) === rowName) return true
  }
  return false
}

/**
 * Construit `predictedUnitsByKey` (clé `reconciliationKey(elementId, itemId)`)
 * à partir de l'index « Besoin prédit », restreint aux articles comptés.
 *
 * @param {object} params
 * @param {{byItemId:Object, byItemName:Object, rows?:Array}|null} params.index
 *   index de `buildPredictedNeedIndex` (null = aucune prédiction exploitable)
 * @param {object|null} params.version version Event Predict de référence
 *   (`predictedRecords` bruts, pour repérer les PdV prédits hors périmètre)
 * @param {Map<string, Array<{id:string,name:string}>>|Object} params.countedItemsByElement
 *   périmètre compté : PdV → articles
 * @param {(s:any)=>string} params.normalize normalisation partagée (normalizeStr)
 * @returns {{predictedUnitsByKey: Object|null,
 *   unjoined: {shopNames:string[], itemNames:string[], units:number}|null}}
 */
export function buildPredictedUnitsForReconciliation({
  index = null,
  version = null,
  countedItemsByElement = new Map(),
  normalize = (s) => String(s ?? '').trim().toLowerCase(),
} = {}) {
  const perimeter =
    countedItemsByElement instanceof Map
      ? countedItemsByElement
      : new Map(Object.entries(countedItemsByElement || {}))

  const unjoinedShops = new Set()
  const unjoinedItems = new Set()
  let unjoinedUnits = 0

  // PdV prédits hors périmètre compté : lus sur les records bruts, car
  // `buildStockRequirements` ne produit des lignes que pour les PdV passés en
  // configuration (le périmètre compté), jamais pour les autres.
  const records = Array.isArray(version?.predictedRecords) ? version.predictedRecords : []
  for (const r of records) {
    const shopId = r?.shopId ?? r?.elementId
    const qty = toUnits(r?.totalQuantity ?? r?.adjustedQuantity ?? r?.quantity)
    if (!shopId || !qty) continue
    if (perimeter.has(String(shopId))) continue
    unjoinedShops.add(String(r?.shop || r?.shopName || shopId))
    unjoinedUnits += qty
  }

  let predictedUnitsByKey = null
  if (index) {
    predictedUnitsByKey = {}
    for (const [elementId, items] of perimeter) {
      for (const it of items || []) {
        if (it?.id == null) continue
        const units = predictedFor(index, String(elementId), it, normalize)
        if (units == null) continue
        predictedUnitsByKey[reconciliationKey(elementId, it.id)] = round2(units)
      }
    }
    // Lignes d'explosion sur un PdV compté mais sans article compté correspondant
    // (ingrédient non assigné au PdV, renommage) : archivées, jamais avalées.
    for (const row of Array.isArray(index.rows) ? index.rows : []) {
      const elementId = row?.elementId != null ? String(row.elementId) : ''
      const units = toUnits(row?.units)
      if (!elementId || !units || !perimeter.has(elementId)) continue
      if (rowMatchesCounted(row, perimeter.get(elementId) || [], normalize)) continue
      unjoinedItems.add(String(row?.itemName || row?.itemId || ''))
      unjoinedUnits += units
    }
  }

  const unjoined =
    unjoinedShops.size || unjoinedItems.size
      ? {
          shopNames: [...unjoinedShops].filter(Boolean).slice(0, 50),
          itemNames: [...unjoinedItems].filter(Boolean).slice(0, 50),
          units: round2(unjoinedUnits),
        }
      : null

  return { predictedUnitsByKey, unjoined }
}
