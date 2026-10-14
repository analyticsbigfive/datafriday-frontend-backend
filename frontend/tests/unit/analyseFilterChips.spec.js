import { buildActiveFilterChips } from '@/utils/analyseFilterChips'

// Traduction factice : renvoie la clé, pour tester la structure des puces.
const T = (k) => k

function baseFilters(extra = {}) {
  return {
    selectedConfigurationId: null,
    selectedShopIds: [], selectedShopTypes: [], selectedShopAreas: [],
    selectedMenuItemTypes: [], selectedMenuItemCategories: [],
    selectedBrands: [], selectedIndustrials: [], selectedSuppliers: [],
    selectedPromotions: [], selectedPromotionTypes: [],
    selectedEventCategories: [], selectedEventTypes: [], selectedTeams: [], selectedSponsors: [],
    selectedSubcategories: [], selectedSessions: [], selectedDoorsOpenings: [], selectedShowTimes: [],
    selectedDaysOfWeek: [], selectedWeather: [], temperatureRange: [-10, 45],
    selectedPerformerNames: [], selectedVisitingTeams: [], selectedOpeningActs: [], selectedIntermissions: [],
    timeRange: 'last12months', startDate: null, endDate: null,
    selectedTimeRange: { start: null, end: null },
    ...extra,
  }
}
const ctx = { defaultTimeRange: 'last12months', seasons: [{ id: 's1', name: 'Saison 25-26' }] }
const keys = (c) => c.map((x) => x.key)

describe('buildActiveFilterChips', () => {
  it('aucun filtre actif : aucune puce', () => {
    expect(buildActiveFilterChips(baseFilters(), T, ctx)).toEqual([])
  })
  it('puces de dimensions', () => {
    const c = buildActiveFilterChips(baseFilters({
      selectedShopIds: ['s1', 's2'], selectedEventTypes: ['Sport'], selectedBrands: ['Coca'],
      selectedIntermissions: ['yes'],
    }), T, ctx)
    expect(keys(c)).toEqual(['selectedShopIds', 'selectedBrands', 'selectedEventTypes', 'selectedIntermissions'])
    expect(c[0].label).toBe('2 anShops')
    expect(c[2].label).toBe('anEventType: Sport')
    expect(c[3].label).toBe('anIntermission: anYes')
  })
  it('puce configuration seulement si la config existe', () => {
    const f = baseFilters({ selectedConfigurationId: 'c1' })
    expect(buildActiveFilterChips(f, T, ctx)).toEqual([])
    const c = buildActiveFilterChips(f, T, { ...ctx, activeConfiguration: { name: 'Match' } })
    expect(c[0]).toEqual({ key: 'selectedConfigurationId', label: 'anConfiguration: Match', clearValue: null })
  })
  it('jour, météo, température (clearValue = défaut)', () => {
    const c = buildActiveFilterChips(baseFilters({
      selectedDaysOfWeek: ['sat'], selectedWeather: ['rain'], temperatureRange: [10, 25],
    }), T, ctx)
    expect(c.map((x) => x.label)).toEqual([
      'anDaysOfWeek: anDaySat', 'anWeatherShort: anWeatherRain', 'anTempShort: 10 anTempTo 25 °C',
    ])
    expect(c[2].clearValue).toEqual([-10, 45])
  })
  it('période : saison nommée, custom avec dates, preset par défaut sans puce', () => {
    const s = buildActiveFilterChips(baseFilters({ timeRange: 'season:s1' }), T, ctx)
    expect(s[0]).toEqual({ key: 'timeRange', label: 'anPeriod : Saison 25-26', clearValue: 'last12months' })
    const c = buildActiveFilterChips(baseFilters({ timeRange: 'custom', startDate: '2026-01-01' }), T, ctx)
    expect(c[0].label).toBe('anChipDates : 2026-01-01 → —')
  })
  it('plage horaire intra-event', () => {
    const c = buildActiveFilterChips(baseFilters({ selectedTimeRange: { start: '18:00', end: null } }), T, ctx)
    expect(c[0]).toEqual({ key: 'selectedTimeRange', label: 'anChipTimeRange : 18:00 → —', clearValue: { start: null, end: null } })
  })
})
