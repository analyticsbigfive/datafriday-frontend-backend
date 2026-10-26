import { cadenceBand, computeCadence, cumulativeFraction, buildCadenceRecords } from '@/utils/liveCadence'

const curve = { v: 1, grain: 'minute', m: ['18:00', '18:01', '18:02', '18:03'], q: [10, 10, 10, 10], r: [0, 0, 0, 0] }
const at = (h, m) => new Date(2026, 9, 26, h, m)

// pred = 100, vendu = 100 + pct
const pctFor = (pct) => computeCadence({ soldUnits: 100 + pct, predictedToMinuteUnits: 100, remainingUnits: 50, minuteLabel: '18:00' })

describe('bandes de cadence', () => {
  it.each([
    [-30, 'ok'], [0, 'ok'], [1, 'orange'], [20, 'orange'], [21, 'red'], [40, 'red'], [41, 'violet'],
  ])('pct %i => %s', (pct, band) => {
    const c = pctFor(pct)
    expect(c.pct).toBe(pct)
    expect(c.band).toBe(band)
    expect(cadenceBand(pct)).toBe(band)
  })
  it('arrondit avant de choisir la bande', () => {
    expect(pctFor(0.4).band).toBe('ok')
    expect(pctFor(20.4).band).toBe('orange')
    expect(pctFor(40.6).band).toBe('violet')
  })
})

describe('computeCadence', () => {
  it('prévu à m = 0 => null', () => {
    expect(computeCadence({ soldUnits: 5, predictedToMinuteUnits: 0, remainingUnits: 10, minuteLabel: '18:00' })).toBeNull()
  })
  it('calcule restant à cadence constante et restock', () => {
    const c = computeCadence({ soldUnits: 120, predictedToMinuteUnits: 100, remainingUnits: 50, minuteLabel: '18:02' })
    expect(c.remainingAtSameCadenceUnits).toBeCloseTo(60)
    expect(c.toRestockUnits).toBeCloseTo(10)
    expect(c.minuteLabel).toBe('18:02')
  })
  it('restock jamais négatif quand on vend moins vite', () => {
    const c = computeCadence({ soldUnits: 40, predictedToMinuteUnits: 100, remainingUnits: 50, minuteLabel: '18:00' })
    expect(c.pct).toBe(-60)
    expect(c.toRestockUnits).toBe(0)
    expect(c.remainingAtSameCadenceUnits).toBeCloseTo(20)
  })
})

describe('cumulativeFraction', () => {
  it('courbe absente => null', () => {
    expect(cumulativeFraction(null, at(18, 1))).toBeNull()
    expect(cumulativeFraction({ m: [], q: [], r: [] }, at(18, 1))).toBeNull()
  })
  it('fraction cumulée à la minute courante', () => {
    expect(cumulativeFraction(curve, at(18, 1))).toEqual({ fraction: 0.5, minuteLabel: '18:01' })
  })
  it('borne à la plage', () => {
    expect(cumulativeFraction(curve, at(23, 0)).fraction).toBe(1)
    expect(cumulativeFraction(curve, at(10, 0)).fraction).toBe(0)
  })
  it('clés datées', () => {
    const dated = { ...curve, m: curve.m.map((x) => `2026-10-26T${x}`) }
    expect(cumulativeFraction(dated, at(18, 2)).fraction).toBe(0.75)
  })
})

describe('buildCadenceRecords', () => {
  it('prévu x fraction et vendu par ligne', () => {
    const out = buildCadenceRecords({
      fullRecords: [{ shopId: 's1', menuItemId: 'a', totalQuantity: 100 }],
      shops: [{ id: 's1', name: 'S1' }],
      fraction: 0.5,
      soldFn: () => 70,
    })
    expect(out.predictedAtM[0].totalQuantity).toBe(50)
    expect(out.sold[0].totalQuantity).toBe(70)
  })
})
