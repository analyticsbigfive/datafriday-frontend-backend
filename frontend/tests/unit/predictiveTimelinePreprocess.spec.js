import {
  parseMinuteToken,
  isMinuteInRange,
  hasActiveRange,
  aggregateTimelinePerMinute,
  computeWindowRatios,
  windowPredictedRecords,
} from '@/utils/predictiveTimelinePreprocess'

describe('predictiveTimelinePreprocess', () => {
  describe('parseMinuteToken', () => {
    it('parses HH:MM strings', () => {
      expect(parseMinuteToken('00:00')).toBe(0)
      expect(parseMinuteToken('19:30')).toBe(19 * 60 + 30)
    })
    it('returns null for invalid input', () => {
      expect(parseMinuteToken(null)).toBeNull()
      expect(parseMinuteToken('nope')).toBeNull()
    })
  })

  describe('isMinuteInRange', () => {
    it('returns true when no bounds are set', () => {
      expect(isMinuteInRange('19:00', { start: null, end: null })).toBe(true)
    })
    it('respects start / end bounds (inclusive)', () => {
      const r = { start: '19:00', end: '20:00' }
      expect(isMinuteInRange('18:59', r)).toBe(false)
      expect(isMinuteInRange('19:00', r)).toBe(true)
      expect(isMinuteInRange('19:30', r)).toBe(true)
      expect(isMinuteInRange('20:00', r)).toBe(true)
      expect(isMinuteInRange('20:01', r)).toBe(false)
    })
  })

  describe('hasActiveRange', () => {
    it('detects active range', () => {
      expect(hasActiveRange(null)).toBe(false)
      expect(hasActiveRange({ start: null, end: null })).toBe(false)
      expect(hasActiveRange({ start: '19:00', end: null })).toBe(true)
      expect(hasActiveRange({ start: null, end: '20:00' })).toBe(true)
    })
  })

  describe('aggregateTimelinePerMinute', () => {
    it('produces one point per minute with cost / margin / basket', () => {
      const records = [
        { minute: '19:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
        { minute: '19:00', shopId: 's2', menuItemId: 'm2', totalRevenue: 50, totalQuantity: 5, transactionCount: 2 },
        { minute: '19:01', shopId: 's1', menuItemId: 'm1', totalRevenue: 30, totalQuantity: 3, transactionCount: 1 },
      ]
      const out = aggregateTimelinePerMinute(records, {
        menuItemCostMap: { m1: 4, m2: 2 },
      })
      expect(out).toHaveLength(2)
      const p1900 = out.find((p) => p.minute === '19:00')
      expect(p1900.totalRevenue).toBe(150)
      expect(p1900.totalQuantity).toBe(15)
      expect(p1900.transactionCount).toBe(7)
      // cost = 10*4 + 5*2 = 50
      expect(p1900.totalCost).toBe(50)
      // margin = (150-50)/150 = 66.67%
      expect(Math.round(p1900.margin)).toBe(67)
      // basket = 150 / 7
      expect(Math.round(p1900.avgBasket * 100)).toBe(Math.round((150 / 7) * 100))
    })

    it('returns empty array on empty input', () => {
      expect(aggregateTimelinePerMinute([])).toEqual([])
      expect(aggregateTimelinePerMinute(null)).toEqual([])
    })
  })

  describe('computeWindowRatios', () => {
    it('computes per (shop, item) ratio between windowed and full sums', () => {
      const data = [
        { minute: '19:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
        { minute: '19:30', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
        { minute: '20:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
      ]
      const { ratios, hasAnyTimeline } = computeWindowRatios(data, {
        start: '19:00',
        end: '19:30',
      })
      expect(hasAnyTimeline).toBe(true)
      const r = ratios.get('s1::m1')
      // 2 of 3 minutes inside window
      expect(r.rev).toBeCloseTo(2 / 3)
      expect(r.qty).toBeCloseTo(2 / 3)
      expect(r.tx).toBeCloseTo(2 / 3)
    })
  })

  describe('windowPredictedRecords', () => {
    const records = [
      { elementId: 's1', menuItemId: 'm1', quantity: 100, revenue: 1000, transactionCount: 50 },
      { elementId: 's2', menuItemId: 'm2', quantity: 50, revenue: 500, transactionCount: 25 },
    ]
    const timeline = [
      { minute: '19:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 60, totalQuantity: 6, transactionCount: 3 },
      { minute: '20:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 40, totalQuantity: 4, transactionCount: 2 },
      { minute: '19:00', shopId: 's2', menuItemId: 'm2', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
    ]

    it('returns original records when range is inactive', () => {
      const out = windowPredictedRecords(records, timeline, { start: null, end: null })
      expect(out).toBe(records)
    })

    it('returns original records when timeline data is missing', () => {
      const out = windowPredictedRecords(records, [], { start: '19:00', end: '19:30' })
      expect(out).toBe(records)
    })

    it('applies per-key ratios when range is active', () => {
      const out = windowPredictedRecords(records, timeline, {
        start: '19:00',
        end: '19:59',
      })
      // s1/m1: 60% in window
      expect(out[0].revenue).toBeCloseTo(600)
      expect(out[0].quantity).toBeCloseTo(60)
      expect(out[0].transactionCount).toBeCloseTo(30)
      // s2/m2: 100% in window
      expect(out[1].revenue).toBeCloseTo(500)
    })

    it('zeroes out records without timeline match when range is active', () => {
      const out = windowPredictedRecords(
        [{ elementId: 'sX', menuItemId: 'mX', quantity: 10, revenue: 100, transactionCount: 5 }],
        timeline,
        { start: '19:00', end: '19:59' },
      )
      expect(out[0].revenue).toBe(0)
      expect(out[0].quantity).toBe(0)
      expect(out[0].transactionCount).toBe(0)
    })
  })
})
