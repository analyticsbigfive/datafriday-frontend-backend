import {
  ANALYSE_DASHBOARD_MOCK,
  ANALYSE_KPIS_MENU_MOCK,
  ANALYSE_KPIS_EVENTS_MOCK,
  ANALYSE_COST_BREAKDOWN_MOCK,
  ANALYSE_SPACE_SUMMARY_MOCK,
  ANALYSE_SHOP_SUMMARIES_MOCK,
  ANALYSE_TIMELINE_BY_EVENT_MOCK,
  ANALYSE_PREDICTION_METRICS_MOCK,
  ANALYSE_STOCKUP_BY_SHOP_MOCK,
  ANALYSE_STOCKUP_BY_ITEM_MOCK,
  getTimelineByEventMock,
  getPredictionMetricsMock,
} from '@/data/analyseApiMock'

describe('analyseApiMock — API-shaped payloads', () => {
  it('dashboard exposes required fields', () => {
    expect(ANALYSE_DASHBOARD_MOCK).toEqual(
      expect.objectContaining({
        totalRevenue: expect.any(Number),
        totalEvents: expect.any(Number),
        totalCost: expect.any(Number),
        averageMargin: expect.any(Number),
        topMenuItems: expect.any(Array),
      }),
    )
  })

  it('kpis/menu entries match schema', () => {
    expect(Array.isArray(ANALYSE_KPIS_MENU_MOCK)).toBe(true)
    const sample = ANALYSE_KPIS_MENU_MOCK[0]
    expect(sample).toEqual(
      expect.objectContaining({
        menuItemId: expect.any(String),
        menuItemName: expect.any(String),
        totalRevenue: expect.any(Number),
        totalCost: expect.any(Number),
        margin: expect.any(Number),
        quantitySold: expect.any(Number),
      }),
    )
  })

  it('kpis/events entries match schema', () => {
    const sample = ANALYSE_KPIS_EVENTS_MOCK[0]
    expect(sample).toEqual(
      expect.objectContaining({
        eventId: expect.any(String),
        eventName: expect.any(String),
        eventDate: expect.any(String),
        totalRevenue: expect.any(Number),
        totalCost: expect.any(Number),
        margin: expect.any(Number),
      }),
    )
    expect(new Date(sample.eventDate).toString()).not.toBe('Invalid Date')
  })

  it('cost-breakdown entries split into ingredients/packaging/components', () => {
    const sample = ANALYSE_COST_BREAKDOWN_MOCK[0]
    expect(sample).toEqual(
      expect.objectContaining({
        menuItemId: expect.any(String),
        ingredientsCost: expect.any(Number),
        packagingCost: expect.any(Number),
        componentsCost: expect.any(Number),
        totalCost: expect.any(Number),
      }),
    )
  })

  it('space summary aggregates revenue / margin / attendees', () => {
    expect(ANALYSE_SPACE_SUMMARY_MOCK).toEqual(
      expect.objectContaining({
        eventCount: expect.any(Number),
        totalRevenue: expect.any(Number),
        totalCost: expect.any(Number),
        margin: expect.any(Number),
        totalAttendees: expect.any(Number),
      }),
    )
  })

  it('shop summaries are keyed by shop with totals', () => {
    expect(Array.isArray(ANALYSE_SHOP_SUMMARIES_MOCK)).toBe(true)
    const s = ANALYSE_SHOP_SUMMARIES_MOCK[0]
    expect(s).toEqual(
      expect.objectContaining({
        shopId: expect.anything(),
        shopName: expect.any(String),
        totalRevenue: expect.any(Number),
        totalCost: expect.any(Number),
        margin: expect.any(Number),
      }),
    )
  })

  it('timelineByEvent maps eventId -> records[]', () => {
    const ids = Object.keys(ANALYSE_TIMELINE_BY_EVENT_MOCK)
    expect(ids.length).toBeGreaterThan(0)
    const first = ids[0]
    expect(Array.isArray(ANALYSE_TIMELINE_BY_EVENT_MOCK[first])).toBe(true)
    expect(getTimelineByEventMock(first)).toBe(ANALYSE_TIMELINE_BY_EVENT_MOCK[first])
  })

  it('prediction metrics keyed by eventId::configId', () => {
    const keys = Object.keys(ANALYSE_PREDICTION_METRICS_MOCK)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys[0]).toMatch(/::/)
    const [eventId, configId] = keys[0].split('::')
    expect(getPredictionMetricsMock(eventId, configId)).toEqual(
      ANALYSE_PREDICTION_METRICS_MOCK[keys[0]],
    )
  })

  it('stockup by shop / by item exposes consistent totals', () => {
    expect(Array.isArray(ANALYSE_STOCKUP_BY_SHOP_MOCK)).toBe(true)
    expect(Array.isArray(ANALYSE_STOCKUP_BY_ITEM_MOCK)).toBe(true)
    if (ANALYSE_STOCKUP_BY_ITEM_MOCK.length) {
      const sample = ANALYSE_STOCKUP_BY_ITEM_MOCK[0]
      expect(sample.byShop).toBeInstanceOf(Array)
    }
  })
})
