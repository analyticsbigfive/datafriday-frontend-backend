import { filterStoredItems, rowsForConfig, rowsForConfigs } from '@/utils/storageStoredFilter'

const names = (l) => l.map((i) => i.name)
const items = [{ name: 'Coca' }, { name: 'Bière' }, { name: 'Eau' }]

describe('filterStoredItems', () => {
  it('garde un article coché', () => {
    expect(names(filterStoredItems(items, [{ name: 'Coca', isStored: true }]))).toEqual(['Coca'])
  })
  it('exclut un article décoché même avec quantité', () => {
    expect(filterStoredItems(items, [{ name: 'Coca', isStored: false, quantity: 10 }])).toEqual([])
  })
  it('historique avec quantité, seuil : gardé', () => {
    const rows = [{ name: 'Coca', quantity: 5 }, { name: 'Eau', minStock: 2 }]
    expect(names(filterStoredItems(items, rows))).toEqual(['Coca', 'Eau'])
  })
  it('historique vide : exclu', () => {
    expect(filterStoredItems(items, [{ name: 'Coca', quantity: 0, isStored: null }])).toEqual([])
  })
  it('article sans ligne : exclu', () => {
    expect(names(filterStoredItems(items, [{ name: 'Eau', isStored: true }]))).toEqual(['Eau'])
  })
  it('nom avec casse et espaces différents', () => {
    expect(names(filterStoredItems(items, [{ name: '  bière ', isStored: true }]))).toEqual(['Bière'])
  })
  it('lignes non chargées : pas de filtre', () => {
    expect(filterStoredItems(items, null)).toEqual(items)
    expect(filterStoredItems(items, undefined)).toEqual(items)
  })
  it('lignes chargées mais vides : tout exclu', () => {
    expect(filterStoredItems(items, [])).toEqual([])
  })
})

describe('rowsForConfig / rowsForConfigs', () => {
  const by = { a: [{ name: 'x' }], b: [{ name: 'y' }], '': [{ name: 'z' }] }
  it('config puis repli clé vide', () => {
    expect(rowsForConfig(by, 'a')).toEqual([{ name: 'x' }])
    expect(rowsForConfig(by, 'zz')).toEqual([{ name: 'z' }])
  })
  it('union sur plusieurs configs', () => {
    expect(rowsForConfigs(by, ['a', 'b']).map((r) => r.name)).toEqual(['x', 'y'])
    expect(rowsForConfigs(by, []).map((r) => r.name)).toEqual(['x', 'y', 'z'])
  })
})
