import { alignTrendByRank, trendFromEventSeries } from '@/utils/comparisonTrend'

const trend = [
  { value: 100, label: 'A' },
  { value: 300, label: 'B' },
  { value: 200, label: 'C' },
]

describe('comparisonTrend', () => {
  it('tri par date : garde l ordre chronologique reçu, rang pour rang', () => {
    expect(alignTrendByRank(trend, 'date', 3).map((p) => p.label)).toEqual(['A', 'B', 'C'])
  })

  it('tri par CA : classe le principal par CA décroissant, rang pour rang', () => {
    expect(alignTrendByRank(trend, 'revenue', 3).map((p) => p.label)).toEqual(['B', 'C', 'A'])
  })

  it('ne mute pas la tendance reçue', () => {
    const copy = JSON.parse(JSON.stringify(trend))
    alignTrendByRank(trend, 'revenue', 3)
    expect(trend).toEqual(copy)
  })

  it('met null quand le principal a moins d events que les barres, ignore le surplus', () => {
    expect(alignTrendByRank(trend, 'date', 5)).toEqual([trend[0], trend[1], trend[2], null, null])
    expect(alignTrendByRank(trend, 'date', 2)).toHaveLength(2)
  })

  it('accepte une tendance absente', () => {
    expect(alignTrendByRank(null, 'date', 2)).toEqual([null, null])
  })

  it('trendFromEventSeries produit valeur et libellé nom + date locale', () => {
    const out = trendFromEventSeries([{ name: 'PSG', date: '2026-10-03', revenue: 1200.5 }])
    expect(out[0].value).toBe(1200.5)
    expect(out[0].name).toBe('PSG')
    expect(out[0].label.startsWith('PSG ')).toBe(true)
  })
})
