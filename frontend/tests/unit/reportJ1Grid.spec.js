import { occupiedCells, canPlace, cellStates, placeSlot, removeSlot, placementBlocker } from '@/utils/reportJ1Grid'
import { sizeOf, isKnownVariant, REPORT_J1_KINDS } from '@/utils/reportJ1Page2Catalog'

const empty = () => ({ version: 1, slots: [] })
const slot = (id, kind, col, row) => ({ id, kind, variant: null, col, row, filters: {}, options: {} })

describe('catalogue', () => {
  it('tailles du contrat', () => {
    expect(sizeOf('kpi-bar')).toEqual({ w: 2, h: 1 })
    expect(sizeOf('donut')).toEqual({ w: 1, h: 1 })
    expect(sizeOf('perf-table')).toEqual({ w: 1, h: 2 })
    expect(sizeOf('revenue-bars')).toEqual({ w: 2, h: 2 })
    expect(sizeOf('inconnu')).toBeNull()
  })
  it('variantes', () => {
    expect(isKnownVariant('donut', 'brand')).toBe(true)
    expect(isKnownVariant('donut', 'nope')).toBe(false)
    expect(isKnownVariant('kpi-bar', null)).toBe(true)
    expect(Object.keys(REPORT_J1_KINDS)).toHaveLength(6)
  })
})

describe('occupiedCells', () => {
  it('couvre toute l emprise du slot', () => {
    const cells = occupiedCells({ slots: [slot('a', 'perf-table', 1, 0)] })
    expect([...cells.keys()].sort()).toEqual(['1,0', '1,1'])
    expect(cells.get('1,1')).toBe('a')
  })
  it('layout vide ou absent', () => {
    expect(occupiedCells(empty()).size).toBe(0)
    expect(occupiedCells(null).size).toBe(0)
  })
})

describe('canPlace', () => {
  it('largeur 2 impossible en colonne 1', () => {
    expect(canPlace(empty(), 'kpi-bar', 1, 0)).toBe(false)
    expect(placementBlocker(empty(), 'kpi-bar', 1, 0)).toBe('overflow-cols')
    expect(canPlace(empty(), 'kpi-bar', 0, 2)).toBe(true)
  })
  it('hauteur 2 impossible en dernière rangée', () => {
    expect(placementBlocker(empty(), 'perf-table', 0, 2)).toBe('overflow-rows')
    expect(canPlace(empty(), 'revenue-bars', 0, 1)).toBe(true)
    expect(canPlace(empty(), 'revenue-bars', 0, 2)).toBe(false)
  })
  it('chevauchement', () => {
    const layout = { slots: [slot('a', 'donut', 1, 1)] }
    expect(placementBlocker(layout, 'revenue-bars', 0, 0)).toBe('overlap')
    expect(canPlace(layout, 'donut', 0, 1)).toBe(true)
  })
  it('entrées invalides', () => {
    expect(canPlace(empty(), 'donut', -1, 0)).toBe(false)
    expect(canPlace(empty(), 'donut', 0, 3)).toBe(false)
    expect(canPlace(empty(), 'x', 0, 0)).toBe(false)
  })
})

describe('cellStates', () => {
  it('6 cases dans l ordre de lecture', () => {
    const states = cellStates(empty(), 'donut')
    expect(states).toHaveLength(6)
    expect(states.map((s) => `${s.col},${s.row}`)).toEqual(['0,0', '1,0', '0,1', '1,1', '0,2', '1,2'])
    expect(states.every((s) => s.state === 'free')).toBe(true)
  })
  it('libre / occupée / indisponible', () => {
    const layout = { slots: [slot('a', 'donut', 0, 0)] }
    const byKey = Object.fromEntries(cellStates(layout, 'perf-table').map((s) => [`${s.col},${s.row}`, s]))
    expect(byKey['0,0']).toMatchObject({ state: 'occupied', slotId: 'a' })
    expect(byKey['1,0'].state).toBe('free')
    expect(byKey['0,1'].state).toBe('free')
    expect(byKey['0,2']).toMatchObject({ state: 'unavailable', reason: 'overflow-rows' })
  })
  it('un élément large est indisponible en colonne de droite', () => {
    const states = cellStates(empty(), 'items-by-shop')
    expect(states.filter((s) => s.col === 1).every((s) => s.state === 'unavailable')).toBe(true)
  })
})

describe('placeSlot / removeSlot', () => {
  it('ajoute sans muter', () => {
    const base = empty()
    const next = placeSlot(base, slot('a', 'donut', 0, 0))
    expect(base.slots).toHaveLength(0)
    expect(next.slots).toHaveLength(1)
  })
  it('refuse un placement impossible', () => {
    const layout = placeSlot(empty(), slot('a', 'donut', 0, 0))
    expect(() => placeSlot(layout, slot('b', 'donut', 0, 0))).toThrow()
  })
  it('retire par id', () => {
    const layout = placeSlot(placeSlot(empty(), slot('a', 'donut', 0, 0)), slot('b', 'donut', 1, 0))
    expect(removeSlot(layout, 'a').slots.map((s) => s.id)).toEqual(['b'])
    expect(removeSlot(layout, 'zzz').slots).toHaveLength(2)
  })
  it('remplit la page : 2 barres 2x2 impossibles, 6 donuts possibles', () => {
    let layout = placeSlot(empty(), slot('a', 'revenue-bars', 0, 0))
    expect(canPlace(layout, 'revenue-bars', 0, 1)).toBe(false)
    layout = empty()
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 2; c += 1) layout = placeSlot(layout, slot(`${c}${r}`, 'donut', c, r))
    expect(cellStates(layout, 'donut').every((s) => s.state === 'occupied')).toBe(true)
  })
})
