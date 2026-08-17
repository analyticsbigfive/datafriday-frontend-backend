/**
 * useNumberFormat — formatage de nombres/prix selon la langue de l'app :
 * fr → virgule ("12,50 €"), en → point ("€12.50").
 *
 * Généralisation du pattern BUG-240 (InventoryReconciliationView) : plus
 * jamais de 'fr-FR' en dur dans un formateur.
 */
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { getCurrentLocale } from '@/i18n'

/** 'fr'|'en' (locale app) → tag Intl. */
export function toIntlLocale(locale) {
  return String(locale || '').startsWith('en') ? 'en-US' : 'fr-FR'
}

/**
 * Tag Intl courant, lecture ponctuelle (non réactive) — pour du code hors
 * setup() de composant. Dans un composant, préférer useNumberFormat().
 */
export function currentIntlLocale() {
  return toIntlLocale(getCurrentLocale())
}

/**
 * Séparateur de milliers maison : espace fine insécable (U+202F), jamais la
 * virgule de la locale EN (retour maquette 17/08 — « pas de virgules pour les
 * 1000 »). Écrit en échappement à dessein : l'espace brute est invisible en
 * revue et un formateur d'éditeur peut la transformer en espace normale.
 */
export const GROUP_SEPARATOR = '\u202F'

/**
 * Formate `n` via l'instance `nf` en remplaçant le séparateur de groupe de la
 * locale par GROUP_SEPARATOR. fr-FR produit déjà une espace (U+202F ou U+00A0
 * selon la version d'ICU) — le passage par formatToParts uniformise les deux.
 */
export function formatSpacedGroups(nf, n) {
  return nf
    .formatToParts(n)
    .map((p) => (p.type === 'group' ? GROUP_SEPARATOR : p.value))
    .join('')
}

/**
 * Composable réactif — à appeler dans setup().
 * Retourne { intlLocale, formatDecimal, formatPrice, formatPercentLocale }.
 */
export function useNumberFormat() {
  const { locale } = useI18n()
  const intlLocale = computed(() => toIntlLocale(locale.value))

  /**
   * "1 234,56" / "1,234.56" — jusqu'à `decimals` décimales (pad = zéros forcés).
   * `grouping` (déf. true) : séparateur de milliers. À désactiver pour un
   * COMPTEUR/quantité affiché en ligne (« of 1003 Pc ») — le regroupement en
   * milliers n'a de sens que pour de gros montants lus isolément (prix,
   * totaux), pas pour une quantité technique dans une phrase.
   */
  const formatDecimal = (value, decimals = 2, { pad = false, grouping = true } = {}) => {
    const n = Number(value)
    if (value == null || value === '' || Number.isNaN(n)) return '—'
    return new Intl.NumberFormat(intlLocale.value, {
      minimumFractionDigits: pad ? decimals : 0,
      maximumFractionDigits: decimals,
      useGrouping: grouping,
    }).format(n)
  }

  /** "12,50 €" / "€12.50" — 2 décimales forcées par défaut. */
  const formatPrice = (value, { decimals = 2, currency = 'EUR' } = {}) => {
    const n = Number(value)
    if (value == null || value === '' || Number.isNaN(n)) return '—'
    return new Intl.NumberFormat(intlLocale.value, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n)
  }

  /** "5,5 %" / "5.5%" — séparateur décimal localisé, contrairement à toFixed. */
  const formatPercentLocale = (value, digits = 1) => {
    const n = Number(value)
    if (value == null || Number.isNaN(n)) return '—'
    const num = new Intl.NumberFormat(intlLocale.value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n)
    return intlLocale.value === 'fr-FR' ? `${num} %` : `${num}%`
  }

  return { intlLocale, formatDecimal, formatPrice, formatPercentLocale }
}
