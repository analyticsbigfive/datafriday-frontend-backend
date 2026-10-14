/**
 * useComparisonForm + comparisonFormModel : logique du formulaire de comparaison.
 * Store Vuex minimal simulé, API predict-versions mockée. À rejouer aussi sous TZ=Europe/Paris.
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: { state: { seasons: { seasons: [] } }, getters: {}, commit: jest.fn(), dispatch: jest.fn() },
}))
jest.mock('@/api/endpoints/eventPredict.api', () => ({ listEventPredictVersions: jest.fn(), getEventIdsWithPredictVersions: jest.fn() }))

import { createApp, ref, nextTick } from 'vue'
import store from '@/store'
import { getEventIdsWithPredictVersions } from '@/api/endpoints/eventPredict.api'
import { useComparisonForm } from '@/composables/useComparisonForm'
import {
  advancedCount,
  canRunComparison,
  comparisonAlerts,
  defaultComparisonModel,
  eventPickerOptions,
  formatResolvedPeriod,
  parseInputDateLocal,
  periodOptionGroups,
  previousSeasonPeriod,
  resolveFormPeriod,
  searchEventOptions,
} from '@/utils/comparisonFormModel'

const TEXTS = { anCmpDatesRange: '{from} au {to}', anRangeAll: 'Tout l\'historique' }
const translate = (k) => TEXTS[k] || k
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
async function settle() {
  for (let i = 0; i < 6; i++) { await tick(); await nextTick() }
}
function mount(fn) {
  let out
  createApp({ setup() { out = fn(); return () => null } }).mount(document.createElement('div'))
  return out
}

const SEASONS = [
  { id: 's0', name: 'Saison 24/25', startDate: '2024-08-01', endDate: '2025-07-31' },
  { id: 's1', name: 'Saison 25/26', startDate: '2025-08-01', endDate: '2026-07-31' },
]
const ev = (id, date, extra = {}) => ({ id, name: `Match ${id}`, date, ...extra })
const EVENTS = [
  ev('e1', '2026-01-10', { eventType: 'Sport', category: 'Basket', subcategory: 'Pro A', doorsOpening: '18:00', showTime: '20:00' }),
  ev('e2', '2026-01-20', { eventType: 'Sport', category: 'Rugby', subcategory: 'Top 14', doorsOpening: '17:00', showTime: '19:00' }),
  ev('e3', '2026-02-05', { eventType: 'Concert', category: 'Pop', subcategory: 'Tournée', doorsOpening: '19:00', showTime: '21:00' }),
]
const ARRAY_KEYS = [
  'selectedEventIds', 'selectedShopIds', 'selectedShopTypes', 'selectedShopAreas', 'selectedMenuItemIds',
  'selectedMenuItemTypes', 'selectedMenuItemCategories', 'selectedEventTypes', 'selectedEventCategories',
  'selectedSubcategories', 'selectedTeams', 'selectedSponsors', 'selectedSessions', 'selectedPerformerNames',
  'selectedVisitingTeams', 'selectedOpeningActs', 'selectedIntermissions', 'selectedDoorsOpenings',
  'selectedShowTimes', 'selectedDaysOfWeek', 'selectedWeather',
]
const mainOf = (extra = {}) => ({
  ...Object.fromEntries(ARRAY_KEYS.map((k) => [k, []])),
  timeRange: 'all', startDate: null, endDate: null, searchQuery: '', selectedTimeRange: null,
  selectedConfigurationId: null, temperatureRange: [-10, 45], ...extra,
})

function build({ main = mainOf(), mainEvents = EVENTS, enabled = true } = {}) {
  store.state.seasons.seasons = SEASONS
  store.getters = {
    'analyse/analysableEvents': EVENTS,
    'analyse/filteredEvents': mainEvents,
    'analyse/uniqueDoorsOpenings': ['17:00', '18:00', '19:00'],
    'analyse/uniqueShowTimes': ['19:00', '20:00', '21:00'],
    'analyse/activeConfiguration': null,
  }
  const mainFilters = ref(main)
  const mainEventsRef = ref(mainEvents)
  const enabledRef = ref(enabled)
  const form = mount(() => useComparisonForm({
    mainFilters, mainEvents: mainEventsRef, spaceId: ref('sp'), translate, locale: 'fr', enabled: enabledRef,
  }))
  return { form, mainFilters, mainEventsRef, enabledRef }
}

beforeEach(() => {
  jest.clearAllMocks()
  getEventIdsWithPredictVersions.mockResolvedValue([])
})

describe('comparisonFormModel (pur)', () => {
  it('parseInputDateLocal : date locale à minuit, jamais UTC', () => {
    const d = parseInputDateLocal('2026-03-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0])
    expect(parseInputDateLocal('')).toBeNull()
    expect(parseInputDateLocal('01/03/2026')).toBeNull()
  })

  it('previousSeasonPeriod : saison qui précède, null sinon', () => {
    expect(previousSeasonPeriod('season:s1', SEASONS)).toBe('season:s0')
    expect(previousSeasonPeriod('season:s0', SEASONS)).toBeNull()
    expect(previousSeasonPeriod('last12months', SEASONS)).toBeNull()
  })

  it('période par défaut : saison précédente > période précédente > personnalisée', () => {
    expect(defaultComparisonModel(mainOf({ timeRange: 'season:s1' }), { seasons: SEASONS, shortcutAvailable: true }).period).toBe('season:s0')
    expect(defaultComparisonModel(mainOf({ timeRange: 'last12months' }), { seasons: SEASONS, shortcutAvailable: true }).period).toBe('prev')
    const all = defaultComparisonModel(mainOf(), { seasons: SEASONS, shortcutAvailable: false })
    expect(all.period).toBe('custom')
    expect([all.from, all.to]).toEqual(['', ''])
  })

  it('type / catégorie par défaut : ceux du principal', () => {
    const m = defaultComparisonModel(mainOf({ selectedEventTypes: ['Sport'], selectedEventCategories: ['Basket'] }))
    expect(m.eventTypes).toEqual(['Sport'])
    expect(m.categories).toEqual(['Basket'])
    expect(m.subcategories).toEqual([])
    expect(m.temperatureRange).toEqual([-10, 45])
  })

  it('options Période : raccourcis désactivés sans bornes, saisons, presets sans custom, custom en dernier', () => {
    const groups = periodOptionGroups({ translate, seasons: SEASONS, shortcutAvailable: false })
    expect(groups.map((g) => g.key)).toEqual(['shortcuts', 'seasons', 'presets', 'custom'])
    expect(groups[0].options.every((o) => o.disabled)).toBe(true)
    expect(groups[1].options.map((o) => o.value)).toEqual(['season:s0', 'season:s1'])
    expect(groups[2].options.some((o) => o.value === 'custom')).toBe(false)
    expect(periodOptionGroups({ translate, shortcutAvailable: true })[0].options.every((o) => !o.disabled)).toBe(true)
    expect(periodOptionGroups({ translate, seasons: [], shortcutAvailable: true }).map((g) => g.key)).not.toContain('seasons')
  })

  it('dates résolues : saison, personnalisée (sans décalage de fuseau), tout l\'historique', () => {
    const season = resolveFormPeriod({ period: 'season:s0' }, mainOf(), { seasons: SEASONS })
    expect(formatResolvedPeriod(season, { locale: 'fr', translate })).toContain(' au ')
    const custom = resolveFormPeriod({ period: 'custom', from: '2026-03-01', to: '2026-03-31' }, mainOf(), {})
    expect(formatResolvedPeriod(custom, { locale: 'fr', translate })).toBe('1 mars 2026 au 31 mars 2026')
    expect(formatResolvedPeriod(resolveFormPeriod({ period: 'custom', from: '', to: '' }, mainOf(), {}), { translate })).toBe('')
    expect(formatResolvedPeriod(resolveFormPeriod({ period: 'all' }, mainOf(), {}), { translate })).toBe(TEXTS.anRangeAll)
  })

  it('raccourci prev résolu depuis le principal (saison)', () => {
    const r = resolveFormPeriod({ period: 'prev' }, mainOf({ timeRange: 'season:s1' }), { seasons: SEASONS })
    expect(r.start).toBeInstanceOf(Date)
    expect(r.end.getTime()).toBeLessThan(new Date(SEASONS[1].startDate).getTime() + 86400000)
  })

  it('liste d\'événements : plus récent d\'abord, recherche locale nom + date', () => {
    const opts = eventPickerOptions(EVENTS, 'fr')
    expect(opts.map((o) => o.id)).toEqual(['e3', 'e2', 'e1'])
    expect(opts[2].date).toBe('10 janv. 2026')
    expect(searchEventOptions(opts, 'match e2').map((o) => o.id)).toEqual(['e2'])
    expect(searchEventOptions(opts, 'févr').map((o) => o.id)).toEqual(['e3'])
    expect(searchEventOptions(opts, '  ')).toHaveLength(3)
  })

  it('canRun et alertes', () => {
    expect(canRunComparison({ kind: 'period', comparisonCount: 0 })).toBe(false)
    expect(canRunComparison({ kind: 'period', comparisonCount: 2 })).toBe(true)
    expect(canRunComparison({ kind: 'event', comparisonCount: 2, selectedEventCount: 0 })).toBe(false)
    expect(canRunComparison({ kind: 'event', comparisonCount: 2, selectedEventCount: 1 })).toBe(true)
    expect(canRunComparison({ kind: 'predict', comparisonCount: 0, predictCoveredCount: 1 })).toBe(true)
    expect(comparisonAlerts({ kind: 'event', comparisonCount: 0, canRun: false }).map((a) => a.key)).toEqual(['anCmpAlertPickEvent'])
    expect(comparisonAlerts({ kind: 'period', comparisonCount: 0, canRun: false }).map((a) => a.key)).toEqual(['anCmpAlertNoEvent'])
    expect(comparisonAlerts({ kind: 'period', comparisonCount: 3, sameAsMain: true, canRun: true }).map((a) => a.key)).toEqual(['anCmpAlertSame'])
    expect(comparisonAlerts({ kind: 'predict', canRun: false, predictChecking: true })).toEqual([])
  })

  it('compteur de filtres avancés : un par dimension, température si plage active', () => {
    expect(advancedCount({ selectedDaysOfWeek: ['mon', 'tue'], selectedWeather: ['rain'], temperatureRange: [-10, 45] })).toBe(2)
    expect(advancedCount({ temperatureRange: [0, 45] })).toBe(1)
    expect(advancedCount({})).toBe(0)
  })
})

describe('useComparisonForm', () => {
  it('modèle par défaut et listes (portes, show, événements)', async () => {
    const { form } = build({ main: mainOf({ selectedEventTypes: ['Sport'] }) })
    await settle()
    expect(form.model.kind).toBe('period')
    expect(form.model.eventTypes).toEqual(['Sport'])
    expect(form.doorsOptions.value).toEqual(['17:00', '18:00', '19:00'])
    expect(form.showOptions.value).toEqual(['19:00', '20:00', '21:00'])
    expect(form.eventOptions.value.map((o) => o.id)).toEqual(['e3', 'e2', 'e1'])
    expect(form.mainCount.value).toBe(3)
  })

  it('compteurs en direct : catégorie, événement, période', async () => {
    const { form } = build({ mainEvents: [EVENTS[0]] })
    form.patch({ kind: 'category', eventTypes: ['Sport'] })
    expect(form.comparisonCount.value).toBe(2)
    form.patch({ categories: ['Rugby'] })
    expect(form.comparisonCount.value).toBe(1)
    form.patch({ kind: 'event', eventIds: [] })
    expect(form.comparisonCount.value).toBe(0)
    expect(form.canRun.value).toBe(false)
    expect(form.alerts.value.map((a) => a.key)).toEqual(['anCmpAlertPickEvent'])
    form.patch({ eventIds: ['e2', 'e3'] })
    expect(form.comparisonCount.value).toBe(2)
    expect(form.canRun.value).toBe(true)
    form.patch({ kind: 'period', period: 'custom', from: '2026-01-15', to: '2026-02-28' })
    expect(form.comparisonCount.value).toBe(2)
    form.patch({ from: '2027-01-01', to: '2027-01-31' })
    expect(form.comparisonCount.value).toBe(0)
    expect(form.alerts.value.map((a) => a.key)).toEqual(['anCmpAlertNoEvent'])
  })

  it('sameAsMain : mêmes ids que le principal, alerte, jamais en Predict', async () => {
    const sport = EVENTS.filter((e) => e.eventType === 'Sport')
    const { form } = build({ mainEvents: sport })
    form.patch({ kind: 'category', eventTypes: ['Sport'], categories: [], subcategories: [] })
    expect(form.sameAsMain.value).toBe(true)
    expect(form.alerts.value.map((a) => a.key)).toContain('anCmpAlertSame')
    form.patch({ eventTypes: ['Concert'] })
    expect(form.sameAsMain.value).toBe(false)
  })

  it('cascade type / catégorie / sous-catégorie', async () => {
    const { form } = build()
    form.changeTaxonomy('subcategory', 'Top 14')
    expect([form.model.eventTypes, form.model.categories, form.model.subcategories]).toEqual([['Sport'], ['Rugby'], ['Top 14']])
    form.changeTaxonomy('type', 'Concert')
    expect([form.model.eventTypes, form.model.categories, form.model.subcategories]).toEqual([['Concert'], [], []])
    expect(form.taxonomy.value.options.categories).toEqual(['Pop'])
    form.changeTaxonomy('type', '')
    expect(form.model.eventTypes).toEqual([])
    expect(form.taxonomy.value.options.types).toEqual(['Concert', 'Sport'])
  })

  it('Predict : vérification en cours (grisé), puis actif si au moins un scénario', async () => {
    const releases = []
    getEventIdsWithPredictVersions.mockImplementation(async () => {
      await new Promise((r) => { releases.push(r) })
      return ['e1']
    })
    const { form } = build()
    expect(form.predict.checking.value).toBe(true)
    expect(form.predict.available.value).toBe(false)
    form.setKind('predict')
    expect(form.model.kind).toBe('period')
    for (let i = 0; i < 8; i++) { releases.splice(0).forEach((r) => r()); await settle() }
    expect(form.predict.checking.value).toBe(false)
    expect(form.predict.available.value).toBe(true)
    expect(form.predict.coveredCount.value).toBe(1)
    form.setKind('predict')
    expect(form.model.kind).toBe('predict')
    expect(form.comparisonCount.value).toBe(1)
    expect(form.canRun.value).toBe(true)
    expect(form.sameAsMain.value).toBe(false)
  })

  it('Predict : une seule requête groupée, jamais re-demandée pour un event déjà examiné', async () => {
    getEventIdsWithPredictVersions.mockResolvedValue(['e1'])
    const { form } = build()
    await settle()
    expect(getEventIdsWithPredictVersions).toHaveBeenCalledTimes(1)
    expect(form.predict.available.value).toBe(true)
  })

  it('Predict : repli localStorage seulement si la requête groupée échoue', async () => {
    getEventIdsWithPredictVersions.mockRejectedValue(new Error('réseau'))
    localStorage.setItem('analyse:event-predict-versions:e1', JSON.stringify([{ id: 'v' }]))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { form } = build()
    await settle()
    expect(form.predict.available.value).toBe(true)
    localStorage.removeItem('analyse:event-predict-versions:e1')
    warn.mockRestore()
  })

  it('Predict : désactivé sans aucun scénario, canRun faux', async () => {
    const { form } = build()
    await settle()
    expect(form.predict.available.value).toBe(false)
    form.setKind('predict')
    expect(form.model.kind).toBe('period')
  })

  it('Predict : aucune requête tant que le drawer est fermé', async () => {
    const { form, enabledRef } = build({ enabled: false })
    await settle()
    expect(getEventIdsWithPredictVersions).not.toHaveBeenCalled()
    expect(form.predict.checking.value).toBe(false)
    enabledRef.value = true
    await settle()
    expect(getEventIdsWithPredictVersions).toHaveBeenCalledTimes(1)
  })

  it('reset remet les défauts du principal ; toRunModel est une copie profonde', async () => {
    const { form } = build({ main: mainOf({ timeRange: 'season:s1' }) })
    expect(form.model.period).toBe('season:s0')
    form.patch({ kind: 'event', eventIds: ['e1'], selectedWeather: ['rain'] })
    const copy = form.toRunModel()
    form.model.eventIds.push('e2')
    expect(copy.eventIds).toEqual(['e1'])
    form.reset()
    expect(form.model.kind).toBe('period')
    expect(form.model.eventIds).toEqual([])
    expect(form.model.selectedWeather).toEqual([])
    expect(form.model.period).toBe('season:s0')
  })

  it('les défauts suivent le principal tant que le brouillon est intact, plus après une saisie', async () => {
    const { form, mainFilters } = build({ main: mainOf({ timeRange: 'last12months' }) })
    expect(form.model.period).toBe('prev')
    mainFilters.value = mainOf({ timeRange: 'season:s1' })
    await settle()
    expect(form.model.period).toBe('season:s0')
    form.patch({ period: 'n1' })
    mainFilters.value = mainOf({ timeRange: 'last12months' })
    await settle()
    expect(form.model.period).toBe('n1')
  })

  it('ne modifie jamais les filtres du principal', async () => {
    const main = mainOf({ timeRange: 'last12months' })
    const before = JSON.stringify(main)
    const { form } = build({ main })
    form.patch({ kind: 'category', eventTypes: ['Sport'], selectedWeather: ['rain'] })
    form.changeTaxonomy('category', 'Rugby')
    expect(JSON.stringify(main)).toBe(before)
  })
})
