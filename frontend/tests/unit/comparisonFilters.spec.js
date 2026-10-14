import {
  buildComparisonFilters,
  describeComparisonFilters,
  cascadeEventTaxonomy,
  isPeriodShortcutAvailable,
  shortcutPeriodBounds,
} from '@/utils/comparisonFilters'

const now = new Date(2026, 9, 14, 12, 0, 0)
const ctx = { now, seasons: [{ id: 's1', name: 'Saison 25-26', startDate: '2025-08-01T00:00:00', endDate: '2026-05-31T00:00:00' }] }

function mainFilters(extra = {}) {
  return {
    selectedConfigurationId: 'cfg1', searchQuery: '', selectedEventIds: [],
    selectedShopIds: ['p1', 'p2'], selectedShopTypes: [], selectedShopAreas: [],
    selectedMenuItemIds: ['i1'], selectedMenuItemTypes: [], selectedMenuItemCategories: [],
    selectedBrands: [], selectedIndustrials: [], selectedSuppliers: [], selectedPromotions: [], selectedPromotionTypes: [],
    selectedEventCategories: ['Basket'], selectedEventTypes: ['Sport'], selectedTeams: [], selectedSponsors: [],
    selectedSubcategories: [], selectedSessions: [], selectedPerformerNames: [], selectedVisitingTeams: [], selectedOpeningActs: [],
    timeRange: 'thismonth', startDate: null, endDate: null,
    selectedDoorsOpenings: ['18:00'], selectedShowTimes: ['20:00'], selectedIntermissions: [],
    selectedDaysOfWeek: ['sat'], selectedWeather: ['rain'], temperatureRange: [5, 20],
    ticketsSoldRange: [100, 2000], ticketsScannedRange: [0, 1000000],
    selectedTimeRange: { start: '19:00', end: '22:00' }, comparisonMode: 'previous_period',
    ...extra,
  }
}

