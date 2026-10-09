// Vues de la feuille « à déposer » du mode Ventilation (maquettes Bertrand du
// 2026-10-09) : bascule « Par article / Par PdV » et section « Espaces de stockage ».
//
// Les deux vues partent des MÊMES groupes (groupDepositLinesByItem), pour que les
// chiffres soient identiques quelle que soit la bascule. Fonctions PURES.

import { normalizeStr } from '@/utils/predictiveAnalytics'

export const VENTILATION_VIEW_BY_ITEM = 'item'
export const VENTILATION_VIEW_BY_SHOP = 'shop'

/** Ce qui décrit l'article d'un groupe (libellés, conditionnement), sans ses lignes. */
function itemMeta(group) {
  return {
    itemKey: group.itemKey,
    itemName: group.itemName,
    unit: group.unit ?? null,
    packagingType: group.packagingType ?? null,
    unitsPerPack: group.unitsPerPack ?? null,
  }
}

function byName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr')
}

/**
 * Lignes d'un article réparties entre PDV et section « Espaces de stockage ».
 * Tous les stockages du périmètre sont listés, même sans rien à y déposer (ligne à
 * 0, pour le bouton « + ») ; un stockage de la feuille absent du périmètre reste
 * affiché.
 * @param {object} group sortie de groupDepositLinesByItem
 * @param {Array<{id:string, name:string}>} storages stockages du périmètre
 * @returns {{ shops: Array<object>, storages: Array<object> }}
 */
export function splitGroupRows(group, storages = []) {
  const shops = []
  const storageRows = new Map()
  for (const row of group?.rows || []) {
    if (row.elementType === 'storage') storageRows.set(String(row.shopId), row)
    else shops.push(row)
  }
  const out = []
  for (const s of [...(storages || [])].sort(byName)) {
    const id = String(s.id)
    out.push(storageRows.get(id) || emptyStorageRow(s))
    storageRows.delete(id)
  }
  return { shops, storages: [...out, ...storageRows.values()] }
}

function emptyStorageRow(storage) {
  return {
    rowKey: null,
    elementType: 'storage',
    shopId: String(storage.id),
    shopName: storage.name || '',
    quantity: 0,
    packs: null,
  }
}

/**
 * Vue « Par PdV » : une carte par PDV avec ses articles, puis une carte par stockage
 * du périmètre listant TOUS les articles de la feuille (0 quand rien n'y est prévu).
 * @param {Array<object>} groups sortie de groupDepositLinesByItem
 * @param {Array<{id:string, name:string}>} storages stockages du périmètre
 * @returns {{ shops: Array<object>, storages: Array<object> }} cartes
 *   `{ shopId, shopName, elementType, items: [{ ...article, row }] }`
 */
export function groupDepositGroupsByShop(groups, storages = []) {
  const shopCards = new Map()
  const storageCards = new Map()
  for (const s of storages || []) {
    storageCards.set(String(s.id), { shopId: String(s.id), shopName: s.name || '', elementType: 'storage', items: [] })
  }
  for (const group of groups || []) {
    const meta = itemMeta(group)
    const { shops, storages: storageRows } = splitGroupRows(group, storages)
    for (const row of shops) {
      const key = String(row.shopId)
      let card = shopCards.get(key)
      if (!card) {
        card = { shopId: key, shopName: row.shopName || '', elementType: row.elementType || null, items: [] }
        shopCards.set(key, card)
      }
      card.items.push({ ...meta, row })
    }
    for (const row of storageRows) {
      const key = String(row.shopId)
      let card = storageCards.get(key)
      if (!card) {
        card = { shopId: key, shopName: row.shopName || '', elementType: 'storage', items: [] }
        storageCards.set(key, card)
      }
      card.items.push({ ...meta, row })
    }
  }
  const sortCards = (cards) =>
    [...cards.values()]
      .map((card) => ({
        ...card,
        items: card.items.sort((a, b) => a.itemName.localeCompare(b.itemName, 'fr')),
      }))
      .sort((a, b) => a.shopName.localeCompare(b.shopName, 'fr'))
  return { shops: sortCards(shopCards), storages: sortCards(storageCards) }
}

/**
 * Recherche de la barre sous le bandeau : nom d'article OU nom de destination.
 * Un groupe dont seul un PDV correspond garde toutes ses lignes (contexte complet).
 * @param {Array<object>} groups sortie de groupDepositLinesByItem
 * @param {string} query
 */
export function filterGroupsBySearch(groups, query) {
  const q = normalizeStr(query || '')
  if (!q) return groups || []
  return (groups || []).filter(
    (g) =>
      normalizeStr(g.itemName).includes(q) ||
      (g.rows || []).some((r) => normalizeStr(r.shopName).includes(q)),
  )
}
