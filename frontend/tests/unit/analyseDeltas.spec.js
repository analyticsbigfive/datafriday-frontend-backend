import { pctDelta, ptsDelta, deltaTone, formatDelta } from '@/utils/analyseDeltas'

describe('pctDelta / ptsDelta', () => {
  it('pourcentage', () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20)
    expect(pctDelta(50, 100)).toBeCloseTo(-50)
  })
  it('null si référence nulle, absente ou valeur absente', () => {
    expect(pctDelta(10, 0)).toBeNull()
    expect(pctDelta(10, null)).toBeNull()
    expect(pctDelta(undefined, 5)).toBeNull()
    expect(pctDelta(NaN, 5)).toBeNull()
  })
  it('points', () => {
    expect(ptsDelta(62.5, 50)).toBeCloseTo(12.5)
    expect(ptsDelta(10, 0)).toBe(10)
    expect(ptsDelta(null, 5)).toBeNull()
  })
})

describe('deltaTone', () => {
  it('hausse bonne, baisse mauvaise', () => {
    expect(deltaTone(4.2)).toBe('good')
    expect(deltaTone(-4.2)).toBe('bad')
  })
  it('coût inversé : hausse mauvaise', () => {
    expect(deltaTone(4.2, { invert: true })).toBe('bad')
    expect(deltaTone(-4.2, { invert: true })).toBe('good')
  })
  it('sous 0,5 en valeur absolue ou absent : neutre', () => {
    expect(deltaTone(0.49)).toBe('neutral')
    expect(deltaTone(-0.49, { invert: true })).toBe('neutral')
    expect(deltaTone(0.5)).toBe('good')
    expect(deltaTone(null)).toBe('neutral')
  })
})

describe('formatDelta', () => {
  it('format français, virgule et une décimale', () => {
    expect(formatDelta(4.24)).toBe('▲ 4,2 %')
    expect(formatDelta(-1, 'pts')).toBe('▼ 1,0 pts')
    expect(formatDelta(12.5, 'pts')).toBe('▲ 12,5 pts')
  })
  it('— si absent', () => {
    expect(formatDelta(null)).toBe('—')
    expect(formatDelta(undefined, 'pts')).toBe('—')
    expect(formatDelta(Infinity)).toBe('—')
  })
})
