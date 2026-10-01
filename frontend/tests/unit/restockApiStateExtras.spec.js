// putRestockState (api/endpoints/restock.api.js) : les `extras` du PUT portent
// les % par PDV de l'étape 1 (chantier 388), avec repli sur le noyau quand un
// backend en whitelist stricte refuse les champs additionnels.
jest.mock('@/api/client', () => {
  const api = { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }
  return { __esModule: true, api, default: api }
})

import { api } from '@/api/client'
import { putRestockState } from '@/api/endpoints/restock.api'

const baseSnapshot = {
  objectiveSource: 'forecast',
  referenceEventId: null,
  selectedEventIds: ['ev-1'],
  stockAdjustments: { 'beer|||pcs': 110 },
  restockedRows: {},
  restockGenerated: false,
  shoppingGenerated: false,
  restockViewMode: 'item',
}

describe('putRestockState, extras stockShopPercents', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('envoie stockShopPercents dans le corps du PUT', async () => {
    api.put.mockResolvedValueOnce({ state: { ok: true } })
    const percents = { 'shop-1|||beer|||pcs': 150, 'shop-2|||beer|||pcs': 0 }
    await putRestockState('space-1', { ...baseSnapshot, stockShopPercents: percents })
    expect(api.put).toHaveBeenCalledTimes(1)
    const [url, body] = api.put.mock.calls[0]
    expect(url).toBe('/spaces/space-1/restock-state')
    expect(body.stockShopPercents).toEqual(percents)
    expect(body.stockAdjustments).toEqual({ 'beer|||pcs': 110 })
  })

  it('n\'ajoute pas la clé quand le snapshot ne la porte pas', async () => {
    api.put.mockResolvedValueOnce({ state: {} })
    await putRestockState('space-1', baseSnapshot)
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('stockShopPercents')
  })

  it('backend en whitelist stricte : repli sur le noyau, sans stockShopPercents', async () => {
    api.put
      .mockRejectedValueOnce({ response: { status: 400, data: { message: ['property stockShopPercents should not exist'] } } })
      .mockResolvedValueOnce({ state: {} })
    await putRestockState('space-1', { ...baseSnapshot, stockShopPercents: { 'shop-1|||beer|||pcs': 150 } })
    expect(api.put).toHaveBeenCalledTimes(2)
    expect(api.put.mock.calls[0][1]).toHaveProperty('stockShopPercents')
    expect(api.put.mock.calls[1][1]).not.toHaveProperty('stockShopPercents')
  })
})
