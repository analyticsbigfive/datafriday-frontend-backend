// Résumé stockage de l'étape 1 de la page Commandes : articles cochés, montant
// d'achat, liste triée par montant décroissant. Fonctions PURES : la vue branche
// les données (lignes, « À commander », Market Prices, conditionnement).
//
// Valorisation : MÊME méthode que l'app (backend stock-cost-resolver et
// reconciliationCosts : coût unitaire = MarketPrice.pricePerUnit, par unité de
// base du Market Price ; pricePerUnit = price / unitsPerPurchase au drawer).
// La quantité « À commander » est en unité de la ligne (unité de recette) :
//   - colis connu (computePackagingForQuantity) : on paie des colis ENTIERS,
//     soit packedCount x packagingUnitNumber unités de base x pricePerUnit.
//     C'est exactement ce que buyInfo(row).main affiche (ex. « 4 Fûts de 30 L »).
//   - sans colis : quantité x purchaseUnitConversion (recette -> base) x pricePerUnit.
// Même convention que packedCount = ceil(q / packagingUnitNumber x conversion)
// dans stockPlanning.computePackagingForQuantity.

const positive = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Prix d'achat par unité de base d'un Market Price, ou null (jamais un 0 fabriqué). */
export function unitPriceOfMarketPrice(mp) {
  if (!mp) return null
  const direct = positive(mp.pricePerUnit)
  if (direct != null) return direct
  const price = positive(mp.price)
  const units = positive(mp.unitsPerPurchase)
  return price != null && units != null ? price / units : null
}

/**
 * Montant en euros d'une quantité « À commander ». 0 si pas de prix ou pas de quantité.
 * @param {number} order quantité à commander (unité de la ligne)
 * @param {object|null} mp Market Price de l'article
 * @param {object|null} packaging sortie de computePackagingForQuantity (ou figée), ou null
 */
export function orderAmount(order, mp, packaging) {
  const q = Number(order)
  const unitPrice = unitPriceOfMarketPrice(mp)
  if (!(q > 0) || unitPrice == null) return 0
  const packedCount = Number(packaging && packaging.packedCount)
  const perPack = Number(packaging && packaging.packagingUnitNumber)
  if (packedCount > 0 && perPack > 0) return packedCount * perPack * unitPrice
  const conversion = positive(mp.purchaseUnitConversion) || 1
  return q * conversion * unitPrice
}

/** Compte « a/b PDV » : a = PDV à réapprovisionner, b = PDV de l'article (null si inconnu, plan figé). */
export function pdvCounts(row, shopRows) {
  const concerned = new Set()
  for (const r of shopRows || []) {
    if (r && r.shopId != null && Number(r.restockQuantity) > 0) concerned.add(String(r.shopId))
  }
  const total = Number(row && row.shopCount) > 0 ? Number(row.shopCount) : null
  if (!concerned.size && total == null) return null
  return { a: concerned.size, b: total }
}

/** Compte « c/d Stock » : d = stockages portant l'article, c = ceux à réapprovisionner. */
export function stockCounts(mp, row, storageRows) {
  const mpId = mp && mp.id != null ? String(mp.id) : null
  const name = norm(row && row.itemName)
  const all = new Set()
  const needed = new Set()
  for (const s of storageRows || []) {
    if (!s) continue
    const sameId = mpId && s.marketPriceId != null && String(s.marketPriceId) === mpId
    const sameName = name && norm(s.name) === name
    if (!sameId && !sameName) continue
    const el = String(s.elementId)
    all.add(el)
    if (Number(s.required) > 0) needed.add(el)
  }
  return all.size ? { c: needed.size, d: all.size } : null
}

const keyUnit = (u) => (u == null || u === '' ? 'unit' : String(u))

