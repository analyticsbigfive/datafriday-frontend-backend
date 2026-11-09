import { marketPricePackSize } from '@/utils/marketPricePackSize'
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
  return marketPricePackSize(mp)
}

/**
 * Unités de base par colis : règle de marketPricePackSize, sinon 1 (sans conditionnement).
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
 * l'unité réelle du Market Price (contenance 1). Market Price inconnu : chaîne vide, jamais de mot vague.
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
  return unit
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
 * Libellé commun à plusieurs produits : celui du conditionnement s'il est identique pour tous.
 * Renvoie null si les conditionnements diffèrent ou si un Market Price est inconnu : l'appelant
 * affiche alors un champ par produit avec son propre conditionnement, jamais un mot générique.
 */
export function sharedPackLabel(mps, t, locale = 'fr') {
  const list = Array.isArray(mps) ? mps : []
  if (!list.length || !list.every(Boolean)) return null
  const labels = new Set(list.map((mp) => packLabelOf(mp, t, locale, { plural: true })))
  return labels.size === 1 ? [...labels][0] : null
}

/** Raccourci : Market Price d'une référence { name, marketPriceId } dans la liste du catalogue. */
export const marketPriceOf = resolveMarketPrice

/** Vrai si le Market Price porte un conditionnement (type ou contenance). */
export function hasPackaging(mp) {
  return !!(mp && (mp.inventoryPackaging || explicitPackSize(mp)))
}

/**
 * Tampon d'une carte (unités de base) en conditionnement : « 10 fûts de 30 L (300 L) ». Sans
 * conditionnement connu, l'unité réelle seule (`looseText`, ex. « 300 L »), jamais un mot vague.
 *
 * @param {number} units quantité en unités de base
 * @param {object|null} mp Market Price
 * @param {string} looseText la même quantité formatée avec son unité
 */
export function bufferDisplayText(units, mp, t, locale, looseText) {
  if (!hasPackaging(mp)) return looseText
  return `${bufferPacksText(units, mp, t, locale)} (${looseText})`
}
