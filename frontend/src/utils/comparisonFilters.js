/**
 * comparisonFilters : construction pure des filtres du rapport de COMPARAISON
 * (décision 1 du SPEC), de la liste des filtres appliqués et des options
 * type / catégorie / sous-catégorie interdépendantes.
 *
 * Le rapport de comparaison part d'une COPIE des filtres du principal (PdV,
 * article, plage horaire intra-event, plages de billets, etc. toujours repris)
 * puis remplace uniquement ce que le type de comparaison remplace.
 */
import { resolveDateBounds, previousPeriodBoundsOf, yearOverYearBoundsOf } from '@/utils/analyseDateBounds'
import { buildActiveFilterChips } from '@/utils/analyseFilterChips'
import { formatDateShort } from '@/utils/dateFr'
import {
  isTemperatureFilterActive,
  DEFAULT_TEMPERATURE_RANGE,
} from '@/utils/eventDayWeatherFilters'

/** Clés de filtres « niveau event » remises à zéro quand on compare des events choisis. */
const EVENT_LEVEL_ARRAY_KEYS = [
  'selectedEventTypes', 'selectedEventCategories', 'selectedSubcategories',
  'selectedTeams', 'selectedSponsors', 'selectedSessions', 'selectedPerformerNames',
  'selectedVisitingTeams', 'selectedOpeningActs', 'selectedIntermissions',
  'selectedDoorsOpenings', 'selectedShowTimes', 'selectedDaysOfWeek', 'selectedWeather',
]

const clone = (v) => JSON.parse(JSON.stringify(v))

/** 'YYYY-MM-DD' en heure locale (format des champs date du panneau de filtres). */
function toInputDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Bornes du raccourci 'prev' / 'n1' calculées depuis les bornes du principal.
 * {start: null, end: null} si le principal est en « all » (ou sans bornes).
 */
export function shortcutPeriodBounds(mainFilters, shortcut, ctx = {}) {
  const now = ctx.now || new Date()
  const mainBounds = resolveDateBounds(mainFilters, { ...ctx, now })
  if (shortcut === 'n1') return yearOverYearBoundsOf(mainBounds)
  return previousPeriodBoundsOf(mainBounds, mainFilters.timeRange, now)
}

/** true si les raccourcis « période précédente » / « N-1 » sont disponibles (principal pas en « all »). */
export function isPeriodShortcutAvailable(mainFilters, ctx = {}) {
  const b = shortcutPeriodBounds(mainFilters, 'prev', ctx)
  return !!(b.start && b.end)
}

/**
 * Filtres complets du rapport de comparaison.
 *
 * @param {object} mainFilters  filtres du rapport principal (state.filters)
 * @param {{kind: 'period'|'category'|'event'|'predict', period?: string, from?: string, to?: string,
 *   eventTypes?: string[], categories?: string[], subcategories?: string[], eventIds?: string[],
 *   selectedDaysOfWeek?: string[], selectedDoorsOpenings?: string[], selectedShowTimes?: string[],
 *   selectedWeather?: string[], temperatureRange?: number[]}} comparison
 * @param {{seasons?: Array, isPredict?: boolean, now?: Date}} [ctx]
 *   (ctx sert aux raccourcis prev / n1 et aux saisons)
 * @returns {object} filtres (copie, le principal n'est jamais muté) ; `predict: true`
 *   pour le type Predict (l'appelant sélectionne les events qui ont un scénario)
 */
export function buildComparisonFilters(mainFilters, comparison, ctx = {}) {
  const c = comparison || {}
  const f = clone(mainFilters || {})
  // Le mode Précédent / N-1 du principal n'a pas de sens dans le rapport de comparaison.
  f.comparisonMode = null
  f.predict = false

  if (c.kind === 'period') {
    const period = c.period || 'custom'
    if (period === 'prev' || period === 'n1') {
      const b = shortcutPeriodBounds(mainFilters, period, ctx)
      // Principal en « all » : raccourci indisponible, les dates du principal sont gardées.
      if (b.start && b.end) {
        f.timeRange = 'custom'
        f.startDate = toInputDate(b.start)
        f.endDate = toInputDate(b.end)
      }
    } else if (period === 'custom') {
      f.timeRange = 'custom'
      f.startDate = c.from || null
      f.endDate = c.to || null
    } else {
      f.timeRange = period
      f.startDate = null
      f.endDate = null
    }
  } else if (c.kind === 'category') {
    f.selectedEventTypes = [...(c.eventTypes || [])]
    f.selectedEventCategories = [...(c.categories || [])]
    f.selectedSubcategories = [...(c.subcategories || [])]
  } else if (c.kind === 'event') {
    f.selectedEventIds = [...(c.eventIds || [])]
    f.timeRange = 'all'
    f.startDate = null
    f.endDate = null
    f.searchQuery = ''
    for (const k of EVENT_LEVEL_ARRAY_KEYS) f[k] = []
    f.temperatureRange = [...DEFAULT_TEMPERATURE_RANGE]
    f.ticketsSoldRange = [0, 1000000]
    f.ticketsScannedRange = [0, 1000000]
  } else if (c.kind === 'predict') {
    f.predict = true
    return f
  }

  // Champs avancés facultatifs du drawer : écrasent la dimension correspondante.
  for (const k of ['selectedDaysOfWeek', 'selectedDoorsOpenings', 'selectedShowTimes', 'selectedWeather']) {
    if (c[k]?.length) f[k] = [...c[k]]
  }
  if (isTemperatureFilterActive(c.temperatureRange)) f.temperatureRange = [...c.temperatureRange]
  return f
}

