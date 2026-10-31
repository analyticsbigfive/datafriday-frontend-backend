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

/**
 * @param {object} p
 * @param {Array} p.rows lignes de l'étape 1 (stockSettingsRows)
 * @param {Object<string, number>} p.orderByItem « À commander » par itemKey
 * @param {Object<string, boolean>} p.excluded articles décochés (stockExcluded)
 * @param {(row:object) => object|null} p.marketPriceFor Market Price de la ligne
 * @param {(row:object, qty:number) => object|null} p.packagingFor conditionnement
 * @param {(row:object) => string} p.buyLabel libellé colis de l'étape 1 (buyInfo.main)
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
  shopRowsByItem = {},
  storageRows = [],
} = {}) {
  const list = Array.isArray(rows) ? rows : []
  const selected = list.filter((row) => row && !(excluded || {})[row.itemKey])
  const lines = []
  let total = 0
  for (const row of selected) {
    const order = Number((orderByItem || {})[row.itemKey])
    if (!(order > 0)) continue
    const mp = marketPriceFor(row) || null
    const amount = orderAmount(order, mp, packagingFor(row, order))
    total += amount
    const image = mp && typeof mp.image === 'string' && mp.image ? mp.image : ''
    lines.push({
      itemKey: row.itemKey,
      name: row.itemName,
      amount,
      quantityLabel: buyLabel(row),
      image,
      pdv: pdvCounts(row, (shopRowsByItem || {})[row.itemKey]),
      stock: stockCounts(mp, row, storageRows),
    })
  }
  lines.sort((a, b) => b.amount - a.amount || String(a.name).localeCompare(String(b.name)))
  return { total, selectedCount: selected.length, totalCount: list.length, lines }
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
