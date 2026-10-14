/**
 * comparisonFormModel : fonctions PURES du formulaire de comparaison (modèle, valeurs par
 * défaut, options des listes, dates résolues, règles de validation). Aucune lecture de
 * store ni de DOM : tout arrive en paramètres.
 *
 * Le modèle est exactement l'objet attendu par buildComparisonFilters / useComparisonReport.
 * Dates : jamais new Date('AAAA-MM-JJ') (minuit UTC), toujours un constructeur local.
 */
import { getDateRangePresets, PRESET_I18N_KEYS } from '@/constants/dateRangePresets'
import { eventDateOf } from '@/utils/analyseEventFilter'
import { resolveDateBounds } from '@/utils/analyseDateBounds'
import { shortcutPeriodBounds } from '@/utils/comparisonFilters'
import { DEFAULT_TEMPERATURE_RANGE, isTemperatureFilterActive } from '@/utils/eventDayWeatherFilters'

export const COMPARISON_KINDS = ['period', 'category', 'event', 'predict']

/** Clés i18n des types de comparaison (ordre d'affichage). */
export const KIND_LABEL_KEYS = {
  period: 'anCmpKindPeriod',
  category: 'anCmpKindCategory',
  event: 'anCmpKindEvent',
  predict: 'anCmpKindPredict',
}

const first = (list) => (Array.isArray(list) && list.length ? String(list[0]) : null)

/** 'AAAA-MM-JJ' -> Date locale (minuit local), null si illisible. */
export function parseInputDateLocal(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3])
}

/**
 * Saison précédant celle du principal (celle qui se termine le plus tard avant son début).
 * @returns {string|null} valeur de période `season:<id>` ou null
 */
export function previousSeasonPeriod(mainTimeRange, seasons = []) {
  const tr = String(mainTimeRange || '')
  if (!tr.startsWith('season:')) return null
  const current = (seasons || []).find((s) => s.id === tr.slice('season:'.length))
  if (!current) return null
  const start = new Date(current.startDate).getTime()
  let best = null
  let bestEnd = -Infinity
  for (const s of seasons) {
    if (s.id === current.id) continue
    const end = new Date(s.endDate).getTime()
    if (Number.isFinite(end) && end < start && end > bestEnd) {
      best = s
      bestEnd = end
    }
  }
  return best ? `season:${best.id}` : null
}

/** Période par défaut : saison précédente, sinon « Période précédente », sinon personnalisée vide. */
export function defaultPeriod(mainFilters, { seasons = [], shortcutAvailable = false } = {}) {
  const prevSeason = previousSeasonPeriod(mainFilters?.timeRange, seasons)
  if (prevSeason) return prevSeason
  return shortcutAvailable ? 'prev' : 'custom'
}

/** Modèle par défaut du formulaire (type / catégorie : ceux du principal, premier élément). */
export function defaultComparisonModel(mainFilters, { seasons = [], shortcutAvailable = false } = {}) {
  const t = first(mainFilters?.selectedEventTypes)
  const c = first(mainFilters?.selectedEventCategories)
  const s = first(mainFilters?.selectedSubcategories)
  return {
    kind: 'period',
    period: defaultPeriod(mainFilters, { seasons, shortcutAvailable }),
    from: '',
    to: '',
    eventTypes: t ? [t] : [],
    categories: c ? [c] : [],
    subcategories: s ? [s] : [],
    eventIds: [],
    selectedDaysOfWeek: [],
    selectedDoorsOpenings: [],
    selectedShowTimes: [],
    selectedWeather: [],
    temperatureRange: [...DEFAULT_TEMPERATURE_RANGE],
  }
}

/** Nombre de filtres avancés renseignés (compteur du bloc repliable). */
export function advancedCount(model) {
  const m = model || {}
  return (
    (m.selectedDaysOfWeek?.length ? 1 : 0)
    + (m.selectedDoorsOpenings?.length ? 1 : 0)
    + (m.selectedShowTimes?.length ? 1 : 0)
    + (m.selectedWeather?.length ? 1 : 0)
    + (isTemperatureFilterActive(m.temperatureRange) ? 1 : 0)
  )
}

/** Copie profonde du modèle (état « appliqué », jamais partagé avec le brouillon). */
export const cloneModel = (model) => JSON.parse(JSON.stringify(model))

/**
 * Options de la liste Période, groupées. Les raccourcis sont désactivés (mais présents)
 * quand le principal est en « tout l'historique ».
 * @returns {Array<{ key: string, label: string, options: Array<{ value, label, disabled }> }>}
 */
export function periodOptionGroups({ translate, seasons = [], shortcutAvailable = false, toolbox = 'analyse' }) {
  const presets = getDateRangePresets(toolbox)
    .filter((p) => p.value !== 'custom')
    .map((p) => ({ value: p.value, label: translate(PRESET_I18N_KEYS[p.value] || p.value), disabled: false }))
  const groups = [
    {
      key: 'shortcuts',
      label: translate('anCmpGroupShortcuts'),
      options: [
        { value: 'prev', label: translate('anCmpPeriodPrev'), disabled: !shortcutAvailable },
        { value: 'n1', label: translate('anCmpPeriodN1'), disabled: !shortcutAvailable },
      ],
    },
  ]
  if (seasons.length) {
    groups.push({
      key: 'seasons',
      label: translate('anCmpGroupSeasons'),
      options: seasons.map((s) => ({ value: `season:${s.id}`, label: s.name, disabled: false })),
    })
  }
  groups.push({ key: 'presets', label: translate('anCmpGroupPresets'), options: presets })
  groups.push({
    key: 'custom',
    label: translate('anCmpGroupCustom'),
    options: [{ value: 'custom', label: translate('anCmpPeriodCustom'), disabled: false }],
  })
  return groups
}

