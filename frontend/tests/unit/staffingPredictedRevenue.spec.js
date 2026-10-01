jest.mock('@/api/client', () => ({ __esModule: true, default: { post: jest.fn() } }))

import api from '@/api/client'
import { generateEventStaffing } from '@/api/endpoints/staffing.api'
import staffing from '@/store/modules/staffing'
import {
  aggregatePredictedRevenueByElement,
  hasPredictedRevenue,
} from '@/utils/staffingPredictedRevenue'

// BUG-391-02 : « Generate Staff » envoie le CA prédit affiché à l'écran, agrégé par PDV.

describe('aggregatePredictedRevenueByElement', () => {
  it('somme totalRevenue par shopId, arrondi à 2 décimales', () => {
    const out = aggregatePredictedRevenueByElement([
      { shopId: 'a', menuItemId: 'm1', totalRevenue: 100.1 },
      { shopId: 'a', menuItemId: 'm2', totalRevenue: 0.256 },
      { shopId: 'b', menuItemId: 'm1', totalRevenue: 1000 },
    ])
    expect(out).toEqual({ a: 100.36, b: 1000 })
  })

  it('ignore les lignes sans shopId et les CA non finis ou absents', () => {
    const out = aggregatePredictedRevenueByElement([
      { shopId: null, totalRevenue: 500 },
      { totalRevenue: 500 },
      { shopId: 'a', totalRevenue: NaN },
      { shopId: 'a', totalRevenue: Infinity },
      { shopId: 'a', totalRevenue: 'abc' },
      { shopId: 'a', totalRevenue: null },
      { shopId: 'a' },
      { shopId: 'b', totalRevenue: '250' },
      null,
    ])
    expect(out).toEqual({ b: 250 })
  })

  it('garde un PDV à 0 (le backend décide), renvoie {} sur entrée vide ou invalide', () => {
    expect(aggregatePredictedRevenueByElement([{ shopId: 'a', totalRevenue: 0 }])).toEqual({ a: 0 })
    expect(aggregatePredictedRevenueByElement([])).toEqual({})
    expect(aggregatePredictedRevenueByElement(undefined)).toEqual({})
    expect(aggregatePredictedRevenueByElement({})).toEqual({})
  })
})

describe('hasPredictedRevenue', () => {
  it('vrai seulement pour un objet non vide', () => {
    expect(hasPredictedRevenue({ a: 0 })).toBe(true)
    expect(hasPredictedRevenue({})).toBe(false)
    expect(hasPredictedRevenue(null)).toBe(false)
    expect(hasPredictedRevenue(undefined)).toBe(false)
    expect(hasPredictedRevenue([1])).toBe(false)
  })
})

describe('generateEventStaffing (API)', () => {
  beforeEach(() => {
    api.post.mockReset()
    api.post.mockResolvedValue({ data: { ok: true } })
  })

  it('envoie le corps quand la map est non vide', async () => {
    await generateEventStaffing('ev1', { predictedRevenueByElement: { a: 1200 } })
    expect(api.post).toHaveBeenCalledWith('/events/ev1/staffing/generate', {
      predictedRevenueByElement: { a: 1200 },
    })
  })

  it('POST sans corps quand la map est vide ou absente (comportement historique)', async () => {
    await generateEventStaffing('ev1')
    await generateEventStaffing('ev1', { predictedRevenueByElement: {} })
    expect(api.post).toHaveBeenNthCalledWith(1, '/events/ev1/staffing/generate')
    expect(api.post).toHaveBeenNthCalledWith(2, '/events/ev1/staffing/generate')
    expect(api.post.mock.calls.every((c) => c.length === 1)).toBe(true)
  })
})

describe('store staffing/generate', () => {
  const run = async (arg) => {
    const commit = jest.fn()
    await staffing.actions.generate({ commit }, arg)
    return commit
  }

  beforeEach(() => {
    api.post.mockReset()
    api.post.mockResolvedValue({ data: { elements: [] } })
  })

  it('objet { eventId, predictedRevenueByElement } non vide : corps envoyé', async () => {
    const commit = await run({ eventId: 'ev1', predictedRevenueByElement: { a: 3000 } })
    expect(api.post).toHaveBeenCalledWith('/events/ev1/staffing/generate', {
      predictedRevenueByElement: { a: 3000 },
    })
    expect(commit).toHaveBeenCalledWith('setPayload', { eventId: 'ev1', payload: { elements: [] } })
  })

  it('objet avec map vide : POST sans corps', async () => {
    await run({ eventId: 'ev1', predictedRevenueByElement: {} })
    expect(api.post).toHaveBeenCalledWith('/events/ev1/staffing/generate')
    expect(api.post.mock.calls[0]).toHaveLength(1)
  })

  it('ancienne signature (eventId en chaîne) toujours acceptée', async () => {
    const commit = await run('ev2')
    expect(api.post).toHaveBeenCalledWith('/events/ev2/staffing/generate')
    expect(api.post.mock.calls[0]).toHaveLength(1)
    expect(commit).toHaveBeenCalledWith('setPayload', { eventId: 'ev2', payload: { elements: [] } })
    expect(commit).toHaveBeenLastCalledWith('setSaving', false)
  })
})
