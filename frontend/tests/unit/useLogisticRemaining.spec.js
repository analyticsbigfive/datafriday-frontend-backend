jest.mock('@/api/endpoints/logistics.api', () => ({
  getLogisticsStock: jest.fn(),
}))

import { getLogisticsStock } from '@/api/endpoints/logistics.api'
import {
  loadLogisticRemainingIndex,
  lookupLogisticRemaining,
  logisticPoolEntriesForElements,
} from '@/composables/useLogisticRemaining'

beforeEach(() => {
  jest.clearAllMocks()
})

function stockPayload(overrides = {}) {
  return {
    elements: [{ id: 'shop-1', items: [{ name: 'Coca-Cola', unit: 'Pc' }] }],
    levels: [{ elementId: 'shop-1', itemKey: 'Coca-Cola', packedUnits: 2, looseUnits: 5, unitsPerPack: 24, marketPriceId: 'mp-1' }],
    consumption: [],
    ...overrides,
  }
}

describe('loadLogisticRemainingIndex', () => {
  it('sans spaceId ou configIds → index vide, loaded=false, aucun appel réseau', async () => {
    const res = await loadLogisticRemainingIndex({ spaceId: null, configIds: ['c1'] })
    expect(res).toEqual({ index: {}, loaded: false })
    expect(getLogisticsStock).not.toHaveBeenCalled()
  })

  it('indexe par élément::nom normalisé, packed*unitsPerPack + loose', async () => {
    getLogisticsStock.mockResolvedValue(stockPayload())
    const { index, loaded } = await loadLogisticRemainingIndex({ spaceId: 'sp-1', configIds: ['c1'] })
    expect(loaded).toBe(true)
    expect(getLogisticsStock).toHaveBeenCalledWith('sp-1', 'c1')
    expect(lookupLogisticRemaining(index, 'shop-1', 'Coca-Cola')).toBe(2 * 24 + 5)
    expect(lookupLogisticRemaining(index, 'shop-1', 'COCA-COLA')).toBe(2 * 24 + 5)
  })

  it('déduit la consommation ventes avant de composer packed/loose', async () => {
    getLogisticsStock.mockResolvedValue(
      stockPayload({ consumption: [{ elementId: 'shop-1', itemKey: 'Coca-Cola', quantity: 5 }] }),
    )
    const { index } = await loadLogisticRemainingIndex({ spaceId: 'sp-1', configIds: ['c1'] })
    // loose 5 - conso 5 = 0 → 2 packs pile, aucune casse de pack.
    expect(lookupLogisticRemaining(index, 'shop-1', 'Coca-Cola')).toBe(2 * 24)
  })

  it('casse un pack quand la conso dépasse le loose disponible (miroir normalizeExpected)', async () => {
    getLogisticsStock.mockResolvedValue(
      stockPayload({ consumption: [{ elementId: 'shop-1', itemKey: 'Coca-Cola', quantity: 10 }] }),
    )
    const { index } = await loadLogisticRemainingIndex({ spaceId: 'sp-1', configIds: ['c1'] })
    // loose 5 - conso 10 = -5 → emprunte 1 pack (24) : packed 1, loose 19.
    expect(lookupLogisticRemaining(index, 'shop-1', 'Coca-Cola')).toBe(1 * 24 + 19)
  })

  it('un config qui échoue ne bloque pas les autres (fan-out tolérant)', async () => {
    getLogisticsStock.mockImplementation((spaceId, configId) =>
      configId === 'bad' ? Promise.reject(new Error('403')) : Promise.resolve(stockPayload()),
    )
    const { index, loaded } = await loadLogisticRemainingIndex({ spaceId: 'sp-1', configIds: ['bad', 'c1'] })
    expect(loaded).toBe(true)
    expect(lookupLogisticRemaining(index, 'shop-1', 'Coca-Cola')).toBe(2 * 24 + 5)
  })

  it('tous les configs échouent → index vide, loaded=false', async () => {
    getLogisticsStock.mockRejectedValue(new Error('403'))
    const { index, loaded } = await loadLogisticRemainingIndex({ spaceId: 'sp-1', configIds: ['c1'] })
    expect(index).toEqual({})
    expect(loaded).toBe(false)
  })
})

describe('lookupLogisticRemaining', () => {
  it('rien pour cette ligne → null (pas 0), à distinguer d’un stock explicitement vide', () => {
    expect(lookupLogisticRemaining({}, 'shop-1', 'Coca-Cola')).toBeNull()
    expect(lookupLogisticRemaining(null, 'shop-1', 'Coca-Cola')).toBeNull()
  })
})

describe('logisticPoolEntriesForElements', () => {
  it('agrège plusieurs éléments par nom normalisé, identité purement par nom (itemId/sourceId null)', async () => {
    getLogisticsStock.mockImplementation((spaceId, configId) =>
      Promise.resolve({
        elements: [{ id: configId === 'c1' ? 'storage-1' : 'storage-2', items: [{ name: 'Farine', unit: 'kg' }] }],
        levels: [{ elementId: configId === 'c1' ? 'storage-1' : 'storage-2', itemKey: 'Farine', packedUnits: 0, looseUnits: 10, unitsPerPack: null, marketPriceId: 'mp-farine' }],
        consumption: [],
      }),
    )
    const { index } = await loadLogisticRemainingIndex({ spaceId: 'sp-1', configIds: ['c1', 'c2'] })
    const entries = logisticPoolEntriesForElements(index, ['storage-1', 'storage-2'])
    expect(entries).toEqual([
      { itemId: null, sourceId: null, marketPriceId: 'mp-farine', name: 'Farine', unit: 'kg', qty: 20 },
    ])
  })

  it('exclut les entrées à quantité nulle ou négative', () => {
    const index = { 'storage-1::vide': { name: 'Vide', packed: 0, loose: 0, unitsPerPack: 1, marketPriceId: null, unit: '' } }
    expect(logisticPoolEntriesForElements(index, ['storage-1'])).toEqual([])
  })
})
