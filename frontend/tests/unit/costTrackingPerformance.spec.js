import { maxAbsPct, normalizeSearch, performanceRows, performanceTitleKey, primaryAmount } from '@/utils/costTrackingPerformance'

const r = (name, pct, extra = {}) => ({ key: name, name, variation: pct === null ? null : { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' }, ...extra })

describe('costTrackingPerformance', () => {
  const rows = [r('Beurre', -4), r('Café', 12), r('Sucre', 0), r('Thé', 3), r('Sans variation', null), r('Lait', 12)]

  it('hausses d abord : de la plus forte hausse à la plus forte baisse, sans les lignes sans variation', () => {
    expect(performanceRows(rows, 'up').map((x) => x.name)).toEqual(['Café', 'Lait', 'Thé', 'Sucre', 'Beurre'])
  })
  it('baisses d abord : ordre inverse', () => {
    expect(performanceRows(rows, 'down').map((x) => x.name)).toEqual(['Beurre', 'Sucre', 'Thé', 'Café', 'Lait'])
  })
  it('ne modifie pas le tableau d entrée', () => {
    const copy = [...rows]
    performanceRows(rows, 'down')
    expect(rows).toEqual(copy)
  })
  it('recherche insensible à la casse et aux accents', () => {
    expect(performanceRows(rows, 'up', 'CAFE').map((x) => x.name)).toEqual(['Café'])
    expect(performanceRows(rows, 'up', '  the ').map((x) => x.name)).toEqual(['Thé'])
    expect(performanceRows(rows, 'up', 'zzz')).toEqual([])
  })
  it('entrées vides', () => {
    expect(performanceRows(null)).toEqual([])
    expect(normalizeSearch(null)).toBe('')
    expect(normalizeSearch('  Été ')).toBe('ete')
  })
  it('maxAbsPct et primaryAmount', () => {
    expect(maxAbsPct(rows)).toBe(12)
    expect(maxAbsPct([])).toBeGreaterThan(0)
    expect(primaryAmount({ currentCost: 2, amount: 9 })).toBe(9)
    expect(primaryAmount({ currentCost: 2 })).toBe(2)
  })
  it('clé de titre par niveau, article par défaut', () => {
    expect(performanceTitleKey('supplier')).toBe('ctPerfTitleSupplier')
    expect(performanceTitleKey('inconnu')).toBe('ctPerfTitleArticle')
  })
})
