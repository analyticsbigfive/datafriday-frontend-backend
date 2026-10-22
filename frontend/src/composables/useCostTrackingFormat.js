/**
 * Formatage de la page Cost tracking : coûts, pourcentages signés, points de marge, dates.
 * Suit la langue de l'app (virgule en fr, point en en).
 */
import { useNumberFormat } from '@/composables/useNumberFormat'

export function useCostTrackingFormat() {
  const { intlLocale, formatPrice, formatDecimal } = useNumberFormat()

  const cost = (v) => (typeof v === 'number' ? formatPrice(v) : '-')
  const axisCost = (v) => formatPrice(v)
  const plain = (v, digits = 1) =>
    typeof v === 'number' ? formatDecimal(v, digits, { pad: true }) : '-'
  const signed = (v, digits = 1) => {
    if (typeof v !== 'number') return '-'
    return `${v >= 0 ? '+' : ''}${formatDecimal(v, digits, { pad: true })}`
  }
  /** "+4,2 %" / "+4.2%" */
  const pct = (v, digits = 1) => {
    if (typeof v !== 'number') return '-'
    const n = signed(v, digits)
    return intlLocale.value === 'fr-FR' ? `${n} %` : `${n}%`
  }
  /** "18,5 %" sans signe */
  const pctPlain = (v, digits = 1) => {
    if (typeof v !== 'number') return '-'
    const n = plain(v, digits)
    return intlLocale.value === 'fr-FR' ? `${n} %` : `${n}%`
  }
  const points = (v) => (typeof v === 'number' ? `${signed(v, 1)} pt` : '-')

  const day = (t) =>
    new Date(t).toLocaleDateString(intlLocale.value, { day: 'numeric', month: 'short' })
  const dayYear = (t) =>
    new Date(t).toLocaleDateString(intlLocale.value, { day: 'numeric', month: 'short', year: 'numeric' })
  const dayLong = (t) =>
    new Date(t).toLocaleDateString(intlLocale.value, { weekday: 'long', day: 'numeric', month: 'long' })
  const month = (t) =>
    new Date(t).toLocaleDateString(intlLocale.value, { month: 'short', timeZone: 'UTC' })

  /** Classe de tendance d'un coût : up (hausse, mauvais), down, flat. */
  const trendClass = (direction) => `ct-delta--${direction || 'flat'}`

  return { cost, axisCost, plain, signed, pct, pctPlain, points, day, dayYear, dayLong, month, trendClass }
}
