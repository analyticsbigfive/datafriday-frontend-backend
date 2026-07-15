import {
  TIMELINE_BUCKET_STRATEGIES,
  parseMinuteToken,
  formatMinute,
  bucketMinute,
  isMinuteInRange,
  hasActiveRange,
  aggregateTimeline,
  aggregateTimelinePerMinute,
  preprocessTimelineRecords,
  buildTimelineFilter,
  computeWindowRatios,
  windowPredictedRecords,
} from '@/utils/timelineBucketing'

describe('timelineBucketing', () => {
  describe('bucketMinute', () => {
    it('buckets HH:MM to the requested granularity', () => {
      expect(bucketMinute('19:07', 1)).toBe('19:07')
      expect(bucketMinute('19:07', 5)).toBe('19:05')
      expect(bucketMinute('19:07', 15)).toBe('19:00')
      expect(bucketMinute('19:59', 60)).toBe('19:00')
    })
    it('supports numeric input and normalizes 24h', () => {
      expect(bucketMinute(1500, 15)).toBe('01:00') // 1500 mod 1440 = 60 → bucket 15 → 01:00
    })
    it('returns null on invalid input', () => {
      expect(bucketMinute('nope', 15)).toBeNull()
    })
  })

  describe('parseMinuteToken / formatMinute', () => {
    it('round-trips HH:MM', () => {
      expect(formatMinute(parseMinuteToken('07:42'))).toBe('07:42')
    })
  })

  describe('isMinuteInRange / hasActiveRange', () => {
    it('handles inclusive bounds', () => {
      const r = { start: '19:00', end: '20:00' }
      expect(hasActiveRange(r)).toBe(true)
      expect(isMinuteInRange('19:00', r)).toBe(true)
      expect(isMinuteInRange('20:00', r)).toBe(true)
      expect(isMinuteInRange('20:01', r)).toBe(false)
    })
  })

  describe('aggregateTimeline', () => {
    const records = [
      { minute: '19:00', eventId: 'e1', shopId: 's1', menuItemId: 'm1', totalRevenue: 100, totalQuantity: 10, transactionCount: 5 },
      { minute: '19:00', eventId: 'e1', shopId: 's2', menuItemId: 'm2', totalRevenue: 50, totalQuantity: 5, transactionCount: 2 },
      { minute: '19:14', eventId: 'e1', shopId: 's1', menuItemId: 'm1', totalRevenue: 30, totalQuantity: 3, transactionCount: 1 },
      { minute: '19:30', eventId: 'e1', shopId: 's1', menuItemId: 'm1', totalRevenue: 20, totalQuantity: 2, transactionCount: 1 },
    ]
    const costMap = { m1: 4, m2: 2 }

    it('aggregates global per minute (1-min)', () => {
      const out = aggregateTimelinePerMinute(records, { menuItemCostMap: costMap })
      // expect 3 unique minutes: 19:00, 19:14, 19:30
      expect(out).toHaveLength(3)
      const p1900 = out.find((p) => p.minute === '19:00')
      expect(p1900.totalRevenue).toBe(150)
      // cost = 10*4 + 5*2 = 50
      expect(p1900.totalCost).toBe(50)
    })

    it('buckets to 15 minutes when requested', () => {
      const out = aggregateTimeline(records, {
        bucketMinutes: TIMELINE_BUCKET_STRATEGIES.MINUTE_15,
        groupBy: 'global',
        menuItemCostMap: costMap,
      })
      // 19:00 bucket merges 19:00 + 19:14 ; 19:30 stays alone
      expect(out).toHaveLength(2)
      const b1900 = out.find((p) => p.minute === '19:00')
      expect(b1900.totalRevenue).toBe(180)
      expect(b1900.totalQuantity).toBe(18)
      expect(b1900.transactionCount).toBe(8)
    })

    it('keeps one row per shop when groupBy="shop"', () => {
      const out = aggregateTimeline(records, {
        bucketMinutes: 15,
        groupBy: 'shop',
      })
      // 19:00 bucket: s1 (100+30) + s2 (50) ; 19:30: s1 (20)
      expect(out).toHaveLength(3)
      const s1AtNineteen = out.find((p) => p.minute === '19:00' && p.shopId === 's1')
      expect(s1AtNineteen.totalRevenue).toBe(130)
    })

    it('honors filter to drop records before bucketing', () => {
      const filter = buildTimelineFilter({ shopIds: ['s1'], range: { start: '19:00', end: '19:14' } })
      const out = aggregateTimeline(records, { bucketMinutes: 1, filter })
      expect(out).toHaveLength(2)
      const min = out.map((p) => p.minute).sort()
      expect(min).toEqual(['19:00', '19:14'])
    })

    it('preprocesses to canonical minute x event x version x shop x item records', () => {
      const out = preprocessTimelineRecords([
        {
          minute: '19:00',
          eventId: 'e1',
          configurationVersionId: 'v2',
          shopId: 's1',
          menuItemId: 'm1',
          itemName: 'Burger',
          totalRevenue: 100,
          totalQuantity: 10,
          transactionCount: 4,
          stockupQuantity: 12,
          inventoryQuantity: 3,
          discardedQuantity: 1,
        },
        {
          minute: '19:00',
          eventId: 'e1',
          configurationVersionId: 'v2',
          shopId: 's1',
          menuItemId: 'm1',
          totalRevenue: 25,
          totalQuantity: 2,
          transactionCount: 1,
        },
      ], { menuItemCostMap: costMap })

      expect(out).toHaveLength(1)
      expect(out[0]).toMatchObject({
        minute: '19:00',
        eventId: 'e1',
        configurationVersionId: 'v2',
        shopId: 's1',
        productId: 'm1',
        menuItemId: 'm1',
        totalRevenue: 125,
        totalQuantity: 12,
        transactionCount: 5,
        totalCost: 48,
        stockupQuantity: 12,
        inventoryQuantity: 3,
        discardedQuantity: 1,
      })
      expect(out[0].avgBasket).toBe(25)
    })

    it('passe shopType/shopArea de l’API à travers l’agrégation (dims PdV data-driven)', () => {
      const out = preprocessTimelineRecords([
        {
          minute: '19:00',
          eventId: 'e1',
          shopId: 's1',
          shopName: 'BAR EPHEMERE',
          shopType: 'bar',
          shopArea: 'Parvis',
          menuItemId: 'm1',
          itemName: 'Biere',
          totalRevenue: 10,
          totalQuantity: 1,
          transactionCount: 1,
        },
      ], {})
      expect(out).toHaveLength(1)
      expect(out[0].shopType).toBe('bar')
      expect(out[0].shopArea).toBe('Parvis')
    })

    it('préserve nature/subnature Weezevent pour assimilation taxonomique', () => {
      const out = preprocessTimelineRecords([
        {
          minute: '19:00',
          eventId: 'e1',
          shopId: 's1',
          menuItemId: 'm1',
          itemName: 'Cola',
          nature: 'DRINK',
          subnature: 'Soft Drinks',
          totalRevenue: 10,
          totalQuantity: 1,
        },
      ])
      expect(out[0]).toMatchObject({
        weezpayNature: 'DRINK',
        weezpaySubnature: 'Soft Drinks',
      })
    })
  })

  describe('buildTimelineFilter', () => {
    it('combines criteria with AND semantics; null/empty = neutral', () => {
      const f = buildTimelineFilter({})
      expect(f({ shopId: 'sX' })).toBe(true)

      const f2 = buildTimelineFilter({ shopIds: ['s1'], productIds: 'm1' })
      expect(f2({ shopId: 's1', menuItemId: 'm1' })).toBe(true)
      expect(f2({ shopId: 's1', menuItemId: 'm2' })).toBe(false)
      expect(f2({ shopId: 's2', menuItemId: 'm1' })).toBe(false)
    })

    it('filters by time range', () => {
      const f = buildTimelineFilter({ range: { start: '19:00', end: '19:30' } })
      expect(f({ minute: '18:59' })).toBe(false)
      expect(f({ minute: '19:15' })).toBe(true)
      expect(f({ minute: '19:31' })).toBe(false)
    })
  })

  describe('computeWindowRatios + windowPredictedRecords', () => {
    const timeline = [
      { minute: '19:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 60, totalQuantity: 6, transactionCount: 3 },
      { minute: '20:00', shopId: 's1', menuItemId: 'm1', totalRevenue: 40, totalQuantity: 4, transactionCount: 2 },
    ]
    const records = [
      { elementId: 's1', menuItemId: 'm1', quantity: 100, revenue: 1000, transactionCount: 50 },
    ]

    it('returns ratios per (shop, item)', () => {
      const { ratios, hasAnyTimeline } = computeWindowRatios(timeline, { start: '19:00', end: '19:59' })
      expect(hasAnyTimeline).toBe(true)
      const r = ratios.get('s1::m1')
      expect(r.rev).toBeCloseTo(0.6)
    })

    it('applies window when range is active', () => {
      const out = windowPredictedRecords(records, timeline, { start: '19:00', end: '19:59' })
      expect(out[0].revenue).toBeCloseTo(600)
      expect(out[0].quantity).toBeCloseTo(60)
    })

    it('no-ops when range is inactive', () => {
      const out = windowPredictedRecords(records, timeline, { start: null, end: null })
      expect(out).toBe(records)
    })
  })
})
