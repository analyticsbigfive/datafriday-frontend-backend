/**
 * Module Live ← Event Predict (docs/modules/11_LIVE.md) : `useLiveStockInit`
 * orchestre la sélection de la version Event Predict par défaut d'un event et
 * le dispatch du reset Logistic générique existant (`logistics/reset`) — pas
 * de nouvel endpoint backend. `buildStockRequirements` (déjà testée ailleurs)
 * tourne réellement ici, ces tests couvrent l'orchestration autour.
 */
const mockState = { analyse: { events: [], configurations: [], menuItems: [], components: [] } }
const mockDispatch = jest.fn()

jest.mock('@/store', () => ({
  __esModule: true,
  default: {
    get state() { return mockState },
    dispatch: (...a) => mockDispatch(...a),
  },
}))

const mockListEventPredictVersions = jest.fn()
jest.mock('@/api/endpoints/eventPredict.api', () => ({
  listEventPredictVersions: (...a) => mockListEventPredictVersions(...a),
}))

import { useLiveStockInit } from '@/composables/useLiveStockInit'

const configuration = {
  id: 'cfg-1',
  data: { floors: [{ elements: [{ id: 'shop-1', name: 'Bar Nord', type: 'shop' }] }] },
}
const menuItems = [{ id: 'mi-cookie', name: 'Cookie', readyForSale: 'Yes' }]

function setupStore({ eventId = 'ev-1', configurationId = 'cfg-1' } = {}) {
  mockState.analyse.events = [{ id: eventId, configurationId }]
  mockState.analyse.configurations = [configuration]
  mockState.analyse.menuItems = menuItems
  mockState.analyse.components = []
}

beforeEach(() => {
  jest.clearAllMocks()
  setupStore()
})

describe('useLiveStockInit', () => {
  it('sélectionne la version isDefault et dispatche logistics/reset avec les lignes calculées', async () => {
    mockListEventPredictVersions.mockResolvedValue([
      { id: 'v-draft', isDefault: false, menuConfig: {}, quantityAdjustments: {}, predictedRecords: [] },
      {
        id: 'v-default',
        isDefault: true,
        menuConfig: { 'shop-1': ['mi-cookie'] },
        quantityAdjustments: {},
        predictedRecords: [{ shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 20 }],
      },
    ])

    const { initFromEventPredict } = useLiveStockInit()
    const res = await initFromEventPredict('space-1', 'ev-1', 'Match A')

    expect(res).toEqual({ ok: true, lineCount: 1 })
    expect(mockDispatch).toHaveBeenCalledWith('logistics/reset', {
      spaceId: 'space-1',
      eventId: 'ev-1',
      eventName: 'Match A',
      lines: [{ elementId: 'shop-1', itemKey: expect.any(String), countedPacked: 0, countedLoose: 20 }],
    })
  })

  it('retombe sur la 1re version si aucune isDefault', async () => {
    mockListEventPredictVersions.mockResolvedValue([
      {
        id: 'v-only',
        isDefault: false,
        menuConfig: { 'shop-1': ['mi-cookie'] },
        quantityAdjustments: {},
        predictedRecords: [{ shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 5 }],
      },
    ])

    const { initFromEventPredict } = useLiveStockInit()
    const res = await initFromEventPredict('space-1', 'ev-1')

    expect(res.ok).toBe(true)
    expect(mockDispatch).toHaveBeenCalled()
  })

  it("échoue proprement quand l'event n'a aucune version Event Predict", async () => {
    mockListEventPredictVersions.mockResolvedValue([])

    const { initFromEventPredict } = useLiveStockInit()
    const res = await initFromEventPredict('space-1', 'ev-1')

    expect(res).toEqual({ ok: false, reason: 'no-event-predict-version' })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it("échoue proprement quand l'event n'a pas de configuration résolue", async () => {
    setupStore({ configurationId: 'cfg-does-not-exist' })
    mockListEventPredictVersions.mockResolvedValue([
      { id: 'v1', isDefault: true, menuConfig: {}, quantityAdjustments: {}, predictedRecords: [] },
    ])

    const { initFromEventPredict } = useLiveStockInit()
    const res = await initFromEventPredict('space-1', 'ev-1')

    expect(res).toEqual({ ok: false, reason: 'no-configuration' })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('ne dispatche rien sans spaceId/eventId', async () => {
    const { initFromEventPredict } = useLiveStockInit()
    const res = await initFromEventPredict('', '')

    expect(res.ok).toBe(false)
    expect(mockListEventPredictVersions).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
