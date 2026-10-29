import { collectFbElements } from '@/utils/stockPlanning'

/**
 * Stock tampon d'un PDV (page Stockage, ElementInventory.quantity) : stock requis
 * avant un event. Après l'inventaire post event, l'écart (tampon moins stock
 * Logistic) est recommandé à l'étape 1 de Commande. Même formule que le tampon
 * des Storage : max(0, tampon - restant).
 *
 * Ce module ne fait que produire des lignes de besoin (même forme que
 * buildStockRequirements) portant `bufferQuantity` ; le restant Logistic et le
 * max(prévu, tampon) restent calculés par SpaceRestockView.
 */

const normalize = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

/** Lignes d'inventaire d'un élément : configs objectif d'abord, puis clé '' (non scopé), puis l'unique config porteuse. */
export function pickInventoryRows(byConfig, cfgIds) {
  const map = byConfig || {}
  for (const id of cfgIds) {
    if ((map[id] || []).length) return map[id]
  }
  if ((map[''] || []).length) return map['']
  const keys = Object.keys(map).filter((k) => (map[k] || []).length)
  return keys.length === 1 ? map[keys[0]] : []
}

/**
 * Tampons des PDV de la configuration : [{ shop, name, unit, menuItemId, buffer }].
 * Seules les lignes cochées (isStored !== false) avec un tampon > 0 comptent.
 */
export function collectPdvBuffers({ configuration, builderElements = [], cfgIds = [], closedShopNames = [] }) {
  const closed = new Set(closedShopNames.map(normalize).filter(Boolean))
  const byId = new Map(builderElements.map((e) => [String(e.id), e]))
  const out = []
  collectFbElements(configuration).forEach((shop) => {
    if (closed.size && closed.has(normalize(shop.name))) return
    const builderEl = byId.get(String(shop.id))
    if (!builderEl) return
    pickInventoryRows(builderEl.inventoryByConfig, cfgIds).forEach((r) => {
      const buffer = Number(r?.quantity) || 0
      if (!r?.name || buffer <= 0 || r.isStored === false) return
      out.push({
        shop,
        name: r.name,
        unit: r.unit || 'pcs',
        menuItemId: r.menuItemId != null ? String(r.menuItemId) : null,
        marketPriceId: r.marketPriceId ? String(r.marketPriceId) : null,
        buffer,
      })
    })
  })
  return out
}

/**
 * Pose `bufferQuantity` sur les lignes de besoin existantes (même PDV, même nom
 * de produit) et crée une ligne de besoin nul pour un produit sans prévision
 * (typiquement un produit hors recette). Renvoie une nouvelle liste.
 */
export function applyPdvBuffers(rows, buffers) {
  const out = rows.map((r) => ({ ...r }))
  buffers.forEach(({ shop, name, unit, menuItemId, marketPriceId, buffer }) => {
    const wantName = normalize(name)
    const match = out.find(
      (r) =>
        r.shopId === shop.id &&
        ((marketPriceId && (r.itemId === marketPriceId || r.sourceId === marketPriceId)) ||
          normalize(r.itemName) === wantName ||
          (menuItemId && (r.itemId === menuItemId || r.sourceId === menuItemId))),
    )
    if (match) {
      match.bufferQuantity = Math.max(match.bufferQuantity || 0, buffer)
      return
    }
    out.push({
      shopId: shop.id,
      shopName: shop.name,
      shopType: shop.shopType,
      itemKey: `buffer:${wantName}|||${unit}`,
      itemId: menuItemId || `buffer:${wantName}`,
      sourceId: null,
      itemName: name,
      unit,
      totalQuantity: 0,
      isExpanded: false,
      sources: [],
      bufferQuantity: buffer,
    })
  })
  return out
}

/** Cible d'une ligne : le plus grand du besoin prévu ajusté et du tampon. */
export function targetWithBuffer(adjustedTarget, bufferQuantity) {
  return Math.max(Number(adjustedTarget) || 0, Number(bufferQuantity) || 0)
}
