/**
 * useFormatters — helpers de formatage (euros, pourcentages, unités).
 *
 * La locale par défaut suit la langue de l'app (fr → "12,50 €", en → "€12.50")
 * via currentIntlLocale() ; passer un tag Intl explicite pour forcer.
 */
import { currentIntlLocale, formatSpacedGroups } from '@/composables/useNumberFormat'

// Décision UI 2026-07-12 : les KPI/totaux (formatCurrency) restent SANS
// décimales ; les prix unitaires passent par formatCurrencyDetailed (2 déc.).
// Exception 2026-08-03 : les RATIOS par ticket/transaction (per-cap, panier
// moyen) passent aussi par formatCurrencyDetailed — sur des montants de 3 à 5 €
// l'arrondi entier écrase toute la variation utile (« 3 € » pour 3,45 comme pour
// 2,51). Concerne les cards Summary d'Event Predict, les KPI Analyse et le
// graphe par évènement. Les totaux (CA, coût) gardent 0 décimale.
// Précision 2026-08-17 (retours maquette Event Predict) : les coûts agrégés
// (coût staff, coût matières, coût global) sont des TOTAUX → 0 décimale eux
// aussi ; et le séparateur de milliers est toujours une espace fine, jamais la
// virgule de la locale EN — TOUS les formateurs de ce fichier passent par
// formatSpacedGroups, sinon un même écran mêlerait « €1 234 » et « 1,234 ».
export function formatCurrency(value, currency = 'EUR', locale = null, digits = 0) {
  const n = Number(value)
  if (value == null || value === '' || Number.isNaN(n)) return '—'
  const nf = new Intl.NumberFormat(locale || currentIntlLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return formatSpacedGroups(nf, n)
}

export function formatCurrencyDetailed(value, currency = 'EUR', locale = null) {
  return formatCurrency(value, currency, locale, 2)
}

export function formatNumber(value, locale = null) {
  const n = Number(value)
  if (value == null || value === '' || Number.isNaN(n)) return '—'
  const nf = new Intl.NumberFormat(locale || currentIntlLocale())
  return formatSpacedGroups(nf, Math.round(n))
}

// Loose (unités en vrac) + totaux d'inventaire : 2 décimales max (saisie et
// affichage). 12 → 12, 5.5 → 5,5, 3.25 → 3,25. Zéros de fin non forcés.
export function formatUnits(value, locale = null) {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  const nf = new Intl.NumberFormat(locale || currentIntlLocale(), {
    maximumFractionDigits: 2,
  })
  return formatSpacedGroups(nf, n)
}

export function formatPercent(value, digits = 1, locale = null) {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  const nf = new Intl.NumberFormat(locale || currentIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${formatSpacedGroups(nf, n)}%`
}

export function formatVariation(value, digits = 1, locale = null) {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return ''
  const sign = n >= 0 ? '+' : ''
  const nf = new Intl.NumberFormat(locale || currentIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${sign}${formatSpacedGroups(nf, n)}%`
}
