// Fournisseur des lignes de remplissage des espaces de stockage (feuille de course,
// fiche 314-01). Une ligne de stockage ne porte souvent que le NOM de l'article :
// résolue par nom, elle tombait sur un homonyme pris au hasard (retour Bertrand du
// 2026-10-09 : « Coca-Cola Cherry - CAN 33CL » existe 5 fois, le remplissage du
// Conteneur stockage Océanne partait chez France boissons IDF alors que Nantes est
// livré par France boisson Loire). Fonctions PURES.

import { normalizeStr } from '@/utils/predictiveAnalytics'

/** Groupe technique de la feuille (`__finished__`, `__unknown_supplier__`…). */
function isTechnicalGroup(group) {
  return String(group?.supplierId ?? '').startsWith('__')
}

function sameItem(item, line) {
  if (line.itemId && (String(item.itemId) === String(line.itemId) || String(item.sourceId) === String(line.itemId))) return true
  return normalizeStr(item.itemName) === normalizeStr(line.itemName)
}

/**
 * Article déjà acheté pour les PDV (même id ou même nom), chez un vrai fournisseur :
 * le remplissage du stockage suit ce même achat.
 * @param {Array<{supplierId:string, items:Array}>} groups
 * @param {{itemId?:string|null, itemName:string}} line
 * @returns {{group:object, item:object}|null}
 */
export function findPurchaseFor(groups, line) {
  for (const group of groups || []) {
    if (isTechnicalGroup(group)) continue
    const item = (group.items || []).find((it) => sameItem(it, line))
    if (item) return { group, item }
  }
  return null
}

/**
 * Parmi les ingrédients homonymes d'une ligne de stockage, celui dont le fournisseur
 * livre l'espace. null si le nom ne désigne pas plusieurs ingrédients, si l'espace est
 * inconnu, ou si aucun homonyme n'est livré dans l'espace (la résolution par nom reste).
 * @param {object} p
 * @param {string} p.itemName
 * @param {Array<{id:string, name:string, marketPriceId?:string, marketPrice?:{id:string, supplierId?:string}}>} p.ingredients
 * @param {Array<{id:string, supplierId?:string}>} p.marketPrices
 * @param {Set<string>|null} p.spaceSupplierIds
 * @returns {string|null} id de l'ingrédient retenu
 */
export function pickSpaceHomonym({ itemName, ingredients, marketPrices, spaceSupplierIds }) {
  if (!spaceSupplierIds) return null
  const name = normalizeStr(itemName)
  const candidates = (ingredients || []).filter((ing) => name && normalizeStr(ing?.name) === name)
  if (candidates.length < 2) return null
  const mpById = new Map((marketPrices || []).map((mp) => [String(mp.id), mp]))
  const supplierOf = (ing) => {
    const direct = ing.marketPrice?.supplierId
    if (direct != null) return String(direct)
    const mpId = ing.marketPriceId ?? ing.marketPrice?.id
    const mp = mpId != null ? mpById.get(String(mpId)) : null
    return mp?.supplierId != null ? String(mp.supplierId) : null
  }
  const inSpace = candidates.find((ing) => {
    const sid = supplierOf(ing)
    return sid != null && spaceSupplierIds.has(sid)
  })
  return inSpace ? String(inSpace.id) : null
}

/**
 * Market Price d'une ligne de stockage qui n'est pas une recette (article d'emballage,
 * réserve saisie dans le Builder). Id d'abord (survit aux homonymes), sinon le nom :
 * parmi les homonymes, celui dont le fournisseur livre l'espace, puis le premier qui a
 * un fournisseur lié. null si rien ne correspond.
 * @param {object} p
 * @param {string|null} [p.marketPriceId]
 * @param {string} p.itemName
 * @param {Array<{id:string, itemName?:string, supplierId?:string}>} p.marketPrices
 * @param {Set<string>|null} p.spaceSupplierIds
 * @returns {object|null}
 */
export function pickStorageMarketPrice({ marketPriceId, itemName, marketPrices, spaceSupplierIds }) {
  const list = marketPrices || []
  if (marketPriceId) {
    const byId = list.find((mp) => String(mp?.id) === String(marketPriceId))
    if (byId) return byId
  }
  const name = normalizeStr(itemName)
  if (!name) return null
  const homonyms = list.filter((mp) => normalizeStr(mp?.itemName) === name)
  if (!homonyms.length) return null
  const linked = homonyms.filter((mp) => mp.supplierId != null && mp.supplierId !== '')
  const inSpace = spaceSupplierIds ? linked.find((mp) => spaceSupplierIds.has(String(mp.supplierId))) : null
  return inSpace || linked[0] || homonyms[0]
}
