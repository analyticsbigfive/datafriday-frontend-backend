// Dépôt d'une ligne de la Ventilation par le checkmark (retour Bertrand 2026-11-10 :
// valider un dépôt doit se refléter dans le stock des PDV). Fonctions PURES : la
// quantité exacte à déposer pour une ligne, les dépôts à annuler en la décochant et
// l'index des lignes de la feuille. L'écriture reste aux hôtes (Logistique, page PIN).

import { normalizeStr } from '@/utils/predictiveAnalytics'

const EPSILON = 1e-9

/**
 * Quantité exacte de la ligne en packs entiers + vrac (le dépôt n'arrondit jamais au
 * colis supérieur : le stock reçoit ce que la feuille prévoit).
 * @param {number} quantity unités de l'article à déposer
 * @param {number|null} unitsPerPack taille de pack Logistic de la destination
 * @returns {{packed:number, loose:number}}
 */
export function exactDepositShare(quantity, unitsPerPack) {
  const q = Number(quantity) || 0
  const upp = Number(unitsPerPack) > 0 ? Number(unitsPerPack) : 0
  if (!upp) return { packed: 0, loose: q }
  const packed = Math.floor(q / upp + EPSILON)
  const loose = Math.round((q - packed * upp) * 1e6) / 1e6
  return { packed, loose: Math.abs(loose) < EPSILON ? 0 : loose }
}

/**
 * Dépôts actifs (non annulés) d'une ligne : destination × article (identité par nom
 * normalisé, comme Logistic). Ce sont ceux qu'annule le décochage.
 * @param {Array<{id:string, elementId:string, itemKey:string, cancelled?:boolean}>} movements
 */
export function activeRowDeposits(movements, elementId, itemName) {
  const wanted = normalizeStr(itemName)
  return (movements || []).filter(
    (m) => m && !m.cancelled && String(m.elementId) === String(elementId) && normalizeStr(m.itemKey) === wanted,
  )
}

/**
 * Index des lignes de la feuille par article × destination, pour retrouver la ligne
 * (parts, quantité, déjà déposée) depuis la seule paire `[clé article, id destination]`
 * que manipulent les composants de la Ventilation.
 * @param {Array<object>} groups sortie de groupDepositLinesByItem
 * @returns {Map<string, {group:object, row:object}>}
 */
export function indexVentilationRows(groups) {
  const map = new Map()
  for (const group of groups || []) {
    for (const row of group.rows || []) map.set(rowId(group.itemKey, row.shopId), { group, row })
  }
  return map
}

export function rowId(itemKey, elementId) {
  return `${itemKey}|||${elementId}`
}

/** Une ligne a-t-elle quelque chose à déposer (quantité ou packs prévus) ? */
export function hasPlannedQuantity(row) {
  return Number(row?.quantity) > 0 || Number(row?.packs) > 0
}
