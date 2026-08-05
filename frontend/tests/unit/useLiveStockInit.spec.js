/**
 * Module Live ← Inventaire pré-événement (docs/modules/11_LIVE.md §15) :
 * `useLiveStockInit` orchestre la lecture du comptage pré-événement validé
 * d'un event et le dispatch du reset Logistic générique existant
 * (`logistics/reset`) — pas de nouvel endpoint backend. La résolution
 * itemId → itemKey (catalogues MenuItem + MarketPrice, cf. buildItemKeyById)
 * tourne réellement ici, ces tests couvrent l'orchestration autour.
 */
const mockState = { analyse: { menuItems: [] }, inventory: { marketPrices: [] } }
const mockDispatch = jest.fn()

jest.mock('@/store', () => ({
  __esModule: true,
  default: {
    get state() { return mockState },
    dispatch: (...a) => mockDispatch(...a),
  },
}))

const mockGetPreEventInventory = jest.fn()
jest.mock('@/api/endpoints/inventory.api', () => ({
  getPreEventInventory: (...a) => mockGetPreEventInventory(...a),
}))

import { useLiveStockInit } from '@/composables/useLiveStockInit'

const menuItems = [{ id: 'mi-cookie', name: 'Cookie', readyForSale: 'Yes' }]
const marketPrices = [{ id: 'mp-badiane', itemName: 'Badiane' }]

function setupStore() {
  mockState.analyse.menuItems = menuItems
  mockState.inventory.marketPrices = marketPrices
}

beforeEach(() => {
  jest.clearAllMocks()
  setupStore()
})

describe('useLiveStockInit', () => {
  it('résout les itemId du comptage pré-événement en itemKey et dispatche logistics/reset', async () => {
    mockGetPreEventInventory.mockResolvedValue({
      source: 'pre-event',
      inventoryCounts: {
        'shop-1': { 'mi-cookie': { packedUnits: 2, looseUnits: 4, isCounted: true } },
      },
    })

    const { initFromPreEventInventory } = useLiveStockInit()
    const res = await initFromPreEventInventory('space-1', 'ev-1', 'Match A')

    expect(res).toEqual({ ok: true, lineCount: 1, source: 'pre-event' })
    expect(mockDispatch).toHaveBeenCalledWith('logistics/reset', {
      spaceId: 'space-1',
      eventId: 'ev-1',
      eventName: 'Match A',
      lines: [{ elementId: 'shop-1', itemKey: 'Cookie', countedPacked: 2, countedLoose: 4 }],
    })
  })

  it("résout aussi une ligne ingrédient dont l'itemId est un MarketPrice.id (aucun MenuItem correspondant)", async () => {
    mockGetPreEventInventory.mockResolvedValue({
      source: 'pre-event',
      inventoryCounts: {
        'shop-1': { 'mp-badiane': { packedUnits: 0, looseUnits: 2, isCounted: true } },
      },
    })

    const { initFromPreEventInventory } = useLiveStockInit()
    const res = await initFromPreEventInventory('space-1', 'ev-1')

    expect(res).toEqual({ ok: true, lineCount: 1, source: 'pre-event' })
    expect(mockDispatch).toHaveBeenCalledWith('logistics/reset', {
      spaceId: 'space-1',
      eventId: 'ev-1',
      eventName: undefined,
      lines: [{ elementId: 'shop-1', itemKey: 'Badiane', countedPacked: 0, countedLoose: 2 }],
    })
  })

  it('écarte les lignes orphelines (itemId absent du catalogue courant)', async () => {
    mockGetPreEventInventory.mockResolvedValue({
      source: 'pre-event',
      inventoryCounts: {
        'shop-1': { 'mi-unknown': { packedUnits: 1, looseUnits: 0, isCounted: true } },
      },
    })

    const { initFromPreEventInventory } = useLiveStockInit()
    const res = await initFromPreEventInventory('space-1', 'ev-1')

    expect(res).toEqual({ ok: false, reason: 'no-requirements' })
    expect(mockDispatch).not.toHaveBeenCalledWith('logistics/reset', expect.anything())
  })

  it("échoue proprement quand l'event n'a aucun comptage pré-événement", async () => {
    mockGetPreEventInventory.mockResolvedValue(null)

    const { initFromPreEventInventory } = useLiveStockInit()
    const res = await initFromPreEventInventory('space-1', 'ev-1')

    expect(res).toEqual({ ok: false, reason: 'no-pre-event-inventory' })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('ne dispatche rien sans spaceId/eventId', async () => {
    const { initFromPreEventInventory } = useLiveStockInit()
    const res = await initFromPreEventInventory('', '')

    expect(res.ok).toBe(false)
    expect(mockGetPreEventInventory).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
