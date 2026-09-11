import {
  restrictKeysToPerimeter,
  sumPerimeterExclusions,
  buildCatalogNameById,
} from '@/utils/reconciliationPerimeter'

describe('restrictKeysToPerimeter (BUG-378-02)', () => {
  it('garde les clés des PdV comptés, écarte et compte les autres (unités en valeur absolue)', () => {
    const { kept, excludedLines, excludedUnits } = restrictKeysToPerimeter(
      { 'el1|a': 3, 'el2|a': -4, 'el3|b': 2.5, '|x': 1 },
      new Set(['el1']),
    )
    expect(kept).toEqual({ 'el1|a': 3 })
    expect(excludedLines).toBe(3)
    expect(excludedUnits).toBe(7.5)
  })

  it('source absente (null) reste null : ne fabrique pas un index vide', () => {
    expect(restrictKeysToPerimeter(null, new Set(['el1']))).toEqual({
      kept: null,
      excludedLines: 0,
      excludedUnits: 0,
    })
  })
})

describe('sumPerimeterExclusions', () => {
  it('cumule plusieurs sources, null quand rien n’a été écarté', () => {
    expect(
      sumPerimeterExclusions({ excludedLines: 2, excludedUnits: 1.5 }, { excludedLines: 1, excludedUnits: 0.25 }),
    ).toEqual({ lines: 3, units: 1.75 })
    expect(sumPerimeterExclusions({ excludedLines: 0, excludedUnits: 0 }, null)).toBeNull()
  })
})

describe('buildCatalogNameById', () => {
  it('nomme par id depuis les trois référentiels, menu item prioritaire sur une collision', () => {
    const names = buildCatalogNameById({
      menuItems: [{ id: 'mi-1', name: 'Coca 33cl' }, { id: 'dup', name: 'Menu item' }],
      marketPrices: [{ id: 'mp-1', itemName: 'Fût 30L' }, { id: 'dup', itemName: 'Market price' }],
      components: [{ id: 'c-1', name: 'Sauce maison' }],
    })
    expect(names).toEqual({
      'mi-1': 'Coca 33cl',
      'mp-1': 'Fût 30L',
      'c-1': 'Sauce maison',
      dup: 'Menu item',
    })
  })

  it('tolère les entrées sans id ou sans nom', () => {
    expect(buildCatalogNameById({ menuItems: [{ id: null, name: 'x' }, { id: 'a' }], marketPrices: null })).toEqual({})
  })
})
