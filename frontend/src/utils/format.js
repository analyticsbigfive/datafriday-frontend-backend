/**
 * format.js — Helpers de formatage numérique en français.
 */

const eurFormatter0 = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const eurFormatter2 = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const intFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
})
const decFormatter2 = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const compactCurrency = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/**
 * Format en EUR. Par défaut sans décimales (utilisé pour les KPIs).
 * @param {number} value
 * @param {{ decimals?: number }} [opts]
 */
export function currencyEUR(value, opts = {}) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return (opts.decimals ?? 0) >= 2 ? eurFormatter2.format(n) : eurFormatter0.format(n)
}

/**
 * Variante compacte (12,3 k€, 1,2 M€) pour ticks d'axe.
 */
export function currencyCompactEUR(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${compactCurrency.format(n)} €`
}

export function integer(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return intFormatter.format(n)
}

export function decimal(value, decimals = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (decimals === 2) return decFormatter2.format(n)
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

/**
 * Pourcentage. `value` est un ratio (0..1) si `fromRatio` true,
 * sinon une valeur déjà multipliée par 100.
 */
export function percent(value, { decimals = 1, fromRatio = false } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const v = fromRatio ? n * 100 : n
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v) + ' %'
}