/**
 * Bornes réellement appliquées par la période du formulaire.
 * @returns {{ start: Date|null, end: Date|null, allTime: boolean, incomplete: boolean }}
 */
export function resolveFormPeriod(model, mainFilters, { seasons = [], now = new Date() } = {}) {
  const period = model?.period || 'custom'
  let b
  if (period === 'prev' || period === 'n1') {
    b = shortcutPeriodBounds(mainFilters || {}, period, { seasons, now })
  } else if (period === 'custom') {
    b = { start: parseInputDateLocal(model?.from), end: parseInputDateLocal(model?.to) }
    return { ...b, allTime: false, incomplete: !b.start && !b.end }
  } else {
    b = resolveDateBounds({ timeRange: period }, { seasons, now })
  }
  const hasBounds = !!(b.start && b.end)
  return { start: b.start || null, end: b.end || null, allTime: period === 'all' || (!hasBounds && period !== 'custom' && !String(period).startsWith('season:')), incomplete: false }
}

/** Texte « 12 oct. 2026 au 3 janv. 2027 » (ou « Tout l'historique »), '' si rien à afficher. */
export function formatResolvedPeriod(resolved, { locale = 'fr', translate }) {
  if (!resolved) return ''
  if (resolved.incomplete) return ''
  if (resolved.allTime) return translate('anRangeAll')
  const fmt = (d) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  if (resolved.start && resolved.end) {
    return translate('anCmpDatesRange').replace('{from}', fmt(resolved.start)).replace('{to}', fmt(resolved.end))
  }
  if (resolved.start) return translate('anCmpDatesFrom').replace('{from}', fmt(resolved.start))
  if (resolved.end) return translate('anCmpDatesUntil').replace('{to}', fmt(resolved.end))
  return ''
}

/** Date courte d'un event pour la liste (« 12 oct. 2026 »), '' si absente. */
export function formatEventListDate(event, locale = 'fr') {
  const d = eventDateOf(event)
  return d ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/** Options de la liste d'événements : du plus récent au plus ancien, avec date affichée. */
export function eventPickerOptions(events, locale = 'fr') {
  return (events || [])
    .filter((e) => e && e.id)
    .map((e) => {
      const d = eventDateOf(e)
      const name = e.eventName || e.name || ''
      const date = formatEventListDate(e, locale)
      return { id: e.id, name, date, time: d ? d.getTime() : -Infinity, search: `${name} ${date}`.toLowerCase() }
    })
    .sort((a, b) => b.time - a.time || a.name.localeCompare(b.name))
}

/** Filtre local (nom + date) de la liste d'événements. */
export function searchEventOptions(options, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.search.includes(q))
}

/**
 * Peut-on lancer la comparaison ?
 * - Predict : au moins un event du principal avec scénario ;
 * - Événement : au moins un event sélectionné (et présent dans la comparaison) ;
 * - sinon : au moins un event dans la comparaison.
 */
export function canRunComparison({ kind, comparisonCount, selectedEventCount = 0, predictCoveredCount = 0 }) {
  if (kind === 'predict') return predictCoveredCount > 0
  if (kind === 'event') return selectedEventCount > 0 && comparisonCount > 0
  return comparisonCount > 0
}

/**
 * Alertes du pied de formulaire, dans l'ordre d'affichage.
 * @returns {Array<{ key: string, tone: 'warn'|'info' }>}
 */
export function comparisonAlerts({ kind, comparisonCount, selectedEventCount = 0, sameAsMain = false, canRun = true, predictChecking = false }) {
  const out = []
  if (sameAsMain) out.push({ key: 'anCmpAlertSame', tone: 'warn' })
  if (!canRun && !(kind === 'predict' && predictChecking)) {
    if (kind === 'event' && selectedEventCount === 0) out.push({ key: 'anCmpAlertPickEvent', tone: 'warn' })
    else if (kind === 'predict') out.push({ key: 'anCmpAlertNoScenario', tone: 'warn' })
    else out.push({ key: 'anCmpAlertNoEvent', tone: 'warn' })
  }
  return out
}

/** Libellé de la période du rapport principal (rappel « Rapport principal : ... »). */
export function mainPeriodLabel(mainFilters, { seasons = [], translate, locale = 'fr' }) {
  const tr = String(mainFilters?.timeRange || '')
  if (tr.startsWith('season:')) {
    const s = (seasons || []).find((x) => x.id === tr.slice('season:'.length))
    return s ? s.name : translate('anRangeAll')
  }
  if (tr === 'custom') {
    const a = parseInputDateLocal(mainFilters?.startDate)
    const b = parseInputDateLocal(mainFilters?.endDate)
    return formatResolvedPeriod({ start: a, end: b, allTime: false, incomplete: !a && !b }, { locale, translate })
      || translate('anRangeCustom')
  }
  return translate(PRESET_I18N_KEYS[tr] || 'anRangeAll')
}