describe('buildComparisonFilters', () => {
  it('ne mute jamais les filtres du principal', () => {
    const m = mainFilters()
    const snapshot = JSON.stringify(m)
    buildComparisonFilters(m, { kind: 'event', eventIds: ['e1'] }, ctx)
    buildComparisonFilters(m, { kind: 'category', categories: ['Concert'] }, ctx)
    expect(JSON.stringify(m)).toBe(snapshot)
  })

  describe('period', () => {
    it('preset : remplace timeRange, garde le reste (PdV, avancés, plage horaire)', () => {
      const f = buildComparisonFilters(mainFilters(), { kind: 'period', period: 'lastyear' }, ctx)
      expect(f.timeRange).toBe('lastyear')
      expect(f.startDate).toBeNull()
      expect(f.selectedShopIds).toEqual(['p1', 'p2'])
      expect(f.selectedMenuItemIds).toEqual(['i1'])
      expect(f.selectedEventTypes).toEqual(['Sport'])
      expect(f.selectedDaysOfWeek).toEqual(['sat'])
      expect(f.temperatureRange).toEqual([5, 20])
      expect(f.selectedTimeRange).toEqual({ start: '19:00', end: '22:00' })
      expect(f.ticketsSoldRange).toEqual([100, 2000])
      expect(f.comparisonMode).toBeNull()
      expect(f.predict).toBe(false)
    })
    it('saison : timeRange season:<id>', () => {
      expect(buildComparisonFilters(mainFilters(), { kind: 'period', period: 'season:s1' }, ctx).timeRange).toBe('season:s1')
    })
    it('custom : dates saisies', () => {
      const f = buildComparisonFilters(mainFilters(), { kind: 'period', period: 'custom', from: '2025-01-01', to: '2025-03-31' }, ctx)
      expect([f.timeRange, f.startDate, f.endDate]).toEqual(['custom', '2025-01-01', '2025-03-31'])
    })
    it('prev : période précédente du principal (thismonth -> septembre)', () => {
      const f = buildComparisonFilters(mainFilters(), { kind: 'period', period: 'prev' }, ctx)
      expect([f.timeRange, f.startDate, f.endDate]).toEqual(['custom', '2026-09-01', '2026-09-30'])
    })
    it('n1 : mêmes bornes un an plus tôt', () => {
      const f = buildComparisonFilters(mainFilters(), { kind: 'period', period: 'n1' }, ctx)
      expect([f.timeRange, f.startDate, f.endDate]).toEqual(['custom', '2025-10-01', '2025-10-14'])
    })
    it('principal en all : raccourcis indisponibles, dates du principal gardées', () => {
      const m = mainFilters({ timeRange: 'all' })
      expect(isPeriodShortcutAvailable(m, ctx)).toBe(false)
      expect(shortcutPeriodBounds(m, 'n1', ctx)).toEqual({ start: null, end: null })
      expect(buildComparisonFilters(m, { kind: 'period', period: 'prev' }, ctx).timeRange).toBe('all')
      expect(isPeriodShortcutAvailable(mainFilters(), ctx)).toBe(true)
    })
  })

  it('category : remplace type / catégorie / sous-catégorie, garde les dates', () => {
    const f = buildComparisonFilters(mainFilters(), {
      kind: 'category', eventTypes: ['Spectacle'], categories: ['Concert'], subcategories: [],
    }, ctx)
    expect(f.selectedEventTypes).toEqual(['Spectacle'])
    expect(f.selectedEventCategories).toEqual(['Concert'])
    expect(f.selectedSubcategories).toEqual([])
    expect(f.timeRange).toBe('thismonth')
    expect(f.selectedShopIds).toEqual(['p1', 'p2'])
  })

  it('event : sélection d events, remet à zéro dates, types et avancés, garde PdV / article / plage horaire', () => {
    const f = buildComparisonFilters(mainFilters(), { kind: 'event', eventIds: ['e1', 'e2'] }, ctx)
    expect(f.selectedEventIds).toEqual(['e1', 'e2'])
    expect(f.timeRange).toBe('all')
    expect(f.selectedEventTypes).toEqual([])
    expect(f.selectedEventCategories).toEqual([])
    expect(f.selectedDaysOfWeek).toEqual([])
    expect(f.selectedWeather).toEqual([])
    expect(f.selectedDoorsOpenings).toEqual([])
    expect(f.selectedShowTimes).toEqual([])
    expect(f.temperatureRange).toEqual([-10, 45])
    expect(f.ticketsSoldRange).toEqual([0, 1000000])
    expect(f.selectedShopIds).toEqual(['p1', 'p2'])
    expect(f.selectedMenuItemIds).toEqual(['i1'])
    expect(f.selectedTimeRange).toEqual({ start: '19:00', end: '22:00' })
  })

  it('predict : garde tous les filtres du principal et pose predict:true', () => {
    const f = buildComparisonFilters(mainFilters(), { kind: 'predict', selectedWeather: ['snow'] }, ctx)
    expect(f.predict).toBe(true)
    expect(f.timeRange).toBe('thismonth')
    expect(f.selectedWeather).toEqual(['rain']) // champs avancés ignorés en predict
    expect(f.selectedShopIds).toEqual(['p1', 'p2'])
  })

  describe('champs avancés du drawer', () => {
    it('non vides : écrasent la dimension correspondante', () => {
      const f = buildComparisonFilters(mainFilters(), {
        kind: 'period', period: 'lastyear',
        selectedDaysOfWeek: ['fri'], selectedDoorsOpenings: ['19:00'], selectedShowTimes: ['21:00'],
        selectedWeather: ['clear'], temperatureRange: [15, 30],
      }, ctx)
      expect(f.selectedDaysOfWeek).toEqual(['fri'])
      expect(f.selectedDoorsOpenings).toEqual(['19:00'])
      expect(f.selectedShowTimes).toEqual(['21:00'])
      expect(f.selectedWeather).toEqual(['clear'])
      expect(f.temperatureRange).toEqual([15, 30])
    })
    it('vides ou plage par défaut : le principal est repris', () => {
      const f = buildComparisonFilters(mainFilters(), {
        kind: 'period', period: 'lastyear', selectedDaysOfWeek: [], temperatureRange: [-10, 45],
      }, ctx)
      expect(f.selectedDaysOfWeek).toEqual(['sat'])
      expect(f.temperatureRange).toEqual([5, 20])
    })
    it('avec le type event : posés après la remise à zéro', () => {
      const f = buildComparisonFilters(mainFilters(), { kind: 'event', eventIds: ['e1'], selectedWeather: ['snow'] }, ctx)
      expect(f.selectedWeather).toEqual(['snow'])
      expect(f.selectedDaysOfWeek).toEqual([])
    })
  })
})

