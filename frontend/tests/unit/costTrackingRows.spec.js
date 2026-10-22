import {
  buildRows,
  nearestEvent,
  rankVariations,
  recentChanges,
  tooltipRows,
} from '@/utils/costTrackingRows'
import { diffRecipe, reasonKind, reasonLabelKey } from '@/utils/costTrackingRecipeDiff'
import { buildMarginCurves } from '@/utils/costTrackingMarginCurve'
import { buildLineSeries, linearScale } from '@/utils/costTrackingSeries'

const T1 = Date.parse('2026-06-30T23:59:59Z')
const pt = (at, cost, extra = {}) => ({ at, costPerPiece: cost, price: 10, ...extra })
const line = (key, points, extra = {}) => ({ key, id: key.split(':')[1], name: key, kind: 'article', points, ...extra })

const lines = [
  line('article:a', [
    pt('2026-03-01T00:00:00Z', 2, { carried: true, reason: 'baseline' }),
    pt('2026-05-01T00:00:00Z', 2.5, { reason: 'market_price' }),
  ]),
  line('article:b', [
    pt('2026-03-01T00:00:00Z', 4, { carried: true }),
    pt('2026-04-01T00:00:00Z', 3, { reason: 'recipe_edit' }),
  ]),
  line('article:c', []),
]

describe('buildRows', () => {
  it('ignore les lignes sans point et calcule variation, marge et versions', () => {
    const rows = buildRows(lines, T1)
    expect(rows.map((r) => r.key)).toEqual(['article:a', 'article:b'])
    const a = rows[0]
    expect(a.startCost).toBe(2)
    expect(a.currentCost).toBe(2.5)
    expect(a.variation.pct).toBeCloseTo(25)
    expect(a.versions).toBe(1)
    expect(a.marginStart).toBeCloseTo(80)
    expect(a.marginEnd).toBeCloseTo(75)
    expect(a.marginDelta).toBeCloseTo(-5)
  })
})

describe('classements', () => {
  const rows = buildRows(lines, T1)
  it('hausses et baisses triées par amplitude', () => {
    expect(rankVariations(rows, 'up').map((r) => r.key)).toEqual(['article:a'])
    expect(rankVariations(rows, 'down').map((r) => r.key)).toEqual(['article:b'])
  })
  it('respecte la limite', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, variation: { pct: i + 1, direction: 'up' } }))
    const top = rankVariations(many, 'up', 5)
    expect(top).toHaveLength(5)
    expect(top[0].key).toBe('k7')
  })
})

describe('recentChanges', () => {
  it('liste les vraies versions, la plus récente en premier, sans les points reportés', () => {
    const out = recentChanges(lines, 6)
    expect(out.map((c) => c.lineKey)).toEqual(['article:a', 'article:b'])
    expect(out[0].reason).toBe('market_price')
    expect(out[0].from).toBe(2)
    expect(out[0].to).toBe(2.5)
    expect(out[1].direction).toBe('down')
  })
  it('limite le nombre de lignes', () => {
    expect(recentChanges(lines, 1)).toHaveLength(1)
  })
})

describe('infobulle', () => {
  const series = lines.slice(0, 2).map((l, i) => ({ ...buildLineSeries(l, T1), colorIndex: i }))
  it('valeur en vigueur par courbe, la plus chère en premier', () => {
    const rows = tooltipRows(series, Date.parse('2026-04-15T00:00:00Z'))
    expect(rows.map((r) => r.key)).toEqual(['article:b', 'article:a'])
    expect(rows[0].cost).toBe(3)
    expect(rows[1].cost).toBe(2)
  })
  it('ignore une courbe sans valeur à cet instant', () => {
    expect(tooltipRows(series, Date.parse('2025-01-01T00:00:00Z'))).toEqual([])
  })
  it('nearestEvent respecte le rayon', () => {
    const events = [{ id: 'e1', x: 100 }, { id: 'e2', x: 108 }]
    expect(nearestEvent(events, 106).id).toBe('e2')
    expect(nearestEvent(events, 200)).toBeNull()
  })
})

describe('diffRecipe', () => {
  const base = [
    { kind: 'ingredient', refId: 'i1', name: 'Steak', quantity: 1, unitCost: 1.4 },
    { kind: 'packaging', refId: 'p1', name: 'Boite', quantity: 1, unitCost: 0.1 },
  ]
  it('détecte prix, quantité, ajout et retrait', () => {
    const next = [
      { kind: 'ingredient', refId: 'i1', name: 'Steak', quantity: 2, unitCost: 1.5 },
      { kind: 'ingredient', refId: 'i2', name: 'Cheddar', quantity: 1, unitCost: 0.2 },
    ]
    const types = diffRecipe(next, base).map((d) => `${d.type}:${d.name}`)
    expect(types).toEqual(['unit:Steak', 'qty:Steak', 'added:Cheddar', 'removed:Boite'])
  })
  it('recette identique ou absente : aucune différence', () => {
    expect(diffRecipe(base, base)).toEqual([])
    expect(diffRecipe(base, null)).toEqual([])
  })
  it('familles et clés de cause', () => {
    expect(reasonKind('market_price')).toBe('market')
    expect(reasonKind('combo_edit')).toBe('recipe')
    expect(reasonKind('baseline')).toBe('base')
    expect(reasonLabelKey('recipe_edit')).toBe('ctReasonRecipeEdit')
    expect(reasonLabelKey('inconnue')).toBe('ctReasonOther')
  })
})

describe('buildMarginCurves', () => {
  it('trace une courbe par ligne et ses repères', () => {
    const series = lines.slice(0, 2).map((l, i) => ({ ...buildLineSeries(l, T1), colorIndex: i }))
    const x = linearScale(0, 100, 0, 100)
    const out = buildMarginCurves(series, { x: (t) => x((t % 100)), margin: { t: 14 }, innerHeight: 300, t1: T1 })
    expect(out.paths).toHaveLength(2)
    expect(out.paths[0].d.startsWith('M')).toBe(true)
    expect(out.ticks.length).toBeGreaterThan(1)
  })
  it('sans prix exploitable : rien à tracer', () => {
    const s = [{ key: 'k', colorIndex: 0, points: [{ t: 1, cost: 1, price: null }] }]
    expect(buildMarginCurves(s, { x: (t) => t, margin: { t: 0 }, innerHeight: 100, t1: 2 })).toEqual({ ticks: [], paths: [] })
  })
})
