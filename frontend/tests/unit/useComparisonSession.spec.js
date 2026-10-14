import { useComparisonSession, setMainDeltas } from '@/composables/useComparisonSession'

const d = (text) => ({ kind: 'delta', tone: 'good', text })

describe('useComparisonSession', () => {
  afterEach(() => setMainDeltas(null))

  it('est inactif par défaut', () => {
    const s = useComparisonSession()
    expect(s.mainDeltas.value).toBeNull()
    expect(s.isActive.value).toBe(false)
    expect(s.chipDeltas.value).toBeNull()
    expect(s.widgetDeltas.value).toBeNull()
  })

  it('partage l état entre appels et expose chips / widgets mappés', () => {
    const a = useComparisonSession()
    const b = useComparisonSession()
    const payload = {
      chips: { revenue: d('▲ 1,0 %') },
      widgets: {
        revenuePerTpe: d('t'), revenuePerCollaborator: d('c'), margin: d('m'),
        transactionRate: d('r'), stockValue: d('s'),
      },
    }
    a.setMainDeltas(payload)
    expect(b.isActive.value).toBe(true)
    expect(b.chipDeltas.value.revenue.text).toBe('▲ 1,0 %')
    expect(b.widgetDeltas.value).toEqual({
      tpe: payload.widgets.revenuePerTpe,
      collaborator: payload.widgets.revenuePerCollaborator,
      margin: payload.widgets.margin,
      transactionRate: payload.widgets.transactionRate,
      stock: payload.widgets.stockValue,
    })
    b.clear()
    expect(a.isActive.value).toBe(false)
  })
})