describe('describeComparisonFilters', () => {
  const T = (k) => k
  it('dates personnalisées affichées en JJ/MM/AAAA, jamais en ISO', () => {
    const m = mainFilters()
    const c = buildComparisonFilters(m, { kind: 'period', period: 'custom', from: '2025-01-01', to: '2025-10-14' }, ctx)
    const range = describeComparisonFilters(m, c, T, {}).find((x) => x.key === 'timeRange')
    expect(range.label).toBe('anChipDates : 01/01/2025 → 14/10/2025')
    const open = buildComparisonFilters(m, { kind: 'period', period: 'custom', from: '2025-01-01', to: '' }, ctx)
    expect(describeComparisonFilters(m, open, T, {}).find((x) => x.key === 'timeRange').label).toBe('anChipDates : 01/01/2025 → —')
  })

  it('own = valeur propre à la comparaison, sinon reprise du principal', () => {
    const m = mainFilters()
    const c = buildComparisonFilters(m, { kind: 'period', period: 'lastyear', selectedDaysOfWeek: ['fri'] }, ctx)
    const list = describeComparisonFilters(m, c, T, { defaultTimeRange: 'last12months' })
    const by = Object.fromEntries(list.map((x) => [x.key, x]))
    expect(by.timeRange.own).toBe(true)
    expect(by.selectedDaysOfWeek.own).toBe(true)
    expect(by.selectedWeather.own).toBe(false)
    expect(by.selectedShopIds.own).toBe(false)
    expect(by.selectedEventTypes.own).toBe(false)
    expect(by.temperatureRange.own).toBe(false)
  })
  it('predict : ligne dédiée propre à la comparaison', () => {
    const m = mainFilters()
    const list = describeComparisonFilters(m, buildComparisonFilters(m, { kind: 'predict' }, ctx), T, {})
    expect(list[0]).toEqual({ key: 'predict', label: 'anPredictModeActive', own: true })
  })
  it('event : ligne du nombre d events', () => {
    const m = mainFilters()
    const list = describeComparisonFilters(m, buildComparisonFilters(m, { kind: 'event', eventIds: ['a', 'b'] }, ctx), T, {})
    expect(list[0]).toEqual({ key: 'selectedEventIds', label: 'anEvents: 2 anEventsSelected', own: true })
  })
})

describe('cascadeEventTaxonomy', () => {
  const events = [
    { eventType: 'Sport', category: 'Basket', subcategory: 'Betclic Elite' },
    { eventType: 'Sport', category: 'Basket', subcategory: 'Coupe' },
    { eventType: 'Sport', category: 'Rugby', subcategory: 'Top 14' },
    { eventType: 'Spectacle', category: 'Concert', subcategory: 'Pop' },
  ]
  it('sans sélection : toutes les options', () => {
    const r = cascadeEventTaxonomy(events, {})
    expect(r.options.types).toEqual(['Spectacle', 'Sport'])
    expect(r.options.categories).toEqual(['Basket', 'Concert', 'Rugby'])
    expect(r.options.subcategories).toEqual(['Betclic Elite', 'Coupe', 'Pop', 'Top 14'])
  })
  it('choisir un type restreint les catégories', () => {
    const r = cascadeEventTaxonomy(events, { type: 'Sport' }, 'type')
    expect(r.options.categories).toEqual(['Basket', 'Rugby'])
    expect(r.options.subcategories).toEqual(['Betclic Elite', 'Coupe', 'Top 14'])
  })
  it('choisir un type retire une catégorie et sous-catégorie incompatibles', () => {
    const r = cascadeEventTaxonomy(events, { type: 'Spectacle', category: 'Basket', subcategory: 'Coupe' }, 'type')
    expect(r.selection).toEqual({ type: 'Spectacle', category: '', subcategory: '' })
  })
  it('choisir une catégorie fixe son type et restreint les sous-catégories', () => {
    const r = cascadeEventTaxonomy(events, { category: 'Concert' }, 'category')
    expect(r.selection.type).toBe('Spectacle')
    expect(r.options.subcategories).toEqual(['Pop'])
  })
  it('choisir une catégorie retire une sous-catégorie incompatible', () => {
    const r = cascadeEventTaxonomy(events, { type: 'Sport', category: 'Rugby', subcategory: 'Coupe' }, 'category')
    expect(r.selection).toEqual({ type: 'Sport', category: 'Rugby', subcategory: '' })
  })
  it('vider la catégorie vide aussi la sous-catégorie', () => {
    const r = cascadeEventTaxonomy(events, { type: 'Sport', category: '', subcategory: 'Coupe' }, 'category')
    expect(r.selection.subcategory).toBe('')
  })
  it('choisir une sous-catégorie fixe sa catégorie et son type', () => {
    const r = cascadeEventTaxonomy(events, { subcategory: 'Pop' }, 'subcategory')
    expect(r.selection).toEqual({ type: 'Spectacle', category: 'Concert', subcategory: 'Pop' })
  })
})
