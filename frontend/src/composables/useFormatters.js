/**
 * useFormatters — helpers de formatage (euros, pourcentages, unités).
 *
 * La locale par défaut suit la langue de l'app (fr → "12,50 €", en → "€12.50")
 * via currentIntlLocale() ; passer un tag Intl explicite pour forcer.
 */
import { currentIntlLocale } from '@/composables/useNumberFormat'

// Décision UI 2026-07-12 : les KPI/totaux (formatCurrency) restent SANS
// décimales ; les prix unitaires passent par formatCurrencyDetailed (2 déc.).
// Exception 2026-08-03 : les RATIOS par ticket/transaction (per-cap, panier
// moyen) passent aussi par formatCurrencyDetailed — sur des montants de 3 à 5 €
// l'arrondi entier écrase toute la variation utile (« 3 € » pour 3,45 comme pour
// 2,51). Concerne les cards Summary d'Event Predict, les KPI Analyse et le
// graphe par évènement. Les totaux (CA, coût) gardent 0 décimale.
export function formatCurrency(value, currency = 'EUR', locale = null, digits = 0) {
  const n = Number(value)
  if (value == null || value === '' || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(locale || currentIntlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

export function formatCurrencyDetailed(value, currency = 'EUR', locale = null) {
  return formatCurrency(value, currency, locale, 2)
}

export function formatNumber(value, locale = null) {
  const n = Number(value)
  if (value == null || value === '' || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(locale || currentIntlLocale()).format(Math.round(n))
}

// Loose (unités en vrac) + totaux d'inventaire : 2 décimales max (saisie et
// affichage). 12 → 12, 5.5 → 5,5, 3.25 → 3,25. Zéros de fin non forcés.
export function formatUnits(value, locale = null) {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(locale || currentIntlLocale(), {
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatPercent(value, digits = 1, locale = null) {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  const num = new Intl.NumberFormat(locale || currentIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
  return `${num}%`
}

export function formatVariation(value, digits = 1, locale = null) {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return ''
  const sign = n >= 0 ? '+' : ''
  const num = new Intl.NumberFormat(locale || currentIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
  return `${sign}${num}%`
}
