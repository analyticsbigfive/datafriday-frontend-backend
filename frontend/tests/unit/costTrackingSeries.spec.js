import {
  buildChartModel,
  buildLineSeries,
  buildStepPoints,
  computeVariation,
  daysInRange,
  eventLabelVisibility,
  layoutEvents,
  linearScale,
  marginPercent,
  monthTicks,
  niceTicks,
  periodBounds,
  rangeForDays,
  stepPath,
  summarizeLine,
  summarizeLines,
  valueAt,
  DAY_MS,
} from '@/utils/costTrackingSeries'

const line = (points, extra = {}) => ({ key: 'article:a', name: 'A', kind: 'article', points, ...extra })
const pt = (at, costPerPiece, extra = {}) => ({ at, costPerPiece, price: 9.5, ...extra })

describe('periode', () => {
  it('la borne droite est la fin du jour to', () => {
    const [t0, t1] = periodBounds('2026-03-01', '2026-03-02')
    expect(t1 - t0).toBe(2 * DAY_MS)
  })
  it('rangeForDays inclut aujourd hui et plafonne a 366', () => {
    const r = rangeForDays(30, new Date(2026, 5, 30))
    expect(r.to).toBe('2026-06-30')
    expect(daysInRange(r.from, r.to)).toBe(30)
    expect(daysInRange(rangeForDays(9999, new Date(2026, 5, 30)).from, '2026-06-30')).toBe(366)
  })
})

describe('buildStepPoints / buildLineSeries', () => {
  it('trie, ignore les points sans cout et conserve carried', () => {
    const pts = buildStepPoints(line([
      pt('2026-05-12T08:00:00.000Z', 1.4),
      pt('2026-03-01T00:00:00.000Z', 1.25, { carried: true }),
      pt('2026-04-01T00:00:00.000Z', null),
    ]))
    expect(pts.map((p) => p.cost)).toEqual([1.25, 1.4])
    expect(pts[0].carried).toBe(true)
  })

  it('prolonge le dernier point jusqu a t1 et ecarte les points apres t1', () => {
    const t1 = Date.parse('2026-06-01T00:00:00.000Z')
    const s = buildLineSeries(line([
      pt('2026-03-01T00:00:00.000Z', 1),
      pt('2026-07-01T00:00:00.000Z', 2),
    ]), t1)
    expect(s.points).toHaveLength(1)
    expect(s.end).toEqual({ t: t1, cost: 1, price: 9.5 })
  })

  it('ligne sans point : end null', () => {
    const s = buildLineSeries(line([]), 1000)
    expect(s.end).toBeNull()
    expect(s.first).toBeNull()
  })

  it('valueAt renvoie la version en vigueur', () => {
    const pts = buildStepPoints(line([pt('2026-03-01T00:00:00.000Z', 1), pt('2026-04-01T00:00:00.000Z', 2)]))
    expect(valueAt(pts, Date.parse('2026-02-01T00:00:00.000Z'))).toBeNull()
    expect(valueAt(pts, Date.parse('2026-03-15T00:00:00.000Z')).cost).toBe(1)
    expect(valueAt(pts, Date.parse('2026-04-01T00:00:00.000Z')).cost).toBe(2)
  })
})

describe('computeVariation / marginPercent', () => {
  it('hausse, baisse, stable', () => {
    expect(computeVariation(1, 1.5)).toEqual({ abs: 0.5, pct: 50, direction: 'up' })
    expect(computeVariation(2, 1).direction).toBe('down')
    expect(computeVariation(100, 100.01).direction).toBe('flat')
  })
  it('base nulle : pct null', () => {
    expect(computeVariation(0, 1)).toEqual({ abs: 1, pct: null, direction: 'up' })
  })
  it('valeur absente : null', () => {
    expect(computeVariation(null, 1)).toBeNull()
  })
  it('marge avec TVA', () => {
    expect(marginPercent(2, 10)).toBeCloseTo(80)
    expect(marginPercent(5, 11, 10)).toBeCloseTo(50)
    expect(marginPercent(1, null)).toBeNull()
  })
})

