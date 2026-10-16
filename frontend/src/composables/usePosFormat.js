import { useI18n } from '@/i18n/useI18n'
import { useNumberFormat } from '@/composables/useNumberFormat'

/** Clé i18n du libellé de statut d'une caisse (inactive / ready / selling). */
export const POS_STATUS_LABEL_KEYS = {
  inactive: 'posStatusInactive',
  ready: 'posStatusReady',
  selling: 'posStatusSelling',
}

/** Clé i18n de l'état d'un évènement (live / upcoming). */
export const POS_EVENT_STATUS_KEYS = {
  live: 'posEventLive',
  upcoming: 'posEventUpcoming',
}

/**
 * Sources de vente d'un PdV : une caisse démarrée s'ajoute aux autres sources, elle ne les
 * remplace pas (PLAN piège 2). Les codes inconnus restent affichés tels quels (sources génériques).
 * @returns {string[]} codes à afficher, POS d'abord quand la caisse est démarrée
 */
export function pdvSourceCodes(pdv) {
  const others = Array.isArray(pdv.otherSources) ? pdv.otherSources : []
  return pdv.status !== 'inactive' ? ['POS', ...others] : others
}

/** « Jeu. 17 oct. » style court, sans heure. */
export function formatPosDate(value, intlLocale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatPosTime(value, intlLocale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })
}

/** Formateurs partagés par les composants de l'outil POS (montants en euros TTC). */
export function usePosFormat() {
  const { t } = useI18n()
  const { formatPrice, formatDecimal, intlLocale } = useNumberFormat()

  const money = (value) => formatPrice(value ?? 0)
  const date = (value) => formatPosDate(value, intlLocale.value)
  const time = (value) => formatPosTime(value, intlLocale.value)
  const eventLabel = (event) => (event ? `${event.name} · ${formatPosDate(event.eventDate, intlLocale.value)}` : '')
  const sourceLabel = (code) => {
    const key = `posSource${String(code).charAt(0)}${String(code).slice(1).toLowerCase()}`
    const label = t(key)
    return label === key ? code : label
  }

  return { t, money, date, time, eventLabel, sourceLabel, formatDecimal }
}
