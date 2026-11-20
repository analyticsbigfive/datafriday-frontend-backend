/**
 * Réglages d'affichage du curseur de pourcentage de l'outil Forecast. Module PUR.
 * Pour chaque type : clé du libellé, et valeur de base du rapport sur laquelle le % porte
 * (la valeur simulée s'affiche à côté du %). Les prix d'article et de catégorie n'ont pas de
 * valeur de base unique : le curseur n'affiche que le %.
 */

import { FORECAST_MODIFICATION_TYPES } from '@/utils/forecastModificationModel'

const T = FORECAST_MODIFICATION_TYPES

export const SLIDER_META = Object.freeze({
  [T.CATEGORY_PCT]: { labelKey: 'fcstSliderPrice', baseKey: null, unit: null },
  [T.TYPE_PCT]: { labelKey: 'fcstSliderPrice', baseKey: null, unit: null },
  [T.TRANSFORMATION]: { labelKey: 'fcstSliderTransformation', baseKey: 'transformationRate', unit: 'percent' },
  [T.PERCAP]: { labelKey: 'fcstSliderPercap', baseKey: 'perCapita', unit: 'currency' },
  [T.BASKET]: { labelKey: 'fcstSliderBasket', baseKey: 'basket', unit: 'currency' },
})

/** Valeur de base du rapport pour un type (nombre fini, sinon null). */
export function baseValueFor(type, baseValues) {
  const key = SLIDER_META[type]?.baseKey
  const raw = key ? baseValues?.[key] : null
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Valeur après application du % : base x (1 + %/100). Base inconnue : null. */
export function resultingValue(base, pct) {
  if (base == null || !Number.isFinite(Number(base))) return null
  const p = Number(pct)
  return Number(base) * (1 + (Number.isFinite(p) ? p : 0) / 100)
}
