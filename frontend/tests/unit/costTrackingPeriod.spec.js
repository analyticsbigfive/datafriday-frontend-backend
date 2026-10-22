import { PERIOD_PRESETS, rangeForPreset, MAX_PERIOD_DAYS } from '@/utils/costTrackingPeriod'
import { daysInRange } from '@/utils/costTrackingSeries'

const now = new Date(2026, 9, 23)

describe('costTrackingPeriod', () => {
  it('propose les mêmes options que l Analyse', () => {
    expect(PERIOD_PRESETS).toEqual(expect.arrayContaining(['all', 'last12months', 'lastmonth', 'thisyear', 'quarter']))
    expect(PERIOD_PRESETS).not.toContain('custom')
  })
  it('résout 12 mois glissants et le mois dernier', () => {
    expect(rangeForPreset('last12months', now)).toEqual({ from: '2025-10-23', to: '2026-10-23' })
    expect(rangeForPreset('lastmonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })
  it('plafonne tout l historique', () => {
    const r = rangeForPreset('all', now)
    expect(daysInRange(r.from, r.to)).toBe(MAX_PERIOD_DAYS)
  })
})
