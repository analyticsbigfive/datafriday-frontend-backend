import { translatePackagingType, pluralize } from '@/utils/packagingTypeTranslations'
import { formatPacks } from '@/utils/bufferPackaging'

/**
 * Quantité de stock exprimée en CONDITIONNEMENT (« 10 fûts de 30 L »), jamais avec un mot
 * vague (« packs », « colis ») en repli :
 *   - type + contenance : « 10 fûts de 30 L » (singulier à 1) ;
 *   - type sans contenance : « 10 fûts » ;
 *   - pas de type, contenance connue : la quantité convertie en unité réelle (« 300 L ») ;
 *   - pas de type, pas de contenance : « 10 L » (contenance inconnue = 1 unité de base).
 */

const positive = (v) => (Number(v) > 0 ? Number(v) : null)

/**
 * Valeur et libellé séparés (pour les gabarits qui rendent le nombre et l'unité dans deux
 * éléments) : { value: nombre affiché, label: « fûts de 30 L » ou « L » }.
 *
 * @param {{count:number, packagingType?:string, unitsPerPack?:number, unit?:string}} q
 * @param {(key:string)=>string} t
 * @param {string} locale
 * @param {{plural?:boolean}} [opts] pluriel forcé ; par défaut accord sur count (> 1)
 */
export function conditionnementParts({ count, packagingType, unitsPerPack, unit } = {}, t, locale = 'fr', { plural } = {}) {
  const n = Number(count) || 0
  const unitText = unit ? String(unit).trim() : ''
  const size = positive(unitsPerPack)
  const rawType = translatePackagingType(packagingType ? String(packagingType).trim() : '', locale)
  if (rawType) {
    const type = String(rawType).toLowerCase()
    const word = (plural == null ? Math.abs(n) > 1 : plural) ? pluralize(type) : type
    const label = size ? `${word} ${t('logiPackagingOf')} ${formatPacks(size, locale)} ${unitText}`.trim() : word
    return { value: n, label }
  }
  return { value: size ? n * size : n, label: unitText }
}

/** « 10 fûts de 30 L », « 10 fûts », « 300 L » ou « 12 pièces » (voir conditionnementParts). */
export function conditionnementText(q, t, locale = 'fr', opts = {}) {
  const { value, label } = conditionnementParts(q, t, locale, opts)
  return `${formatPacks(value, locale)} ${label}`.trim()
}

/** Contenance par colis sous le nom de l'article : « 30 L/fût », ou « 30 L » sans type. Vide si inconnue. */
export function packSizeText({ packagingType, unitsPerPack, unit } = {}, locale = 'fr') {
  const size = positive(unitsPerPack)
  if (!size) return ''
  const base = `${formatPacks(size, locale)} ${unit ? String(unit).trim() : ''}`.trim()
  const type = translatePackagingType(packagingType ? String(packagingType).trim() : '', locale)
  return type ? `${base}/${String(type).toLowerCase()}` : base
}

/**
 * Désignation du colis sans quantité : « fûts de 30 L » (pluriel), « fûts » sans contenance,
 * « conditionnements de 30 L » sans type. Sert d'en-tête de colonne et de base au libellé de champ.
 */
export function packNounLabel({ packagingType, unitsPerPack, unit } = {}, t, locale = 'fr') {
  const size = positive(unitsPerPack)
  const unitText = unit ? String(unit).trim() : ''
  const rawType = translatePackagingType(packagingType ? String(packagingType).trim() : '', locale)
  const word = rawType ? pluralize(String(rawType).toLowerCase()) : pluralize(t('logiPackagingNoun'))
  const of = size ? ` ${t('logiPackagingOf')} ${formatPacks(size, locale)} ${unitText}`.trimEnd() : ''
  return `${word}${of}`
}

/**
 * Libellé d'un champ de saisie du nombre de colis : « Nombre de fûts de 30 L ». Sans type, le
 * mot du domaine « conditionnement » (jamais « emballé » ni « pack »).
 */
export function packFieldLabel(q = {}, t, locale = 'fr') {
  return `${t('logiNumberOf')} ${packNounLabel(q, t, locale)}`
}
