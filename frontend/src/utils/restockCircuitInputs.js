// Branchement du circuit de réarmement (utils/restockCircuit.js) sur les données de
// la page Commandes : construit les entrées du circuit à partir des lignes PDV et
// des lignes de réserve, puis range les sorties par clé de lecture de la vue.
// Module pur : la vue fournit les lignes et les tailles de colis, rien d'autre.

import { buildRestockCircuit, circuitKey } from '@/utils/restockCircuit'
import { storageTargetKey } from '@/utils/restockStorageSummary'

const EMPTY_ENTRIES = new Map()

/**
 * Entrées PDV du circuit : lignes vivantes SANS les articles décochés.
 * @param {Array} rows liveRestockRowsAll
 * @param {Object<string, boolean>} excluded stockExcluded
 * @param {(row:object) => (number|null)} packSizeFor taille de colis en unité de la ligne
 */
export function buildCircuitShopRows(rows, excluded, packSizeFor) {
  const excl = excluded || {}
  const out = []
  for (const row of rows || []) {
    if (!row || excl[row.itemKey]) continue
    const pack = packSizeFor ? Number(packSizeFor(row)) : null
    out.push({
      shopId: row.shopId,
      shopName: row.shopName,
      itemKey: row.itemKey,
      unit: row.unit || '',
      targetQuantity: Number(row.targetQuantity) || 0,
      remainingQuantity: Number(row.remainingQuantity) || 0,
      packSize: pack > 0 ? pack : null,
    })
  }
  return out
}

/**
 * Entrées réserve du circuit. La clé d'article est celle de l'article PDV
 * correspondant (règle storageTargetKey : Market Price, id, nom, + unité) ;
 * sans correspondance, la réserve garde sa propre clé et ne couvre personne.
 * @param {Array} groups storageRestockGroups
 * @param {Array} itemRows lignes d'articles de l'étape 1 (liveStockSettingsRows)
 * @param {(row:object) => (number|null)} packSizeFor taille de colis de la ligne de réserve
 */
export function buildCircuitStorageRows(groups, itemRows, packSizeFor) {
  const rowByKey = new Map((itemRows || []).map((r) => [r.itemKey, r]))
  const out = []
  for (const group of groups || []) {
    for (const row of group?.rows || []) {
      const itemKey = storageTargetKey(
        { marketPriceId: row.marketPriceId, itemId: row.menuItemId, itemName: row.name, unit: row.unit },
        rowByKey,
        EMPTY_ENTRIES,
      )
      const matched = rowByKey.get(itemKey)
      const pack = packSizeFor ? Number(packSizeFor(row)) : null
      out.push({
        key: row.key,
        itemKey,
        elementId: row.elementId,
        name: row.name,
        // Même unité que l'article PDV relié (sinon le circuit ne les groupe pas).
        unit: matched ? matched.unit || '' : row.unit || '',
        buffer: Number(row.buffer) || 0,
        remaining: Number(row.remaining) || 0,
        percent: row.percent == null ? 100 : Number(row.percent),
        packSize: pack > 0 ? pack : null,
      })
    }
  }
  return out
}

/**
 * Circuit complet rangé pour la vue.
 * @returns {{
 *   orderByItem: Object<string, number>,      // itemKey -> à acheter pour les PDV (unité de ligne)
 *   flowByShopRow: Object<string, object>,    // `${shopId}|||${itemKey}` -> flux du PDV
 *   transfersByItem: Object<string, Array>,   // itemKey -> transferts PDV vers PDV
 *   storageFlowByKey: Object<string, object>, // clé de ligne de réserve -> { drawn, required, purchase }
 * }}
 */
export function computeRestockCircuit({ shopRows = [], storageRows = [] } = {}) {
  const res = buildRestockCircuit({ shopRows, storageRows })
  const orderByItem = {}
  const transfersByItem = {}
  const flowByShopRow = {}
  const storageFlowByKey = {}
  for (const sr of shopRows) {
    const summary = res.byItem[circuitKey(sr.itemKey, sr.unit)]
    if (!summary) continue
    orderByItem[sr.itemKey] = summary.purchaseForShops
    transfersByItem[sr.itemKey] = summary.transfers
  }
  for (const l of res.shopLines) {
    flowByShopRow[`${l.shopId}|||${l.itemKey}`] = {
      received: l.received,
      ceded: l.ceded,
      fromStorage: l.fromStorage,
      purchase: l.purchase,
      finalStock: l.finalStock,
    }
  }
  for (const l of res.storageLines) {
    storageFlowByKey[l.key] = { drawn: l.drawn, required: l.required, purchase: l.purchase }
  }
  return { orderByItem, flowByShopRow, transfersByItem, storageFlowByKey }
}

/**
 * Groupes de réserve avec `required` APRÈS prélèvement (valeur du circuit), pour
 * buildStorageRestockLines. Sans flux pour une ligne, elle reste inchangée.
 */
export function applyCircuitToStorageGroups(groups, storageFlowByKey) {
  return (groups || []).map((group) => ({
    ...group,
    rows: (group?.rows || []).map((row) => {
      const flow = storageFlowByKey && storageFlowByKey[row.key]
      return flow ? { ...row, required: flow.required, drawn: flow.drawn } : row
    }),
  }))
}
