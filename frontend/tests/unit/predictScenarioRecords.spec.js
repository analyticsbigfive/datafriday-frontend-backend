import { scenarioRecordsToAnalyseRecords } from '@/utils/predictScenarioRecords'

const EVENT = { id: 'ev-1', eventName: 'Match 1', eventDate: '12/08/2026' }

describe('scenarioRecordsToAnalyseRecords', () => {
  it('maps totalQuantity/totalRevenue to quantity/revenue', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [
        { shopId: 'el-1', shop: 'Comptoir Sud', menuItemId: 'mi-1', itemName: 'Budweiser 45cl', totalQuantity: 120, totalRevenue: 840 },
      ],
    }
    const [rec] = scenarioRecordsToAnalyseRecords(version, EVENT)
    expect(rec).toMatchObject({
      eventId: 'ev-1',
      eventName: 'Match 1',
      eventDate: '12/08/2026',
      shopName: 'Comptoir Sud',
      menuItemId: 'mi-1',
      menuItemName: 'Budweiser 45cl',
      itemName: 'Budweiser 45cl',
      quantity: 120,
      revenue: 840,
      isPredictive: true,
      fromVersionId: 'v-1',
    })
  })

  it('falls back to elementNameById when shop is null (manual quantities)', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [
        { shopId: 'el-9', shop: null, menuItemId: 'mi-2', itemName: 'Hot dog', totalQuantity: 10, totalRevenue: 50 },
      ],
    }
    const elementNameById = new Map([['el-9', 'Kiosque Nord']])
    const [rec] = scenarioRecordsToAnalyseRecords(version, EVENT, { elementNameById })
    expect(rec.shopName).toBe('Kiosque Nord')
    expect(rec.elementName).toBe('Kiosque Nord')
  })

  it('leaves shopName empty when neither shop nor element name resolves', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [{ shopId: 'el-x', menuItemId: 'mi-3', itemName: 'Café', totalQuantity: 1, totalRevenue: 2 }],
    }
    expect(scenarioRecordsToAnalyseRecords(version, EVENT)[0].shopName).toBe('')
  })

  it('uses mappedMenuItemId when menuItemId is absent', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [
        { shopId: 'el-1', menuItemId: null, mappedMenuItemId: 'mi-map', itemName: 'Frites', totalQuantity: 5, totalRevenue: 15 },
      ],
    }
    const [rec] = scenarioRecordsToAnalyseRecords(version, EVENT)
    expect(rec.menuItemId).toBe('mi-map')
    expect(rec.mappedMenuItemId).toBe('mi-map')
  })

  it('skips entries with neither menuItemId nor itemName (would land in « non rattachés »)', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [
        { shopId: 'el-1', totalQuantity: 3, totalRevenue: 9 },
        { shopId: 'el-1', menuItemId: 'mi-1', itemName: 'Bière', totalQuantity: 3, totalRevenue: 9 },
      ],
    }
    expect(scenarioRecordsToAnalyseRecords(version, EVENT)).toHaveLength(1)
  })

  it('coerces non-numeric quantities/revenues to 0', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [
        { shopId: 'el-1', menuItemId: 'mi-1', itemName: 'Bière', totalQuantity: undefined, totalRevenue: 'NaN' },
      ],
    }
    const [rec] = scenarioRecordsToAnalyseRecords(version, EVENT)
    expect(rec.quantity).toBe(0)
    expect(rec.revenue).toBe(0)
  })

  it('returns [] when predictedRecords is missing, empty or not an array', () => {
    expect(scenarioRecordsToAnalyseRecords({ id: 'v-1' }, EVENT)).toEqual([])
    expect(scenarioRecordsToAnalyseRecords({ id: 'v-1', predictedRecords: [] }, EVENT)).toEqual([])
    expect(scenarioRecordsToAnalyseRecords({ id: 'v-1', predictedRecords: {} }, EVENT)).toEqual([])
    expect(scenarioRecordsToAnalyseRecords(null, EVENT)).toEqual([])
  })

  it('returns [] when the event has no id (record would be unattachable)', () => {
    const version = {
      id: 'v-1',
      predictedRecords: [{ shopId: 'el-1', menuItemId: 'mi-1', itemName: 'Bière', totalQuantity: 1, totalRevenue: 1 }],
    }
    expect(scenarioRecordsToAnalyseRecords(version, {})).toEqual([])
  })
})
