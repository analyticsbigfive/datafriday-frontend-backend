// Calcul de la liste de courses / réarmement (Règle 3).
//
// gap = max(0, besoinThéorique - restantCompté) par article et par PDV (element),
// puis agrégat global (somme des gaps tous PDV) avec breakdown par PDV.
//
// Le packaging est traité EXACTEMENT comme un ingrédient : il entre dans le besoin,
// dans le comptage et dans le gap. Jamais filtré.

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Restant compté pour un article (Règle 3, étape 3) :
 *   packedUnits * inventoryQuantityPackaged + looseUnits
 *
 * @param {{packedUnits?:number, looseUnits?:number}|null} count
 * @param {number} quantityPackaged  unités par colis (defaut 1)
 * @returns {number}
 */
export function countedRemaining(count, quantityPackaged) {
  if (!count) return 0
  const qtyPackaged = toNumber(quantityPackaged, 1) || 1
  return toNumber(count.packedUnits) * qtyPackaged + toNumber(count.looseUnits)
}

/**
 * Résout le comptage d'une ligne de stock depuis inventoryCounts[elementId].
 * Tolérant : essaie itemId puis sourceId.
 */
function defaultGetCount(inventoryCounts, elementId, row) {
  const perElement = (inventoryCounts && inventoryCounts[elementId]) || null
  if (!perElement) return null
  return perElement[row.itemId] || (row.sourceId && perElement[row.sourceId]) || null
}

/**
 * Construit la liste de courses à partir des besoins théoriques (stockRows issus de
 * buildStockRequirements) et des comptages terrain.
 *
 * @param {Object} params
 * @param {Array}  params.stockRows          besoin théorique par PDV/article
 *   (shape buildStockRequirements: { shopId, shopName, itemId, sourceId, itemName, unit, totalQuantity, isPackaging? })
 * @param {Object} params.inventoryCounts    Record<elementId, Record<itemId, {packedUnits, looseUnits, isCounted}>>
 * @param {(row:Object) => number} [params.getQuantityPackaged]  unités/colis d'un article
 * @param {(elementId:string, row:Object) => Object|null} [params.getCount]  override de résolution de comptage
 * @returns {{ lines: Array, aggregated: Array }}
 */
export function buildShoppingList({
  stockRows = [],
  inventoryCounts = {},
  getQuantityPackaged,
  getCount,
} = {}) {
  const qtyPackagedFor = (row) =>
    toNumber(getQuantityPackaged ? getQuantityPackaged(row) : row.inventoryQuantityPackaged, 1) || 1
  const countFor = (elementId, row) =>
    getCount ? getCount(elementId, row) : defaultGetCount(inventoryCounts, elementId, row)

  const lines = []
  const aggregateByItem = new Map()

  stockRows.forEach((row) => {
    const elementId = row.shopId || row.elementId
    const quantityPackaged = qtyPackagedFor(row)
    const theoretical = toNumber(row.totalQuantity)
    const count = countFor(elementId, row)
    const remaining = countedRemaining(count, quantityPackaged)
    const gap = Math.max(0, theoretical - remaining)

    const line = {
      elementId,
      shopName: row.shopName,
      itemId: row.itemId,
      sourceId: row.sourceId || null,
      itemKey: row.itemKey || `${row.itemId || row.itemName}|||${row.unit || 'unit'}`,
      name: row.itemName,
      unit: row.unit,
      isPackaging: !!row.isPackaging,
      theoretical,
      counted: remaining,
      gap,
      quantityPackaged,
    }
    lines.push(line)

    if (gap <= 0) return // entièrement en stock -> hors liste de courses

    // Agrégat global par article (clé = nom + unité pour fusionner tous PDV)
    const aggKey = `${row.itemName}|||${row.unit || 'unit'}`
    let agg = aggregateByItem.get(aggKey)
    if (!agg) {
      agg = {
        name: row.itemName,
        itemId: row.itemId,
        unit: row.unit,
        isPackaging: !!row.isPackaging,
        totalUnits: 0,
        totalPackedUnits: 0,
        totalLooseUnits: 0,
        shopCount: 0,
        shops: [],
      }
      aggregateByItem.set(aggKey, agg)
    }
    agg.totalUnits += gap
    agg.shopCount += 1
    agg.shops.push({
      elementId,
      shopName: row.shopName,
      gap,
      quantityPackaged,
    })
  })

  // Décompose le total agrégé en colis + unités libres
  const aggregated = Array.from(aggregateByItem.values()).map((agg) => {
    const qtyPackaged =
      agg.shops.reduce((max, s) => Math.max(max, s.quantityPackaged || 1), 1) || 1
    agg.totalPackedUnits = Math.floor(agg.totalUnits / qtyPackaged)
    agg.totalLooseUnits = agg.totalUnits - agg.totalPackedUnits * qtyPackaged
    return agg
  })

  aggregated.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

  return { lines, aggregated }
}
