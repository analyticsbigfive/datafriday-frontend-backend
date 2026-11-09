import {
  WIDGET_TOTAL, WIDGET_COUNTED, WIDGET_TO_COUNT, WIDGET_SHOPS_TO_COUNT,
  nextWidget, nextShopId, toggleName, filterInventoryRows, widgetCounts,
  incompleteShopIds, selectionTotalCost, shopPassesWidget, normalizeWidget,
} from '@/utils/inventoryFilters'

const shop = (shopId, units, cost, isCounted) => ({
  shopId, shopName: `S${shopId}`, packedUnits: 0, looseUnits: units, totalUnits: units, cost, isCounted,
})
const row = (itemName, shops) => ({
  itemName,
  shops,
  totalUnits: shops.reduce((a, s) => a + s.totalUnits, 0),
  costValue: null,
  isCounted: shops.every((s) => s.isCounted),
})

// A : S1 compté, S2 non compté  -> non compté
// B : S1 compté                 -> compté
// C : S2 compté, S3 compté      -> compté
// D : S3 non compté             -> non compté
const rows = () => [
  row('A', [shop(1, 2, 4, true), shop(2, 3, 6, false)]),
  row('B', [shop(1, 5, 10, true)]),
  row('C', [shop(2, 1, 2, true), shop(3, 1, 2, true)]),
  row('D', [shop(3, 4, 8, false)]),
]
const names = (r) => r.map((x) => x.itemName)

describe('inventoryFilters', () => {
  it('nextWidget : reclic sur le widget actif revient à Total', () => {
    expect(nextWidget(WIDGET_TOTAL, WIDGET_COUNTED)).toBe(WIDGET_COUNTED)
    expect(nextWidget(WIDGET_COUNTED, WIDGET_COUNTED)).toBe(WIDGET_TOTAL)
    expect(nextWidget(WIDGET_COUNTED, WIDGET_TO_COUNT)).toBe(WIDGET_TO_COUNT)
    expect(nextWidget(WIDGET_TO_COUNT, WIDGET_TOTAL)).toBe(WIDGET_TOTAL)
    expect(normalizeWidget('inconnu')).toBe(WIDGET_TOTAL)
  })

  it('nextShopId et toggleName : bascule', () => {
    expect(nextShopId(null, 2)).toBe(2)
    expect(nextShopId(2, 2)).toBe(null)
    expect(nextShopId('2', 2)).toBe(null)
    expect(nextShopId(1, 2)).toBe(2)
    expect(toggleName([], 'A')).toEqual(['A'])
    expect(toggleName(['A', 'B'], 'A')).toEqual(['B'])
  })

  it('Total : tout, sans copie modifiée', () => {
    const { visible } = filterInventoryRows(rows(), { widget: WIDGET_TOTAL })
    expect(names(visible)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('Comptés / Articles à compter', () => {
    expect(names(filterInventoryRows(rows(), { widget: WIDGET_COUNTED }).visible)).toEqual(['B', 'C'])
    expect(names(filterInventoryRows(rows(), { widget: WIDGET_TO_COUNT }).visible)).toEqual(['A', 'D'])
  })

  it('PdV à compter : PdV non terminés, articles restant à compter seulement', () => {
    const { visible, incomplete } = filterInventoryRows(rows(), { widget: WIDGET_SHOPS_TO_COUNT })
    expect([...incomplete].sort()).toEqual(['2', '3'])
    expect(names(visible)).toEqual(['A', 'D'])
    expect(visible[0].shops.map((s) => s.shopId)).toEqual([2])
    expect(visible[0].totalUnits).toBe(3)
  })

  it('filtre PdV : articles du PdV, totaux et statut recalculés', () => {
    const { visible, scoped } = filterInventoryRows(rows(), { shopId: 1 })
    expect(names(visible)).toEqual(['A', 'B'])
    expect(scoped[0].totalUnits).toBe(2)
    expect(scoped[0].costValue).toBe(4)
    // A est compté dans S1 : devenu « compté » dans ce périmètre.
    expect(scoped[0].isCounted).toBe(true)
    expect(scoped[0].totalShopCount).toBe(1)
  })

  it('ET : widget et PdV se cumulent', () => {
    expect(names(filterInventoryRows(rows(), { shopId: 2, widget: WIDGET_TO_COUNT }).visible)).toEqual(['A'])
    expect(names(filterInventoryRows(rows(), { shopId: 3, widget: WIDGET_COUNTED }).visible)).toEqual(['C'])
    expect(names(filterInventoryRows(rows(), { shopId: 1, widget: WIDGET_TO_COUNT }).visible)).toEqual([])
    // PdV terminé + widget « PdV à compter » : rien.
    expect(names(filterInventoryRows(rows(), { shopId: 1, widget: WIDGET_SHOPS_TO_COUNT }).visible)).toEqual([])
  })

  it('PdV inconnu : liste vide', () => {
    expect(filterInventoryRows(rows(), { shopId: 99 }).visible).toEqual([])
  })

  it('widgetCounts suit le périmètre PdV', () => {
    expect(widgetCounts(rows())).toEqual({ total: 4, counted: 2, toCount: 2, shopsToCount: 2 })
    const { scoped } = filterInventoryRows(rows(), { shopId: 3 })
    expect(widgetCounts(scoped)).toEqual({ total: 2, counted: 1, toCount: 1, shopsToCount: 1 })
  })

  it('incompleteShopIds', () => {
    expect([...incompleteShopIds(rows())].sort()).toEqual(['2', '3'])
    expect(incompleteShopIds([]).size).toBe(0)
  })

  it('lignes figées (snapshot) : jamais filtrées', () => {
    const snap = [{ itemName: 'X', snapshot: true, shops: [{ shopName: 'S', totalUnits: 1 }], isCounted: true }]
    expect(filterInventoryRows(snap, { widget: WIDGET_TO_COUNT, shopId: 1 }).visible).toBe(snap)
  })

  it('selectionTotalCost : sélection, sinon tout, ignore les noms absents', () => {
    const r = [
      { itemName: 'A', costValue: 10 },
      { itemName: 'B', costValue: 5 },
      { itemName: 'C', costValue: null },
    ]
    expect(selectionTotalCost(r, [])).toBe(15)
    expect(selectionTotalCost(r, ['A'])).toBe(10)
    expect(selectionTotalCost(r, ['A', 'B'])).toBe(15)
    expect(selectionTotalCost(r, ['Z'])).toBe(15)
    expect(selectionTotalCost(r, ['C'])).toBe(null)
  })

  it('shopPassesWidget : seul « PdV à compter » masque les PdV terminés', () => {
    expect(shopPassesWidget('counted', WIDGET_TOTAL)).toBe(true)
    expect(shopPassesWidget('counted', WIDGET_COUNTED)).toBe(true)
    expect(shopPassesWidget('counted', WIDGET_SHOPS_TO_COUNT)).toBe(false)
    expect(shopPassesWidget('in-progress', WIDGET_SHOPS_TO_COUNT)).toBe(true)
    expect(shopPassesWidget('to-count', WIDGET_SHOPS_TO_COUNT)).toBe(true)
  })
})
