import { isRowStored } from '@/utils/storageRowStored'

/** Clé de comparaison d'un nom d'article : insensible à la casse et aux espaces. */
export function normalizeItemName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Une ligne d'inventaire correspond-elle à un article ? Par id du Market Price d'abord
 * (row.marketPriceId face à item.marketPriceId ou item.id), puis par nom normalisé en repli
 * (lignes historiques sans id). Une ligne avec id qui ne correspond pas à l'article est
 * quand même rapprochée par le nom : un id d'une autre variante de prix ne doit pas
 * faire perdre un article de même nom.
 */
export function rowMatchesItem(row, item) {
  if (!row || !item) return false
  const rowId = row.marketPriceId != null && row.marketPriceId !== '' ? String(row.marketPriceId) : null
  if (rowId) {
    if (item.marketPriceId != null && String(item.marketPriceId) === rowId) return true
    if (item.id != null && String(item.id) === rowId) return true
  }
  const key = normalizeItemName(item.name)
  return !!key && normalizeItemName(row.name) === key
}

/**
 * Lignes sauvegardées d'un élément Storage pour une config. Repli clé '' = lignes
 * non scopées config (même règle que useStorageInventory / StorageInventorySection).
 */
export function rowsForConfig(inventoryByConfig, configId) {
  const byConfig = inventoryByConfig || {}
  return byConfig[configId] || byConfig[''] || []
}

/**
 * Lignes sauvegardées sur plusieurs configs (vue agrégée / périmètre espace) :
 * concaténation, un article est « stocké » s'il l'est sur au moins une config.
 * configIds absent ou vide = toutes les configs présentes.
 */
export function rowsForConfigs(inventoryByConfig, configIds) {
  const byConfig = inventoryByConfig || {}
  const ids = Array.isArray(configIds) && configIds.length ? configIds.map(String) : Object.keys(byConfig)
  const out = []
  const seen = new Set()
  for (const id of ids) {
    const key = byConfig[id] ? id : ''
    if (seen.has(key)) continue
    seen.add(key)
    out.push(...(byConfig[key] || []))
  }
  return out
}

/**
 * Ne garde que les articles dont la ligne sauvegardée est cochée « stocké ».
 * Un article sans ligne = non stocké = exclu.
 * savedRows null/undefined = lignes pas encore chargées : on ne filtre pas
 * (évite de faire clignoter une liste vide pendant le chargement).
 *
 * @param {Array<{name:string}>} items
 * @param {Array|null|undefined} savedRows
 */
export function filterStoredItems(items, savedRows) {
  const list = Array.isArray(items) ? items : []
  if (!Array.isArray(savedRows)) return list
  const storedRows = savedRows.filter((row) => isRowStored(row))
  return list.filter((it) => storedRows.some((row) => rowMatchesItem(row, it)))
}

/**
 * Articles d'un stockage = (articles construits ∩ lignes stockées) ∪ (lignes stockées
 * absentes des articles construits). Les lignes cochées à la main hors recettes des
 * boutiques liées sont ajoutées via `makeItem(row)` (dédupliquées par nom normalisé).
 * savedRows non tableau = pas encore chargées : items inchangé (pas de clignotement).
 *
 * @param {Array<{name:string}>} items
 * @param {Array|null|undefined} savedRows
 * @param {(row:object) => object} makeItem
 */
export function mergeStoredItems(items, savedRows, makeItem) {
  const list = Array.isArray(items) ? items : []
  if (!Array.isArray(savedRows)) return list
  const kept = filterStoredItems(list, savedRows)
  const out = [...kept]
  const added = new Set() // clés déjà ajoutées (id puis nom) pour dédupliquer les lignes
  for (const row of savedRows) {
    if (!isRowStored(row)) continue
    const nameKey = normalizeItemName(row?.name)
    const idKey = row?.marketPriceId ? `id:${row.marketPriceId}` : null
    if (!nameKey && !idKey) continue
    if (list.some((it) => rowMatchesItem(row, it))) continue
    if ((idKey && added.has(idKey)) || (nameKey && added.has(`name:${nameKey}`))) continue
    if (idKey) added.add(idKey)
    if (nameKey) added.add(`name:${nameKey}`)
    out.push(makeItem(row))
  }
  return out
}

/**
 * Lignes sauvegardées de l'élément `elementId` dans la projection du store
 * `storageInventory` ({ id, inventoryByConfig }[]). Renvoie null quand elles ne sont
 * pas connues (store pas chargé, ou élément absent) : l'appelant ne filtre alors pas.
 *
 * @param {Array} elements projection du store pour l'espace
 * @param {string|number} elementId
 * @param {{ configId?: string|null, configIds?: string[]|null, allConfigs?: boolean }} [scope]
 *   allConfigs ou configId 'all' : union des configs (configIds si fourni, sinon toutes).
 */
export function savedRowsForElement(elements, elementId, scope = {}) {
  if (!Array.isArray(elements) || !elements.length) return null
  const el = elements.find((e) => String(e.id) === String(elementId))
  if (!el) return null
  const { configId = null, configIds = null, allConfigs = false } = scope
  if (allConfigs || configId == null || configId === 'all') {
    return rowsForConfigs(el.inventoryByConfig, configIds)
  }
  return rowsForConfig(el.inventoryByConfig, configId)
}
