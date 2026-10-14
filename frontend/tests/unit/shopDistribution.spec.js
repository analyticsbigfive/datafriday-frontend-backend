import { buildShopDistributionGroups, buildShopDistributionEntries, shopTypeLabel, shopDistributionMetric } from '@/utils/shopDistribution'
import { buildReportSnapshot } from '@/utils/comparisonReportSnapshot'

const RECORDS = [
  { shopName: 'Buvette', shopType: 'food', shopArea: 'Nord', revenue: 100, quantity: 10 },
  { shopName: 'Buvette', shopType: 'food', shopArea: 'Nord', revenue: 50, quantity: 5 },
  { shopName: 'Grill', shopType: 'beverages', shopArea: 'Sud', revenue: 200, quantity: 4 },
  { shopName: 'Sans zone', shopType: 'food', shopArea: '', revenue: 10, quantity: 1 },
]

describe('shopDistribution', () => {
  it('regroupe par PdV, type et zone, tri décroissant, clés vides ignorées', () => {
    const g = buildShopDistributionGroups(RECORDS, 'revenue')
    expect(g.shop.keys).toEqual(['Grill', 'Buvette', 'Sans zone'])
    expect(g.shop.values).toEqual([200, 150, 10])
    expect(g.type.keys).toEqual(['beverages', 'food'])
    expect(g.type.values).toEqual([200, 160])
    expect(g.area.keys).toEqual(['Sud', 'Nord'])
  })

  it('mode quantité', () => {
    expect(shopDistributionMetric('quantity')(RECORDS[0])).toBe(10)
    expect(buildShopDistributionGroups(RECORDS, 'quantity').shop.values).toEqual([15, 4, 1])
  })

  it('habillage : palette, couleurs de type, libellé de type', () => {
    const g = buildShopDistributionGroups(RECORDS, 'revenue', {
      palette: ['#111', '#222', '#333'], typeColors: { food: '#f00' }, typeLabel: (k) => `L:${k}`,
    })
    expect(g.shop.colors).toEqual(['#111', '#222', '#333'])
    expect(g.type.colors[1]).toBe('#f00')
    expect(g.type.labels).toEqual(['L:beverages', 'L:food'])
  })

  it('entrées [{ key, value }] identiques aux groupes', () => {
    const e = buildShopDistributionEntries(RECORDS, 'revenue')
    expect(e.shop[0]).toEqual({ key: 'Grill', value: 200 })
    expect(e.area).toEqual([{ key: 'Sud', value: 200 }, { key: 'Nord', value: 150 }])
    expect(buildShopDistributionEntries(null, 'revenue')).toEqual({ shop: [], type: [], area: [] })
  })

  it('libellé de type : composite joint par « & », inconnu conservé', () => {
    const t = (k) => `T:${k}`
    expect(shopTypeLabel('', t)).toBe('')
    expect(shopTypeLabel('zzz, yyy', t)).toBe('zzz & yyy')
  })

  it('le snapshot embarque la répartition calculée depuis les chartRecords', () => {
    const snap = buildReportSnapshot({ chips: {}, widgets: {}, chartRecords: RECORDS, articleRecords: [] })
    expect(snap.shopDistribution.revenue.shop[0]).toEqual({ key: 'Grill', value: 200 })
    expect(snap.shopDistribution.quantity.shop[0]).toEqual({ key: 'Buvette', value: 15 })
  })
})