const sameValue = (a, b) => {
  const norm = (v) => (Array.isArray(v) ? [...v].sort() : v ?? null)
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

/**
 * Liste « filtres appliqués » du rapport de comparaison.
 * own = true quand la valeur diffère du principal (filtre propre à la
 * comparaison), false quand elle est reprise du principal.
 *
 * @returns {Array<{key: string, label: string, own: boolean}>}
 */
export function describeComparisonFilters(mainFilters, comparisonFilters, translate, context = {}) {
  const main = mainFilters || {}
  const cmp = comparisonFilters || {}
  const out = []
  if (cmp.predict) {
    out.push({ key: 'predict', label: translate('anPredictModeActive'), own: true })
  }
  if (cmp.selectedEventIds?.length) {
    out.push({
      key: 'selectedEventIds',
      label: `${translate('anEvents')}: ${cmp.selectedEventIds.length} ${translate('anEventsSelected')}`,
      own: !sameValue(cmp.selectedEventIds, main.selectedEventIds),
    })
  }
  // Dates en JJ/MM/AAAA comme le reste de l'application (jamais en ISO à l'écran).
  const chips = buildActiveFilterChips(cmp, translate, { formatDate: formatDateShort, ...context })
  for (const chip of chips) {
    const own = chip.key === 'timeRange'
      ? !(sameValue(cmp.timeRange, main.timeRange)
        && sameValue(cmp.startDate, main.startDate) && sameValue(cmp.endDate, main.endDate))
      : !sameValue(cmp[chip.key], main[chip.key])
    out.push({ key: chip.key, label: chip.label, own })
  }
  return out
}

const uniqSorted = (events, field) =>
  [...new Set(events.map((e) => e[field]).filter(Boolean))].sort()

/**
 * Options type / catégorie / sous-catégorie INTERDÉPENDANTES (selects à valeur
 * unique, logique de la maquette).
 *
 * @param {Array} events  events (champs eventType, category, subcategory)
 * @param {{type?: string, category?: string, subcategory?: string}} selection
 * @param {'type'|'category'|'subcategory'} [changed]  champ que l'utilisateur vient de modifier
 *   - type : retire une catégorie (et sous-catégorie) incompatible ;
 *   - category : fixe le type (si incompatible) et retire une sous-catégorie incompatible ;
 *   - subcategory : fixe sa catégorie et son type.
 * @returns {{selection: {type: string, category: string, subcategory: string},
 *   options: {types: string[], categories: string[], subcategories: string[]}}}
 */
export function cascadeEventTaxonomy(events, selection = {}, changed) {
  const evs = events || []
  let type = selection.type || ''
  let category = selection.category || ''
  let subcategory = selection.subcategory || ''
  const has = (pred) => evs.some(pred)
  const first = (pred) => evs.find(pred)

  if (changed === 'type') {
    if (type && category && !has((e) => e.eventType === type && e.category === category)) {
      category = ''
      subcategory = ''
    }
    if (type && subcategory && !has((e) => e.eventType === type && e.subcategory === subcategory)) subcategory = ''
  } else if (changed === 'category') {
    if (category) {
      if (!type || !has((e) => e.eventType === type && e.category === category)) {
        type = first((e) => e.category === category)?.eventType || ''
      }
      if (subcategory && !has((e) => e.category === category && e.subcategory === subcategory)) subcategory = ''
    } else {
      subcategory = ''
    }
  } else if (changed === 'subcategory' && subcategory) {
    const match = first((e) => e.subcategory === subcategory && (!category || e.category === category))
      || first((e) => e.subcategory === subcategory)
    if (match) {
      category = match.category || ''
      type = match.eventType || ''
    }
  }

  const byType = (e) => !type || e.eventType === type
  const byCategory = (e) => !category || e.category === category
  return {
    selection: { type, category, subcategory },
    options: {
      types: uniqSorted(evs, 'eventType'),
      categories: uniqSorted(evs.filter(byType), 'category'),
      subcategories: uniqSorted(evs.filter((e) => byType(e) && byCategory(e)), 'subcategory'),
    },
  }
}
