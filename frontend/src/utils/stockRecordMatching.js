// Accès aux champs d'un record de prédiction et rattachement d'un record à un
// élément (PdV) de la configuration.
//
// Ces trois helpers vivaient dans `stockPlanning`. Ils sont isolés ici pour que
// `stockRecordIndex` (index des records, construit à chaque calcul) puisse les
// consommer sans import circulaire avec `stockPlanning`, qui les ré-exporte pour
// ne casser aucun importeur existant.

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Clé d'appariement : une valeur falsy est ignorée, une valeur truthy est
 * comparée par sa représentation texte. `null` (et non `''`) marque l'absence :
 * un objet truthy dont le texte est vide reste une clé valide, comme avec
 * `.filter(Boolean).map(String)`.
 */
function toKey(value) {
  return value ? String(value) : null
}

/**
 * Vrai quand une des clés d'identité du record (shopId, elementId, shop,
 * shopName, elementName, registryId) égale une des clés d'identité de l'élément
 * (id, registryId, name, shopName). Appelée des milliers de fois par calcul :
 * aucune allocation (pas de tableau intermédiaire).
 */
export function shopRecordMatchesElement(record, element) {
  if (!record || !element) return false
  const e0 = toKey(element.id)
  const e1 = toKey(element.registryId)
  const e2 = toKey(element.name)
  const e3 = toKey(element.shopName)
  if (e0 === null && e1 === null && e2 === null && e3 === null) return false

  const r0 = toKey(record.shopId)
  if (r0 !== null && (r0 === e0 || r0 === e1 || r0 === e2 || r0 === e3)) return true
  const r1 = toKey(record.elementId)
  if (r1 !== null && (r1 === e0 || r1 === e1 || r1 === e2 || r1 === e3)) return true
  const r2 = toKey(record.shop)
  if (r2 !== null && (r2 === e0 || r2 === e1 || r2 === e2 || r2 === e3)) return true
  const r3 = toKey(record.shopName)
  if (r3 !== null && (r3 === e0 || r3 === e1 || r3 === e2 || r3 === e3)) return true
  const r4 = toKey(record.elementName)
  if (r4 !== null && (r4 === e0 || r4 === e1 || r4 === e2 || r4 === e3)) return true
  const r5 = toKey(record.registryId)
  return r5 !== null && (r5 === e0 || r5 === e1 || r5 === e2 || r5 === e3)
}

export function getRecordMenuItemId(record) {
  return record?.menuItemId || record?.mappedMenuItemId || record?.itemId || ''
}

export function getRecordQuantity(record) {
  return toNumber(
    record?.totalQuantity ??
      record?.adjustedQuantity ??
      record?.quantity ??
      record?.qty,
  )
}
