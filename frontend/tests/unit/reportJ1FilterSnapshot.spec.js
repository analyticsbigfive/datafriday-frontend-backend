import { buildFilterSnapshot, describeFilters, SNAPSHOT_KEYS } from '@/utils/reportJ1FilterSnapshot'

const T = {
  rj1FilterShop: 'PdV',
  rj1FilterBrand: 'Marque',
  anPromoYes: 'En promotion',
}
const t = (k) => T[k] || k

describe('buildFilterSnapshot', () => {
  it('garde la liste blanche, omet vides et null', () => {
    const snap = buildFilterSnapshot({
      selectedShopIds: ['Tribune Nord'],
      selectedShopTypes: [],
      selectedMenuItemCategories: ['Bières'],
      selectedConfigurationId: null,
      selectedTimeRange: { start: null, end: null },
    })
    expect(snap).toEqual({ selectedShopIds: ['Tribune Nord'], selectedMenuItemCategories: ['Bières'] })
  })
  it('exclut le périmètre événement et période', () => {
    const snap = buildFilterSnapshot({
      selectedEventIds: ['e1'],
      timeRange: 'thisyear',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      selectedDaysOfWeek: ['mon'],
      selectedWeather: ['rain'],
      temperatureRange: [0, 30],
      comparisonMode: 'previous_period',
      searchQuery: 'x',
      selectedTeams: ['A'],
      selectedBrands: ['B'],
    })
    expect(snap).toEqual({ selectedBrands: ['B'] })
    for (const k of Object.keys(snap)) expect(SNAPSHOT_KEYS).toContain(k)
  })
  it('plage horaire partielle et configuration conservées', () => {
    const snap = buildFilterSnapshot({ selectedTimeRange: { start: '18:00', end: null }, selectedConfigurationId: 'c1' })
    expect(snap).toEqual({ selectedTimeRange: { start: '18:00', end: null }, selectedConfigurationId: 'c1' })
  })
  it('copie les tableaux (pas de référence partagée)', () => {
    const src = { selectedShopIds: ['a'] }
    const snap = buildFilterSnapshot(src)
    snap.selectedShopIds.push('b')
    expect(src.selectedShopIds).toEqual(['a'])
  })
  it('entrée absente', () => {
    expect(buildFilterSnapshot(null)).toEqual({})
  })
})

describe('describeFilters', () => {
  it('résumé court lisible', () => {
    expect(describeFilters({ selectedMenuItemCategories: ['Bières'], selectedShopIds: ['Tribune Nord'] }, t)).toBe(
      'Bières, PdV Tribune Nord',
    )
  })
  it('tronque après 3 valeurs', () => {
    expect(describeFilters({ selectedBrands: ['a', 'b', 'c', 'd', 'e'] }, t)).toBe('Marque a, b, c +2')
  })
  it('promotion et plage horaire', () => {
    expect(describeFilters({ selectedPromotions: ['promo'], selectedTimeRange: { start: '18:00', end: '20:00' } }, t)).toBe(
      'En promotion, 18:00 - 20:00',
    )
  })
  it('vide', () => {
    expect(describeFilters({}, t)).toBe('')
    expect(describeFilters(null, t)).toBe('')
  })
})
