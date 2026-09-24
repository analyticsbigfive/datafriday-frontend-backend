import {
  perimeterShopIds,
  restrictRecordsToShops,
  restrictRecordsToMenuConfig,
} from '@/utils/predictionPerimeter'

// Cas réel PAUC/CAEN (2026-09-25) : version « Test TS », menuConfig = 2 PdV,
// predictedRecords = 6 PdV (ventes des matchs de référence).
const PERRIER = 'cmscw101q06tnv68we6twcrjr'
const FOOD = 'cmscw101s06ufv68wq3vm6thw'
const CB = 'cmscw101q06trv68wpbne5sxw'
const BAR = 'cmscw101r06u9v68wgpmb62x7'

const records = [
  { shopId: PERRIER, shop: 'Buvette 2 Perrier', itemName: '1664 50cl', totalQuantity: 42 },
  { shopId: FOOD, shop: 'Container food', itemName: '1664 50cl', totalQuantity: 61 },
  { shopId: CB, shop: 'Buvette CB', itemName: '1664 50cl', totalQuantity: 5 },
  { shopId: BAR, shop: 'Container bar', itemName: '1664 50cl', totalQuantity: 12 },
]
const menuConfig = { [PERRIER]: ['mi-1664-50'], [FOOD]: ['mi-1664-50'] }

describe('predictionPerimeter (Restock limité aux PdV du scénario)', () => {
  it('périmètre = PdV de la menuConfig, même sans article coché', () => {
    expect([...perimeterShopIds({ ...menuConfig, closed: [] })].sort()).toEqual([PERRIER, FOOD, 'closed'].sort())
  })

  it('écarte les PdV hors Space Menu du match', () => {
    const kept = restrictRecordsToMenuConfig(records, menuConfig)
    expect(kept.map((r) => r.shop)).toEqual(['Buvette 2 Perrier', 'Container food'])
    expect(kept.reduce((s, r) => s + r.totalQuantity, 0)).toBe(103)
  })

  it('garde toujours les lignes saisies à la main', () => {
    const manual = { shopId: 'autre', isManual: true, totalQuantity: 3 }
    expect(restrictRecordsToShops([...records, manual], new Set([PERRIER]))).toContain(manual)
  })

  it('sans menuConfig, ou records keyés par nom : inchangés (jamais de réarmement vidé)', () => {
    expect(restrictRecordsToMenuConfig(records, null)).toEqual(records)
    const byName = [{ shop: 'Buvette 2 Perrier', totalQuantity: 4 }]
    expect(restrictRecordsToMenuConfig(byName, menuConfig)).toEqual(byName)
  })
})
