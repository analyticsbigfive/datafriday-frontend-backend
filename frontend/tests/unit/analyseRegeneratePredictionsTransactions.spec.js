// regeneratePredictions : transactions des records prédictifs (outil Forecast).
//
// Le moteur laisse `transactionCount: 0` sur les events futurs ; le store les estime
// (utils/predictedTransactions) et met à l'échelle ceux des copies d'events passés avec
// scénario, au même facteur que le CA et les quantités.

import analyse from '@/store/modules/analyse'

jest.mock('@/utils/predictiveAnalytics', () => ({
  ...jest.requireActual('@/utils/predictiveAnalytics'),
  generatePredictionsForEvent: jest.fn(),
}))
// eslint-disable-next-line import/first
import { generatePredictionsForEvent } from '@/utils/predictiveAnalytics'

const actual = (eventId, shopId, quantity, transactionCount, revenue) => ({
  eventId, shopId, shopName: `PdV ${shopId}`, quantity, transactionCount, revenue,
})

const enginePred = (shopId, quantity, basedOnEventIds) => ({
  eventId: 'f1', shopId, shopName: `PdV ${shopId}`, quantity, revenue: quantity * 5,
  transactionCount: 0, isPredictive: true, basedOnEventIds,
})

function buildState() {
  const state = analyse.state()
  state.selectedToolbox = 'predict'
  state.events = [
    { id: 'p1', eventDate: '2020-01-01' },
    { id: 'p2', eventDate: '2020-02-01' },
    { id: 'p3', eventDate: '2020-03-01' },
    { id: 'f1', eventDate: '2099-01-01' },
  ]
  state.shopGranularData = [
    actual('p1', 's1', 100, 50, 500),
    actual('p1', 's2', 100, 10, 500),
    actual('p2', 's1', 100, 20, 500),
    actual('p3', 's1', 100, 40, 1000),
  ]
  return state
}

async function run(state) {
  const committed = {}
  const commit = (type, payload) => { committed[type] = payload }
  await analyse.actions.regeneratePredictions({ state, commit })
  return committed
}

describe('analyse store, regeneratePredictions : transactions prévues', () => {
  beforeEach(() => {
    localStorage.clear()
    generatePredictionsForEvent.mockReset()
  })
  afterEach(() => localStorage.clear())

  it('event futur : quantité x ratio du PdV sur les events sources du moteur', async () => {
    // Tous les records d'un event partagent les mêmes sources (les matchs retenus par le moteur).
    generatePredictionsForEvent.mockReturnValue([
      enginePred('s1', 200, ['p1']), // s1 sur p1 : 50 / 100 = 0,5
      enginePred('s2', 100, ['p1']), // s2 sur p1 : 10 / 100 = 0,1
      enginePred('s3', 100, ['p1']), // PdV inconnu : global p1 = 60 / 200 = 0,3
    ])
    const { SET_SHOP_GRANULAR: out } = await run(buildState())
    const byShop = Object.fromEntries(out.filter((r) => r.isPredictive).map((r) => [r.shopId, r.transactionCount]))
    expect(byShop).toEqual({ s1: 100, s2: 10, s3: 30 })
  })

  it('les transactions suivent les quantités mises à l\'échelle par un scénario sur l\'event futur', async () => {
    generatePredictionsForEvent.mockReturnValue([enginePred('s1', 200, ['p1'])])
    localStorage.setItem('analyse:event-predict-active-version:f1', JSON.stringify({ activeVersionId: 'v1' }))
    // CA moteur 1000, cible 500 : facteur 0,5, quantité 100, ratio s1 0,5 : 50 transactions.
    localStorage.setItem('analyse:event-predict-versions:f1', JSON.stringify([{ id: 'v1', totalRevenue: 500, predictedRecords: [] }]))
    const { SET_SHOP_GRANULAR: out } = await run(buildState())
    const rec = out.find((r) => r.eventId === 'f1')
    expect(rec.quantity).toBe(100)
    expect(rec.transactionCount).toBe(50)
  })

  it('event passé avec scénario : transactions mises à l\'échelle du même facteur que CA et quantités', async () => {
    generatePredictionsForEvent.mockReturnValue([])
    localStorage.setItem('analyse:event-predict-active-version:p3', JSON.stringify({ activeVersionId: 'v1' }))
    // CA réel 1000, cible 2000 : facteur 2.
    localStorage.setItem('analyse:event-predict-versions:p3', JSON.stringify([{ id: 'v1', totalRevenue: 2000, predictedRecords: [] }]))
    const { SET_SHOP_GRANULAR: out } = await run(buildState())
    const copy = out.find((r) => r.eventId === 'p3' && r.isPredictive)
    expect(copy.revenue).toBe(2000)
    expect(copy.quantity).toBe(200)
    expect(copy.transactionCount).toBe(80)
    // Le record réel d'origine est conservé tel quel.
    const original = out.find((r) => r.eventId === 'p3' && !r.isPredictive)
    expect(original.transactionCount).toBe(40)
  })

  it('les records réels ne sont pas modifiés', async () => {
    generatePredictionsForEvent.mockReturnValue([enginePred('s1', 200, ['p1'])])
    const { SET_SHOP_GRANULAR: out } = await run(buildState())
    expect(out.filter((r) => !r.isPredictive).map((r) => r.transactionCount)).toEqual([50, 10, 20, 40])
  })
})
