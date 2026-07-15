/**
 * useFormatters — helpers de formatage (euros, dollars, pourcentages, compact).
 */
// Décision UI 2026-07-12 : tous les prix affichés SANS décimales (arrondi Intl),
// signe € toujours présent (style currency).
export function formatCurrency(value, currency = 'EUR', locale = 'fr-FR', digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatCurrencyDetailed(value, currency = 'EUR', locale = 'fr-FR') {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value, locale = 'fr-FR') {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat(locale).format(Math.round(value))
}

// Loose (unités en vrac) + totaux d'inventaire : 2 décimales max (saisie et
// affichage). 12 → 12, 5.5 → 5,5, 3.25 → 3,25. Zéros de fin non forcés.
export function formatUnits(value, locale = 'fr-FR') {
  const n = Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)
}

export function formatPercent(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function formatVariation(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return ''
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}