describe('summarize', () => {
  const t1 = Date.parse('2026-07-01T00:00:00.000Z')
  it('versions = points non reportes', () => {
    const s = summarizeLine(line([
      pt('2026-03-01T00:00:00.000Z', 1, { carried: true }),
      pt('2026-04-01T00:00:00.000Z', 1.5),
    ]), t1)
    expect(s.versions).toBe(1)
    expect(s.startCost).toBe(1)
    expect(s.currentCost).toBe(1.5)
    expect(s.variation.pct).toBe(50)
  })
  it('agregats hausses / baisses et lignes vides ignorees', () => {
    const r = summarizeLines([
      line([pt('2026-03-01T00:00:00.000Z', 1), pt('2026-04-01T00:00:00.000Z', 2)], { key: 'a' }),
      line([pt('2026-03-01T00:00:00.000Z', 2), pt('2026-04-01T00:00:00.000Z', 1)], { key: 'b' }),
      line([], { key: 'c' }),
    ], t1)
    expect(r.count).toBe(2)
    expect(r.increases).toBe(1)
    expect(r.decreases).toBe(1)
    expect(r.versions).toBe(4)
  })
})

describe('niceTicks / echelles', () => {
  it('ticks croissants couvrant les bornes', () => {
    const t = niceTicks(1.07, 1.93, 5)
    expect(t[0]).toBeLessThanOrEqual(1.07)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1.93)
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
  })
  it('valeurs rondes', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10])
  })
  it('gere min == max et grandes valeurs', () => {
    expect(niceTicks(3, 3, 4).length).toBeGreaterThan(1)
    const big = niceTicks(0, 1234, 5)
    expect(big[big.length - 1]).toBeGreaterThanOrEqual(1234)
  })
  it('linearScale et domaine nul', () => {
    const f = linearScale(0, 10, 0, 100)
    expect(f(5)).toBe(50)
    expect(linearScale(3, 3, 0, 100)(3)).toBe(50)
  })
  it('monthTicks : 1er du mois dans la fenetre, eclaircis', () => {
    const t0 = Date.UTC(2026, 0, 15)
    const t1 = Date.UTC(2026, 11, 31)
    const all = monthTicks(t0, t1, 99)
    expect(all).toHaveLength(11)
    expect(all[0]).toBe(Date.UTC(2026, 1, 1))
    expect(monthTicks(t0, t1, 4).length).toBeLessThanOrEqual(4)
  })
})

describe('etiquettes d events', () => {
  it('supprime celles a moins de 17 px de la derniere visible', () => {
    expect(eventLabelVisibility([0, 10, 16, 17, 40, 50])).toEqual([true, false, false, true, true, false])
  })
  it('17 px exactement : visible', () => {
    expect(eventLabelVisibility([0, 17])).toEqual([true, true])
  })
  it('layoutEvents trie, filtre la fenetre et calcule la visibilite', () => {
    const x = linearScale(0, 1000, 0, 1000)
    const iso = (ms) => new Date(ms).toISOString()
    const out = layoutEvents([
      { id: 'b', name: 'B', referenceAt: iso(105) },
      { id: 'a', name: 'A', referenceAt: iso(100) },
      { id: 'z', name: 'Z', referenceAt: iso(5000) },
      { id: 'c', name: 'C', referenceAt: iso(200) },
    ], x, 0, 1000)
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(out.map((e) => e.labelVisible)).toEqual([true, false, true])
  })
})

describe('stepPath / buildChartModel', () => {
  const id = (v) => v
  it('escalier et prolongement jusqu a tEnd', () => {
    const d = stepPath([{ t: 0, cost: 5 }, { t: 10, cost: 7 }], id, id, 20)
    expect(d).toBe('M0,5H10V7H20')
  })
  it('chemin vide sans points', () => {
    expect(stepPath([], id, id, 20)).toBe('')
  })
  it('modele : chemin, point terminal sur la borne droite, ticks', () => {
    const t0 = Date.UTC(2026, 0, 1)
    const t1 = Date.UTC(2026, 3, 1)
    const s = buildLineSeries(line([
      pt('2026-01-01T00:00:00.000Z', 1, { carried: true }),
      pt('2026-02-01T00:00:00.000Z', 2),
    ]), t1)
    const m = buildChartModel([s], { t0, t1, width: 600, height: 300 })
    expect(m.hasData).toBe(true)
    expect(m.paths[0].d.startsWith('M56,')).toBe(true)
    expect(m.paths[0].endDot.x).toBe(600 - 16)
    expect(m.paths[0].dots).toEqual([])
    expect(m.yTicks.length).toBeGreaterThan(2)
    expect(m.xTicks.length).toBeGreaterThan(0)
  })
  it('modele sans donnee : pas d erreur', () => {
    const m = buildChartModel([], { t0: 0, t1: 100, width: 300, height: 200 })
    expect(m.hasData).toBe(false)
    expect(m.paths).toEqual([])
  })
})
