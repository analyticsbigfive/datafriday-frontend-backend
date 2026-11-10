import { pickPredictTimeline } from '@/utils/comparisonPredictTimeline'

const snapshot = { v: 1, grain: 'minute', m: ['12:00', '12:01'], q: [3, 5], r: [30, 50] }
const ev = (id) => ({ id, eventName: `E${id}` })
const versions = (v) => new Map([['e1', v]])

describe('pickPredictTimeline', () => {
  it('un seul event, base ajustée, courbe présente : renvoie les lignes minute', () => {
    const out = pickPredictTimeline({
      isPredict: true, events: [ev('e1')], versionByEventId: versions({ predictedTimeline: snapshot }), basis: 'adjusted',
    })
    expect(out.event.id).toBe('e1')
    expect(out.rows).toHaveLength(2)
    expect(out.rows[1]).toMatchObject({ totalQuantity: 5, totalRevenue: 50 })
  })
  it('base par défaut = ajustée', () => {
    expect(pickPredictTimeline({
      isPredict: true, events: [ev('e1')], versionByEventId: versions({ predictedTimeline: snapshot }),
    })).not.toBeNull()
  })
  it('base algo : barres (pas de courbe brute)', () => {
    expect(pickPredictTimeline({
      isPredict: true, events: [ev('e1')], versionByEventId: versions({ predictedTimeline: snapshot }), basis: 'algo',
    })).toBeNull()
  })
  it('plusieurs events : barres', () => {
    expect(pickPredictTimeline({
      isPredict: true, events: [ev('e1'), ev('e2')], versionByEventId: versions({ predictedTimeline: snapshot }),
    })).toBeNull()
  })
  it('version sans courbe (ancienne) : barres', () => {
    expect(pickPredictTimeline({ isPredict: true, events: [ev('e1')], versionByEventId: versions({ predictedTimeline: null }) })).toBeNull()
    expect(pickPredictTimeline({ isPredict: true, events: [ev('e1')], versionByEventId: versions(null) })).toBeNull()
  })
  it('hors Predict : jamais', () => {
    expect(pickPredictTimeline({ isPredict: false, events: [ev('e1')], versionByEventId: versions({ predictedTimeline: snapshot }) })).toBeNull()
  })
})
