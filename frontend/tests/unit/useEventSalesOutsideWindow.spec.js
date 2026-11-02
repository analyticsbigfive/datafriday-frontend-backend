import { useEventSalesOutsideWindow } from '@/composables/useEventSalesOutsideWindow'
import { getEventSalesOutsideWindow } from '@/api/endpoints/event.api'

jest.mock('@/api/endpoints/event.api', () => ({ getEventSalesOutsideWindow: jest.fn() }))

describe('useEventSalesOutsideWindow', () => {
  beforeEach(() => jest.clearAllMocks())

  it('expose les heures de Paris quand des ventes tombent hors fenêtre', async () => {
    getEventSalesOutsideWindow.mockResolvedValue({
      count: 312, firstAt: '2026-10-31T15:30:00Z', lastAt: '2026-10-31T20:29:00Z', windowEnd: '2026-10-31T15:30:00Z',
    })
    const { outside, load } = useEventSalesOutsideWindow()
    await load('ev1')
    expect(outside.value).toEqual({ count: 312, first: '16:30', last: '21:29', end: '16:30' })
  })

  it('rien à afficher sans vente hors fenêtre, sans id, ou si l’appel échoue', async () => {
    const { outside, load } = useEventSalesOutsideWindow()
    getEventSalesOutsideWindow.mockResolvedValue({ count: 0 })
    await load('ev1')
    expect(outside.value).toBeNull()
    await load(null)
    expect(outside.value).toBeNull()
    getEventSalesOutsideWindow.mockRejectedValue(new Error('x'))
    await load('ev1')
    expect(outside.value).toBeNull()
  })
})
