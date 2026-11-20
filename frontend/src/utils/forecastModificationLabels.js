/**
 * Libellés lisibles des modifications de l'outil Forecast (Analyse). Module PUR : la
 * traduction et le formatage des nombres sont injectés (aucun import Vue / i18n), pour que
 * la liste du formulaire et l'export du rapport écrivent exactement les mêmes lignes.
 */

import { FORECAST_MODIFICATION_TYPES, PERCAP_MODES } from '@/utils/forecastModificationModel'

const T = FORECAST_MODIFICATION_TYPES
const NBSP = ' '

/** Clé i18n du nom de chaque type de modification (menu « Type de modification »). */
export const FORECAST_TYPE_LABEL_KEYS = Object.freeze({
  [T.ITEM_PRICE]: 'fcstTypeItemPrice',
  [T.CATEGORY_PCT]: 'fcstTypeCategoryPct',
  [T.TYPE_PCT]: 'fcstTypeTypePct',
  [T.TRANSFORMATION]: 'fcstTypeTransformation',
  [T.PERCAP]: 'fcstTypePercap',
  [T.BASKET]: 'fcstTypeBasket',
})

/** « +10 % », « -5 % », « 0 % » (espace insécable : le % ne passe jamais seul à la ligne). */
export function signedPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `${n > 0 ? '+' : ''}${n}${NBSP}%`
}

/** Remplace les `{nom}` du gabarit par les valeurs données. */
export function fillTemplate(template, vars = {}) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    String(template ?? ''),
  )
}

/** Nom lisible d'un article (nom de la liste d'options, sinon l'identifiant brut). */
function itemName(id, options) {
  const found = (options?.items || []).find((i) => String(i.id) === String(id))
  return found?.name || String(id ?? '')
}

/**
 * Cible d'une modification, en mots : nom de l'article, de la catégorie ou du type, ou nom du
 * levier (transformation, percap selon son mode, panier).
 */
export function modificationTargetLabel(m, { t, options = null } = {}) {
  switch (m?.type) {
    case T.ITEM_PRICE:
      return itemName(m.target, options)
    case T.CATEGORY_PCT:
    case T.TYPE_PCT:
      return String(m.target ?? '')
    case T.TRANSFORMATION:
      return t('fcstTypeTransformation')
    case T.BASKET:
      return t('fcstTypeBasket')
    case T.PERCAP:
      return m.mode === PERCAP_MODES.BASKET
        ? t('fcstTargetPercapBasket')
        : t('fcstTargetPercapTransformation')
    default:
      return ''
  }
}

const PATTERN_KEYS = {
  [T.ITEM_PRICE]: 'fcstLabelItemPrice',
  [T.CATEGORY_PCT]: 'fcstLabelCategory',
  [T.TYPE_PCT]: 'fcstLabelType',
}

/**
 * Libellé d'une ligne : « Prix TTC Bière 50 cl : 7,50 € », « Catégorie Bières : +10 % »,
 * « Percap (panier plus gros) : +5 % ».
 *
 * @param {object} m  Modification { type, target, value, mode }.
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {{ items: { id: string, name: string }[] }} [ctx.options]  Options de forecastTargetOptions.
 * @param {(n: number) => string} ctx.formatCurrency  Montant en euros (prix TTC).
 * @param {(n: number) => string} [ctx.formatPercent]  Variation signée en % (défaut : signedPercent).
 */
export function modificationLabel(m, { t, options = null, formatCurrency, formatPercent = signedPercent } = {}) {
  if (!m) return ''
  const target = modificationTargetLabel(m, { t, options })
  const value = m.type === T.ITEM_PRICE ? formatCurrency(Number(m.value)) : formatPercent(Number(m.value))
  return fillTemplate(t(PATTERN_KEYS[m.type] || 'fcstLabelGlobal'), { target, value })
}
