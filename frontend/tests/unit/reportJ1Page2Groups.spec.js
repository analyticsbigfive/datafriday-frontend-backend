import { groupSlotsByFilters, buildGroupFilters } from '@/utils/reportJ1Page2Groups'

const slot = (id, filters) => ({ id, kind: 'donut', variant: 'shop', filters })

describe('groupSlotsByFilters', () => {
  it('regroupe les slots aux filtres identiques, quel que soit l ordre des clés', () => {
    const groups = groupSlotsByFilters([
      slot('a', { selectedShopIds: ['x'], selectedMenuItemCategories: ['Beer'] }),
      slot('b', { selectedMenuItemCategories: ['Beer'], selectedShopIds: ['x'] }),
      slot('c', {}),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].slots.map((s) => s.id)).toEqual(['a', 'b'])
    expect(groups[1].filters).toEqual({})
  })

  it('distingue des tableaux différents et gère une liste vide', () => {
    const groups = groupSlotsByFilters([slot('a', { selectedShopIds: ['x'] }), slot('b', { selectedShopIds: ['y'] })])
    expect(groups).toHaveLength(2)
    expect(groupSlotsByFilters([])).toEqual([])
    expect(groupSlotsByFilters(undefined)).toEqual([])
  })
})

describe('buildGroupFilters', () => {
  it('fusionne défauts, snapshot et event J+1', () => {
    const f = buildGroupFilters({ selectedShopIds: ['x'], selectedEventIds: ['autre'] }, 'ev1')
    expect(f.selectedShopIds).toEqual(['x'])
    expect(f.selectedEventIds).toEqual(['ev1'])
    expect(f).toHaveProperty('selectedMenuItemCategories')
  })
})
