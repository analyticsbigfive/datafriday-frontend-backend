import { latestMinuteLocal, mergeSince, minuteLocalMinus } from '@/utils/liveDelta'

describe('liveDelta', () => {
  it('latestMinuteLocal : dernière minute, lignes sans minute ignorées', () => {
    expect(latestMinuteLocal([{ minuteLocal: '2026-10-10T19:58' }, { minuteLocal: null }, { minuteLocal: '2026-10-10T20:01' }]))
      .toBe('2026-10-10T20:01')
    expect(latestMinuteLocal([])).toBe(null)
  })

  it('minuteLocalMinus : franchit l\'heure et minuit', () => {
    expect(minuteLocalMinus('2026-10-10T20:02', 5)).toBe('2026-10-10T19:57')
    expect(minuteLocalMinus('2026-10-11T00:03', 5)).toBe('2026-10-10T23:58')
    expect(minuteLocalMinus('bad', 5)).toBe(null)
  })

  it('mergeSince : remplace la fenêtre récente sans doublon, garde le passé', () => {
    const previous = [
      { minuteLocal: '2026-10-10T19:55', q: 1 },
      { minuteLocal: '2026-10-10T19:58', q: 2 },
      { minuteLocal: null, q: 3 },
    ]
    const fresh = [{ minuteLocal: '2026-10-10T19:58', q: 20 }, { minuteLocal: '2026-10-10T19:59', q: 30 }, { minuteLocal: null, q: 4 }]
    expect(mergeSince(previous, fresh, '2026-10-10T19:57').map((r) => r.q)).toEqual([1, 20, 30, 4])
  })
})
