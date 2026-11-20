// Transactions PRÉVUES des records prédictifs (outil Forecast d'Analyse).
//
// Le moteur de prédiction (generatePredictionsForEvent) produit des quantités et un CA
// par PdV, mais `transactionCount: 0` : un événement futur n'a aucun ticket. Sans
// estimation, la puce Transactions du header mélangeait des tickets réels passés avec
// un CA futur, et Panier moyen / Transformation étaient faux.
//
// Règle (D1) : transactions prévues d'un record = quantité prévue x ratio du MÊME PdV,
// où ratio = Σ transactionCount / Σ quantité sur les events SOURCES de la prédiction.
//  - Events sources : `basedOnEventIds` du record (les events passés retenus par le
//    moteur), sinon l'ensemble des records passés fournis en repli.
//  - PdV sans historique dans les sources : ratio global (tous PdV) des mêmes sources.
//  - Aucune source exploitable : 0.
//  - Arrondi à l'entier.
//
// Fonctions PURES : aucune mutation des entrées.

/** Clé de PdV : identifiant s'il existe, sinon le nom (records reconstruits par nom). */
export function shopKeyOf(record) {
  const id = record?.shopId ?? record?.elementId
  if (id != null && id !== '') return `id:${id}`
  const name = record?.shopName ?? record?.shop
  return name ? `name:${name}` : null
}

const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Ratios transactions par unité vendue, calculés sur des records RÉELS (les records
 * prédictifs sont ignorés : ils ne portent aucune vente observée).
 *
 * @param {Array<object>} sourceRecords records réels { shopId, quantity, transactionCount }
 * @returns {{ byShop: Map<string, number>, global: number }}
 *   `byShop` : clé de PdV vers ratio (uniquement les PdV avec quantité > 0) ;
 *   `global` : ratio de tous les PdV réunis, 0 sans quantité vendue.
 */
export function buildTransactionRatios(sourceRecords) {
  const perShop = new Map() // clé -> { qty, tx }
  let totalQty = 0
  let totalTx = 0
  for (const r of Array.isArray(sourceRecords) ? sourceRecords : []) {
    if (!r || r.isPredictive) continue
    const qty = toNumber(r.quantity)
    const tx = toNumber(r.transactionCount)
    totalQty += qty
    totalTx += tx
    const key = shopKeyOf(r)
    if (key == null) continue
    const acc = perShop.get(key) || { qty: 0, tx: 0 }
    acc.qty += qty
    acc.tx += tx
    perShop.set(key, acc)
  }
  const byShop = new Map()
  for (const [key, { qty, tx }] of perShop) {
    if (qty > 0) byShop.set(key, tx / qty)
  }
  return { byShop, global: totalQty > 0 ? totalTx / totalQty : 0 }
}

/**
 * Copies des records avec `transactionCount` estimé (quantité x ratio du PdV, repli sur
 * le ratio global, arrondi à l'entier). Les entrées ne sont pas modifiées.
 *
 * @param {Array<object>} records records prédictifs { shopId, quantity, ... }
 * @param {{ byShop?: Map<string, number>, global?: number }|null} ratios cf. buildTransactionRatios
 * @returns {Array<object>}
 */
export function withPredictedTransactions(records, ratios) {
  const byShop = ratios?.byShop instanceof Map ? ratios.byShop : new Map()
  const global = toNumber(ratios?.global)
  return (Array.isArray(records) ? records : []).map((r) => {
    const quantity = toNumber(r?.quantity)
    const key = shopKeyOf(r)
    const ratio = key != null && byShop.has(key) ? byShop.get(key) : global
    const estimated = quantity > 0 && ratio > 0 ? Math.round(quantity * ratio) : 0
    return { ...r, transactionCount: estimated }
  })
}

/**
 * Estime les transactions de records prédictifs de PLUSIEURS events : les sources de
 * chaque event sont l'union des `basedOnEventIds` de ses records, avec repli sur
 * l'ensemble des records passés quand aucun n'est exposé.
 *
 * @param {Array<object>} predictedRecords records prédictifs (events futurs)
 * @param {Array<object>} pastRecords records réels passés (historique du moteur)
 * @returns {Array<object>} copies avec `transactionCount` estimé
 */
export function applyPredictedTransactions(predictedRecords, pastRecords) {
  const predicted = Array.isArray(predictedRecords) ? predictedRecords : []
  if (!predicted.length) return []
  const past = Array.isArray(pastRecords) ? pastRecords : []

  const pastByEvent = new Map()
  for (const r of past) {
    if (!r || r.isPredictive || r.eventId == null) continue
    const list = pastByEvent.get(r.eventId)
    if (list) list.push(r)
    else pastByEvent.set(r.eventId, [r])
  }

  // Sources par event prédit : union des basedOnEventIds de ses records (null = repli).
  const sourcesByEvent = new Map()
  for (const r of predicted) {
    const ids = Array.isArray(r?.basedOnEventIds) ? r.basedOnEventIds : []
    if (!ids.length) continue
    const set = sourcesByEvent.get(r.eventId) || new Set()
    for (const id of ids) set.add(id)
    sourcesByEvent.set(r.eventId, set)
  }

  // Ratios mémoïsés par jeu de sources : des events qui s'appuient sur les mêmes matchs
  // passés partagent le même calcul.
  const ratiosBySourceKey = new Map()
  const ratiosFor = (eventId) => {
    const ids = sourcesByEvent.get(eventId)
    const key = ids ? [...ids].map(String).sort().join('|') : '*'
    let ratios = ratiosBySourceKey.get(key)
    if (!ratios) {
      const sources = ids ? [...ids].flatMap((id) => pastByEvent.get(id) || []) : past
      ratios = buildTransactionRatios(sources)
      ratiosBySourceKey.set(key, ratios)
    }
    return ratios
  }

  const byEvent = new Map()
  for (const r of predicted) {
    const list = byEvent.get(r?.eventId)
    if (list) list.push(r)
    else byEvent.set(r?.eventId, [r])
  }
  const estimatedByEvent = new Map()
  for (const [eventId, list] of byEvent) {
    estimatedByEvent.set(eventId, withPredictedTransactions(list, ratiosFor(eventId)))
  }

  // Ordre d'origine conservé.
  const cursor = new Map()
  return predicted.map((r) => {
    const list = estimatedByEvent.get(r?.eventId)
    const i = cursor.get(r?.eventId) || 0
    cursor.set(r?.eventId, i + 1)
    return list[i]
  })
}
