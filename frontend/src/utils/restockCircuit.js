// Circuit de réarmement d'un article : ce qu'on déplace, ce qu'on prélève et ce
// qu'on achète (règles validées par Bertrand).
//
// Pour un même article (même clé et même unité), le besoin des PDV se couvre dans
// cet ordre :
//   1. Surplus des PDV : un PDV dont le restant dépasse sa cible (prédit ajusté +
//      tampon PDV) cède des FÛTS ENTIERS aux PDV en manque, sans descendre sous sa
//      cible. Les PDV en manque sont servis dans l'ordre d'entrée.
//   2. Stock restant des réserves (stockages) : prélevé en colis entiers. Le
//      remplissage de la réserve se recalcule ensuite sur le restant APRÈS prélèvement.
//   3. Achat : le reste est acheté en colis entiers (arrondi au supérieur).
// Puis remplissage de chaque réserve : max(0, tampon − (restant − prélevé)) × % de
// la ligne, arrondi au colis, acheté.
//
// Module pur : aucune dépendance Vue/Vuex, toutes les quantités sont dans l'unité de
// la ligne (la taille de colis aussi).

import { ceilForUnit } from '@/utils/stockPlanning'

// Tolérance flottante : 69,2 / 30 ou 7,0499999 ne doivent pas changer un nombre de colis.
const EPS = 1e-9

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function positivePack(packSize) {
  const p = num(packSize)
  return p > 0 ? p : null
}

// Évite les résidus binaires (0,1 + 0,2) sans toucher aux valeurs métier.
function clean(value) {
  return Math.round(value * 1e9) / 1e9
}

/** Clé de regroupement : même article ET même unité. */
export function circuitKey(itemKey, unit) {
  return `${itemKey}|||${unit || ''}`
}

/** Nombre de colis entiers couvrant `quantity` (arrondi au supérieur). */
function packsToCover(quantity, packSize) {
  if (quantity <= EPS) return 0
  return Math.ceil(quantity / packSize - EPS)
}

/** Quantité achetée pour couvrir `quantity` : colis entiers, sinon ceilForUnit. */
function purchaseFor(quantity, packSize, unit) {
  if (quantity <= EPS) return 0
  if (!packSize) return ceilForUnit(quantity, unit)
  return clean(packsToCover(quantity, packSize) * packSize)
}

function resolveItemPack(shopRows, storageRows) {
  for (const r of shopRows) {
    const p = positivePack(r.packSize)
    if (p) return p
  }
  for (const r of storageRows) {
    const p = positivePack(r.packSize)
    if (p) return p
  }
  return null
}

