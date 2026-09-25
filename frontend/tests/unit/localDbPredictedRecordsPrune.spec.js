import {
  setPredictedRecords,
  predictedRecordsKey,
  MAX_PREDICTED_RECORDS_ENTRIES,
  setEventPredictVersionsMirror,
  getEventPredictVersions,
} from '@/data/localDb'

describe('localDb : cache Event Predict plafonné', () => {
  beforeEach(() => localStorage.clear())

  it('le pont garde seulement les entrées les plus récentes', () => {
    const total = MAX_PREDICTED_RECORDS_ENTRIES + 3
    for (let i = 0; i < total; i++) {
      setPredictedRecords('space', `ev${i}`, 'current', { ts: i, records: [{ q: i }] })
    }
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('datafriday:predicted-records:'))
    expect(keys).toHaveLength(MAX_PREDICTED_RECORDS_ENTRIES)
    expect(localStorage.getItem(predictedRecordsKey('space', 'ev0', 'current'))).toBeNull()
    expect(localStorage.getItem(predictedRecordsKey('space', `ev${total - 1}`, 'current'))).not.toBeNull()
  })

  it('le miroir des versions ne stocke plus les predictedRecords', () => {
    setEventPredictVersionsMirror('ev1', [{ id: 'v1', name: 'Test TS', predictedRecords: [{ q: 1 }] }], 'v1')
    expect(getEventPredictVersions('ev1')).toEqual([{ id: 'v1', name: 'Test TS' }])
  })
})
