import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'
import { resolveMarketPrice } from '@/utils/storageManualItem'

/**
 * Stock tampon en colis. `ElementInventory.quantity` est STOCKÉE en unités de base
 * (12 fûts de 20 L = 240) ; la saisie et l'affichage se font en colis, avec le nom du
 * conditionnement et sa contenance du Market Price (« 12 fûts de 20 L »).
 */

const round = (n, digits) => {
  const f = 10 ** digits
  return Math.round((Number(n) + Number.EPSILON) * f) / f
}

/** Contenance d'un colis lue sur le Market Price, ou null si aucune n'est renseignée. */
function explicitPackSize(mp) {
  if (Number(mp?.inventoryQuantityPackaged) > 0) return Number(mp.inventoryQuantityPackaged)
  if (Number(mp?.packedUnits) > 0) return Number(mp.packedUnits)
  return null
}

/**
 * Unités de base par colis : même règle que resolveQtyPackaged (storageManualItem.js),
 * inventoryQuantityPackaged > 0, sinon packedUnits > 0, sinon 1 (sans conditionnement).
 */
export function packSizeOf(mp) {
  return explicitPackSize(mp) ?? 1
}

/** Nombre formaté, 2 décimales au plus, sans zéros de fin (12 -> « 12 », 5.5 -> « 5,5 » en FR). */
export function formatPacks(value, locale = 'fr') {
  const n = Number(value)
  if (value == null || value === '' || !Number.isFinite(n)) return ''
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 2 }).format(round(n, 2))
}

/**
 * Libellé du conditionnement, ex. « fût de 20 L », « paquet de 4 unités » (pluriel : « fûts de 20 L »).
 * Même construction que « Nombre de fûts de 20 L » des cartes Logistique (packedLabel) : type traduit
 * + logiPackagingOf + contenance + unité. Type sans contenance : le type seul. Sans conditionnement :
 * l'unité du Market Price (contenance 1), ou le mot générique « colis » si l'unité est inconnue.
 *
 * @param {object|null} mp Market Price
 * @param {(key:string)=>string} t
 * @param {string} locale
 * @param {{plural?:boolean}} [opts]
 */
export function packLabelOf(mp, t, locale = 'fr', { plural = false } = {}) {
  const rawType = translatePackagingType(mp?.inventoryPackaging ? String(mp.inventoryPackaging).trim() : '', locale)
  const unit = mp?.unit ? String(mp.unit).trim() : ''
  if (rawType) {
    const type = String(rawType).toLowerCase()
    const word = plural ? pluralize(type) : type
    const size = explicitPackSize(mp)
    return size ? `${word} ${t('logiPackagingOf')} ${formatPacks(size, locale)} ${unit}`.trim() : word
  }
  return unit || t('bufferPacksGeneric')
}

/** Unités de base -> colis (arrondi à 2 décimales). Sans Market Price, contenance 1. */
export function unitsToPacks(units, mp) {
  const n = Number(units)
  if (!Number.isFinite(n)) return 0
  return round(n / packSizeOf(mp), 2)
}

/** Colis (décimaux autorisés) -> unités de base à persister. Valeur invalide ou négative : 0. */
export function packsToUnits(packs, mp) {
  const n = Number(packs)
  if (!Number.isFinite(n) || n < 0) return 0
  return round(n * packSizeOf(mp), 4)
}

/** Texte complet du tampon, ex. « 12 fûts de 20 L ». `units` = quantité stockée en unités de base. */
export function bufferPacksText(units, mp, t, locale = 'fr') {
  const packs = unitsToPacks(units, mp)
  return `${formatPacks(packs, locale)} ${packLabelOf(mp, t, locale, { plural: Math.abs(packs) > 1 })}`.trim()
}

/**
 * Libellé commun à plusieurs produits : celui du conditionnement s'il est identique pour tous,
 * sinon le mot générique « colis » (jamais un libellé faux).
 */
export function sharedPackLabel(mps, t, locale = 'fr') {
  const list = Array.isArray(mps) ? mps : []
  if (!list.length) return t('bufferPacksGeneric')
  const labels = new Set(list.map((mp) => packLabelOf(mp, t, locale, { plural: true })))
  return labels.size === 1 && list.every(Boolean) ? [...labels][0] : t('bufferPacksGeneric')
}

/** Raccourci : Market Price d'une référence { name, marketPriceId } dans la liste du catalogue. */
export const marketPriceOf = resolveMarketPrice

/**
 * Pseudo Market Price d'un article de la Logistique (mêmes champs que la carte « Nombre de fûts de
 * 20 L » : type de conditionnement, contenance résolue, unité), pour réutiliser les libellés ci-dessus.
 */
export function packagingFromLogisticItem(item, unitsPerPack) {
  return {
    inventoryPackaging: item?.packagingType ?? null,
    inventoryQuantityPackaged: Number(unitsPerPack) > 0 ? Number(unitsPerPack) : null,
    unit: item?.unit ?? null,
  }
}

/** Stock total en unités de base d'une carte Logistique : colis * contenance + vrac. */
export function logisticTotalUnits(packed, loose, unitsPerPack) {
  const upp = Number(unitsPerPack) > 0 ? Number(unitsPerPack) : 1
  return round((Number(packed) || 0) * upp + (Number(loose) || 0), 4)
}

/** Vrai si un tampon est défini (> 0) et que le total est strictement dessous. */
export function isBelowBuffer(totalUnits, bufferUnits) {
  const buffer = Number(bufferUnits)
  return buffer > 0 && (Number(totalUnits) || 0) < buffer
}