function buildItemCircuit(itemKey, unit, shopRows, storageRows) {
  const packSize = resolveItemPack(shopRows, storageRows)

  const shops = shopRows.map((r) => {
    const target = num(r.targetQuantity)
    const remaining = num(r.remainingQuantity)
    return {
      shopId: r.shopId,
      shopName: r.shopName,
      itemKey,
      unit,
      target,
      remaining,
      gap: Math.max(0, target - remaining),
      surplus: Math.max(0, remaining - target),
      received: 0,
      ceded: 0,
      fromStorage: 0,
      purchase: 0,
    }
  })
  const gapTotal = shops.reduce((s, x) => s + x.gap, 0)

  // 1. Surplus des PDV : fûts entiers, sans descendre sous la cible du cédant.
  const transfers = []
  if (packSize) {
    const donors = shops
      .filter((s) => s.surplus > EPS)
      .map((s) => ({ shop: s, packsLeft: Math.floor(s.surplus / packSize + EPS) }))
    for (const receiver of shops) {
      if (receiver.gap <= EPS) continue
      let packsNeeded = packsToCover(receiver.gap, packSize)
      for (const donor of donors) {
        if (packsNeeded <= 0) break
        if (donor.shop === receiver || donor.packsLeft <= 0) continue
        const packs = Math.min(packsNeeded, donor.packsLeft)
        const quantity = clean(packs * packSize)
        donor.packsLeft -= packs
        packsNeeded -= packs
        donor.shop.ceded = clean(donor.shop.ceded + quantity)
        receiver.received = clean(receiver.received + quantity)
        transfers.push({
          fromShopId: donor.shop.shopId,
          toShopId: receiver.shopId,
          quantity,
          packs,
        })
      }
    }
  }

  // 2. Stock restant des réserves : colis entiers (taille de colis de l'article).
  const storages = storageRows.map((r) => ({
    key: r.key,
    itemKey,
    elementId: r.elementId,
    name: r.name,
    unit,
    buffer: num(r.buffer),
    remaining: num(r.remaining),
    percent: r.percent == null ? 100 : num(r.percent),
    packSize: positivePack(r.packSize) || packSize,
    packsAvailable: packSize ? Math.floor(num(r.remaining) / packSize + EPS) : 0,
    drawn: 0,
  }))
  const drawByKey = new Map()
  let purchaseForShops = 0
  for (const shop of shops) {
    let residual = Math.max(0, shop.gap - shop.received)
    if (residual > EPS && packSize) {
      let packsNeeded = packsToCover(residual, packSize)
      for (const st of storages) {
        if (packsNeeded <= 0) break
        if (st.packsAvailable <= 0) continue
        const packs = Math.min(packsNeeded, st.packsAvailable)
        const quantity = clean(packs * packSize)
        st.packsAvailable -= packs
        st.drawn = clean(st.drawn + quantity)
        packsNeeded -= packs
        shop.fromStorage = clean(shop.fromStorage + quantity)
        drawByKey.set(st.key, clean((drawByKey.get(st.key) || 0) + quantity))
      }
      residual = Math.max(0, residual - shop.fromStorage)
    }
    // 3. Achat du reste, par PDV (arrondi au colis).
    shop.purchase = purchaseFor(residual, packSize, unit)
    purchaseForShops = clean(purchaseForShops + shop.purchase)
  }

  // Remplissage des réserves sur le restant APRÈS prélèvement.
  const storageLines = storages.map((st) => {
    const afterDraw = st.remaining - st.drawn
    const required = clean(Math.max(0, st.buffer - afterDraw) * (st.percent / 100))
    const purchase = purchaseFor(required, st.packSize, unit)
    return {
      key: st.key,
      itemKey,
      elementId: st.elementId,
      name: st.name,
      unit,
      drawn: st.drawn,
      required,
      purchase,
      packs: st.packSize ? Math.round(purchase / st.packSize) : null,
    }
  })
  const purchaseForStorages = clean(storageLines.reduce((s, l) => s + l.purchase, 0))

  const shopLines = shops.map((s) => ({
    shopId: s.shopId,
    shopName: s.shopName,
    itemKey,
    unit,
    gap: s.gap,
    received: s.received,
    fromStorage: s.fromStorage,
    ceded: s.ceded,
    purchase: s.purchase,
    finalStock: clean(s.remaining + s.received + s.fromStorage + s.purchase - s.ceded),
  }))

  return {
    summary: {
      itemKey,
      unit,
      packSize,
      gapTotal: clean(gapTotal),
      transfers,
      storageDraws: [...drawByKey].map(([key, quantity]) => ({ key, quantity })),
      purchaseForShops,
      purchaseForStorages,
      totalPurchase: clean(purchaseForShops + purchaseForStorages),
    },
    shopLines,
    storageLines,
  }
}

/**
 * Circuit de réarmement de tous les articles.
 * @param {Object} input
 * @param {Array} input.shopRows [{ shopId, shopName, itemKey, unit, targetQuantity,
 *   remainingQuantity, packSize }] ; packSize null = inconnu (aucun transfert ni
 *   prélèvement, arrondi ceilForUnit).
 * @param {Array} input.storageRows [{ key, itemKey, elementId, name, unit, buffer,
 *   remaining, percent, packSize }] ; percent absent = 100.
 * @returns {{ byItem: Object, shopLines: Array, storageLines: Array }} byItem est
 *   indexé par `circuitKey(itemKey, unit)`.
 */
export function buildRestockCircuit({ shopRows = [], storageRows = [] } = {}) {
  const groups = new Map()
  const slot = (itemKey, unit) => {
    const k = circuitKey(itemKey, unit)
    if (!groups.has(k)) groups.set(k, { itemKey, unit, shops: [], storages: [] })
    return groups.get(k)
  }
  shopRows.forEach((r) => slot(r.itemKey, r.unit).shops.push(r))
  storageRows.forEach((r) => slot(r.itemKey, r.unit).storages.push(r))

  const byItem = {}
  const shopLines = []
  const storageLines = []
  groups.forEach((g, k) => {
    const res = buildItemCircuit(g.itemKey, g.unit, g.shops, g.storages)
    byItem[k] = res.summary
    shopLines.push(...res.shopLines)
    storageLines.push(...res.storageLines)
  })
  return { byItem, shopLines, storageLines }
}