/**
 * Résumé de la commande (étape 1).
 * @param {object} p
 * @param {Array} p.rows lignes de l'étape 1 (stockSettingsRows)
 * @param {Object<string, number>} p.orderByItem « À commander » par itemKey
 * @param {Object<string, boolean>} p.excluded articles décochés (stockExcluded)
 * @param {(row:object) => object|null} p.marketPriceFor Market Price de la ligne
 * @param {(row:object, qty:number) => object|null} p.packagingFor conditionnement
 * @param {(row:object) => string} p.buyLabel libellé colis de l'étape 1 (buyInfo.main)
 * @param {(row:object, qty:number) => string} [p.quantityLabel] libellé colis pour une
 *   quantité TOTALE (ligne fusionnée ou ajoutée) ; sans lui, une ligne fusionnée garde buyLabel
 * @param {(row:object) => boolean} [p.excludeRow] lignes à ne pas lister (les composants)
 * @param {Array<{itemKey,itemName,unit,quantity,sourceId?,marketPriceId?}>} [p.extraDemands]
 *   besoins additionnels (ingrédients des composants), fusionnés par itemKey (même
 *   Market Price ET même unité, aucune conversion)
 * @param {boolean} [p.includeStorage] ajoute le réassort des stockages (onglet STOCK)
 * @param {Array} [p.storageLines] lignes de l'onglet STOCK (elementType 'storage')
 * @param {Object<string, Array>} [p.shopRowsByItem] lignes PDV par itemKey
 * @param {Array} [p.storageRows] lignes des espaces de stockage
 * @returns {{total:number, selectedCount:number, totalCount:number, lines:Array}}
 */
export function buildStorageSummary({
  rows = [],
  orderByItem = {},
  excluded = {},
  marketPriceFor = () => null,
  packagingFor = () => null,
  buyLabel = () => '',
  quantityLabel = null,
  excludeRow = () => false,
  extraDemands = [],
  includeStorage = false,
  storageLines = [],
  shopRowsByItem = {},
  storageRows = [],
} = {}) {
  const all = Array.isArray(rows) ? rows : []
  const list = all.filter((row) => row && !excludeRow(row))
  const excl = excluded || {}
  const selected = list.filter((row) => !excl[row.itemKey])
  const rowByKey = new Map(list.map((row) => [row.itemKey, row]))
  // itemKey -> { row, direct, added }
  const entries = new Map()
  for (const row of selected) {
    const order = Number((orderByItem || {})[row.itemKey])
    if (order > 0) entries.set(row.itemKey, { row, direct: order, added: 0 })
  }
  const add = (key, fallbackRow, qty) => {
    if (!(qty > 0)) return
    const hit = entries.get(key)
    if (hit) {
      hit.added += qty
      return
    }
    entries.set(key, { row: rowByKey.get(key) || fallbackRow, direct: 0, added: qty })
  }

  for (const d of extraDemands || []) {
    if (!d || d.itemKey == null || excl[d.itemKey]) continue
    add(d.itemKey, syntheticRow(d.itemKey, d), Number(d.quantity))
  }

  if (includeStorage) {
    for (const line of storageLines || []) {
      const qty = Number(line && line.restockQuantity)
      if (!(qty > 0)) continue
      const key = storageTargetKey(line, rowByKey, entries)
      add(key, syntheticRow(key, line), qty)
    }
  }

  const lines = []
  let total = 0
  for (const [itemKey, entry] of entries) {
    const row = entry.row
    const qty = entry.direct + entry.added
    const mp = marketPriceFor(row) || null
    const amount = orderAmount(qty, mp, packagingFor(row, qty))
    total += amount
    const image = mp && typeof mp.image === 'string' && mp.image ? mp.image : ''
    // Quantité fusionnée ou ajoutée : le libellé reflète la quantité TOTALE.
    let label = buyLabel(row)
    if (entry.added > 0) label = quantityLabel ? quantityLabel(row, qty) : entry.direct > 0 ? buyLabel(row) : ''
    // Détail « dont X pour les PDV et Y pour le réassort des stockages » : seulement
    // quand les deux parts existent et que le libellé de colis par quantité est fourni.
    const split =
      entry.added > 0 && entry.direct > 0 && quantityLabel
        ? { direct: quantityLabel(row, entry.direct), added: quantityLabel(row, entry.added) }
        : null
    lines.push({
      itemKey,
      name: row.itemName,
      amount,
      quantityLabel: label,
      split,
      image,
      pdv: pdvCounts(row, (shopRowsByItem || {})[itemKey]),
      stock: stockCounts(mp, row, storageRows),
    })
  }
  lines.sort((a, b) => b.amount - a.amount || String(a.name).localeCompare(String(b.name)))
  return { total, selectedCount: selected.length, totalCount: list.length, lines }
}

