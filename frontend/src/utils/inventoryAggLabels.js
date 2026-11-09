import { packNounLabel } from '@/utils/packQuantityText'

/**
 * Libellés de l'agrégat inventaire (colonne de droite, pré et post event).
 *
 * L'en-tête de la colonne des colis dit le conditionnement de l'article : « fûts de 30 L »
 * (type, contenance, unité du Market Price). Sans type, le mot « conditionnements » et la
 * contenance si connue. L'en-tête du vrac porte l'unité réelle (« L », « kg »).
 */
const clean = (value) => String(value ?? '').trim()

export function aggPackagingLabel(item, t, locale = 'fr') {
  return packNounLabel({ packagingType: item?.packagingLabel, unitsPerPack: item?.packSize, unit: item?.unit }, t, locale)
}

export function aggUnitLabel(item, fallback) {
  return clean(item?.unit) || fallback
}
