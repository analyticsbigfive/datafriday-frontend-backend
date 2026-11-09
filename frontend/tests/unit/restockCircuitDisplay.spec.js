import {
  buildItemCircuitDisplay,
  transferPacksOf,
} from '@/utils/restockCircuitDisplay'

const rows = [
  { shopId: 'hk', shopName: 'Container HK' },
  { shopId: 'l14', shopName: 'Loire 14' },
  { shopId: 'o11', shopName: 'Oceane 11' },
  { shopId: 'x', shopName: 'Neutre' },
]
const transfers = [
  { fromShopId: 'hk', toShopId: 'l14', quantity: 90, packs: 3 },
  { fromShopId: 'hk', toShopId: 'o11', quantity: 30, packs: 1 },
]
const flowByShopRow = {
  'hk|||aff': { ceded: 120, received: 0, fromStorage: 0 },
  'l14|||aff': { ceded: 0, received: 90, fromStorage: 0 },
  'o11|||aff': { ceded: 0, received: 30, fromStorage: 0 },
}

describe('buildItemCircuitDisplay', () => {
  it('donneur, receveurs et PDV neutre avec contreparties', () => {
    const { byShop, header } = buildItemCircuitDisplay({
      rows, itemKey: 'aff', flowByShopRow, transfers, packSize: 30, toBuy: 0,
    })
    expect(byShop.hk.role).toBe('donor')
    expect(byShop.hk.packs).toBe(4)
    expect(byShop.hk.counterparts).toEqual([
      { shopName: 'Loire 14', packs: 3 },
      { shopName: 'Oceane 11', packs: 1 },
    ])
    expect(byShop.l14.role).toBe('receiver')
    expect(byShop.l14.packs).toBe(3)
    expect(byShop.l14.counterparts).toEqual([{ shopName: 'Container HK', packs: 3 }])
    expect(byShop.x.role).toBe('both-none')
    expect(header.coveredBySurplus).toBe(120)
    expect(header.coveredBySurplusPacks).toBe(4)
    expect(header.coveredByStorage).toBe(0)
    expect(header.toBuy).toBe(0)
  })

  it('prélèvement en réserve : rôle storage, colis entiers, total en en-tête', () => {
    const { byShop, header } = buildItemCircuitDisplay({
      rows,
      itemKey: 'aff',
      flowByShopRow: { 'x|||aff': { ceded: 0, received: 0, fromStorage: 60 } },
      transfers: [],
      packSize: 30,
      toBuy: 12,
      format: (q) => `${q} L`,
    })
    expect(byShop.x.role).toBe('storage')
    expect(byShop.x.storagePacks).toBe(2)
    expect(byShop.x.fromStorageLabel).toBe('60 L')
    expect(header.coveredByStorage).toBe(60)
    expect(header.coveredByStoragePacks).toBe(2)
    expect(header.coveredByStorageLabel).toBe('60 L')
    expect(header.toBuy).toBe(12)
  })

  it('sans flux ni colis : tout à zéro, pas d erreur', () => {
    const { byShop, header } = buildItemCircuitDisplay({ rows, itemKey: 'aff' })
    expect(byShop.hk).toMatchObject({ role: 'both-none', packs: 0, storagePacks: 0, counterparts: [] })
    expect(header).toMatchObject({ coveredBySurplus: 0, coveredByStorage: 0, toBuy: 0 })
  })
})

describe('helpers', () => {
  it('total des transferts', () => {
    expect(transferPacksOf(transfers)).toBe(4)
    expect(transferPacksOf(undefined)).toBe(0)
  })
})