/** Ligne minimale pour un article qui n'a pas de ligne directe à l'étape 1. */
function syntheticRow(itemKey, src) {
  return {
    itemKey,
    itemName: src.itemName,
    unit: src.unit || '',
    itemId: src.itemId || null,
    sourceId: src.sourceId || null,
    marketPriceId: src.marketPriceId || null,
    shopCount: 0,
  }
}

/**
 * itemKey de l'étape 1 qui reçoit une ligne de stockage : Market Price + unité,
 * puis id article + unité, puis nom + unité ; sinon une clé propre (ligne seule).
 */
function storageTargetKey(line, rowByKey, entries) {
  const unit = keyUnit(line.unit)
  const candidates = [line.marketPriceId, line.itemId]
    .filter((v) => v != null && v !== '')
    .map((v) => `${v}|||${unit}`)
  for (const key of candidates) {
    if (rowByKey.has(key) || entries.has(key)) return key
  }
  // Un article libre du Builder n'a souvent aucune unité : on ne l'oppose alors
  // pas à l'unité de la ligne PDV (sinon « …|||unit » ≠ « …|||L » et l'article
  // apparaît en double au lieu d'être additionné).
  const unitOk = (u) => !line.unit || keyUnit(u) === unit
  const mpId = line.marketPriceId != null && line.marketPriceId !== '' ? String(line.marketPriceId) : null
  const sameMp = (r) => !!mpId && !!r && r.marketPriceId != null && String(r.marketPriceId) === mpId && unitOk(r.unit)
  const name = norm(line.itemName)
  const sameName = (r) => !!name && !!r && norm(r.itemName) === name && unitOk(r.unit)
  for (const match of [sameMp, sameName]) {
    for (const row of rowByKey.values()) if (match(row)) return row.itemKey
    for (const [key, e] of entries) if (match(e.row)) return key
  }
  return candidates[0] || `name:${name}|||${unit}`
}

/**
 * CA prédit HT des versions d'événements sélectionnées (celles affichées dans
 * les cartes de version de la colonne gauche : revenue du scénario retenu).
 * Retourne null s'il n'y a aucun CA connu (jamais un 0 fabriqué).
 * @param {Array<{id:string, scenarios:Array<{id:string, revenue:number|null}>}>} events
 * @param {Array<string>} selectedIds événements sélectionnés
 * @param {Object<string,string>} scenarioByEventId version retenue par événement
 */
export function selectedPredictedRevenue(events, selectedIds, scenarioByEventId) {
  const ids = new Set((selectedIds || []).map(String))
  let sum = 0
  let known = false
  for (const ev of events || []) {
    if (!ev || !ids.has(String(ev.id))) continue
    const wanted = (scenarioByEventId || {})[ev.id]
    const sc = (ev.scenarios || []).find((s) => s.id === wanted)
    const revenue = sc && sc.revenue != null ? Number(sc.revenue) : NaN
    if (Number.isFinite(revenue)) {
      sum += revenue
      known = true
    }
  }
  return known ? sum : null
}

/** Marge en % = (CA prédit - coût de la commande) / CA prédit ; null si CA prédit absent ou <= 0. */
export function marginPercent(predictedRevenue, orderTotal) {
  const revenue = Number(predictedRevenue)
  if (!(revenue > 0)) return null
  return ((revenue - (Number(orderTotal) || 0)) / revenue) * 100
}
