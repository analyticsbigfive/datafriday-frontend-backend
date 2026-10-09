import { splitGroupRows, groupDepositGroupsByShop, filterGroupsBySearch } from '@/utils/ventilationViews'

const row = (shopId, shopName, quantity, over = {}) => ({ rowKey: `${shopId}-r`, elementType: 'shop', shopId, shopName, quantity, packs: null, ...over })
const group = (itemName, rows) => ({ itemKey: itemName, itemName, unit: 'Pc', packagingType: 'Carton', unitsPerPack: 30, rows })
const storages = [{ id: 'd2', name: 'Dépôt 2' }, { id: 'd1', name: 'Dépôt 1' }]

describe('splitGroupRows', () => {
  it('sépare PDV et stockages, liste tous les stockages même sans rien à déposer', () => {
    const g = group('Bonbons', [row('s1', 'Océane 11', 60), row('d2', 'Dépôt 2', 90, { elementType: 'storage' })])
    const out = splitGroupRows(g, storages)
    expect(out.shops.map((r) => r.shopName)).toEqual(['Océane 11'])
    expect(out.storages.map((r) => [r.shopName, r.quantity, r.rowKey])).toEqual([
      ['Dépôt 1', 0, null],
      ['Dépôt 2', 90, 'd2-r'],
    ])
  })

  it('garde un stockage de la feuille absent du périmètre', () => {
    const g = group('Bonbons', [row('x', 'Réserve hors config', 10, { elementType: 'storage' })])
    expect(splitGroupRows(g, storages).storages.map((r) => r.shopName)).toEqual(['Dépôt 1', 'Dépôt 2', 'Réserve hors config'])
  })
})

describe('groupDepositGroupsByShop', () => {
  it('une carte par PDV avec ses articles, puis chaque stockage avec tous les articles', () => {
    const groups = [
      group('Chips', [row('s1', 'Océane 11', 10)]),
      group('Bonbons', [row('s1', 'Océane 11', 60), row('s2', 'Loire 14', 30)]),
    ]
    const out = groupDepositGroupsByShop(groups, storages)
    expect(out.shops.map((c) => [c.shopName, c.items.map((i) => i.itemName)])).toEqual([
      ['Loire 14', ['Bonbons']],
      ['Océane 11', ['Bonbons', 'Chips']],
    ])
    expect(out.storages.map((c) => [c.shopName, c.items.map((i) => `${i.itemName}:${i.row.quantity}`)])).toEqual([
      ['Dépôt 1', ['Bonbons:0', 'Chips:0']],
      ['Dépôt 2', ['Bonbons:0', 'Chips:0']],
    ])
    expect(out.shops[1].items[0]).toMatchObject({ unit: 'Pc', packagingType: 'Carton', unitsPerPack: 30 })
  })
})

describe('filterGroupsBySearch', () => {
  const groups = [group('Bonbons', [row('s1', 'Océane 11', 60)]), group('Chips', [row('s2', 'Loire 14', 10)])]
  it('cherche dans le nom d’article et de destination, sans accents', () => {
    expect(filterGroupsBySearch(groups, 'chip').map((g) => g.itemName)).toEqual(['Chips'])
    expect(filterGroupsBySearch(groups, 'oceane').map((g) => g.itemName)).toEqual(['Bonbons'])
    expect(filterGroupsBySearch(groups, '')).toHaveLength(2)
  })
})
