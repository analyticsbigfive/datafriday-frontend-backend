import { mergeFreshCostMap, replaceCostMap } from '@/utils/analyseSpaceRefresh'
import { scoringInputsKey } from '@/composables/usePredictiveTimeline'

describe('mergeFreshCostMap', () => {
  it('le frais gagne et l ancien sert de repli sur le meme espace', () => {
    expect(mergeFreshCostMap({ a: 2 }, { a: 1, b: 5 }, { sameSpace: true })).toEqual({ a: 2, b: 5 })
  })
  it('ignore l ancien au changement d espace', () => {
    expect(mergeFreshCostMap({ a: 2 }, { b: 5 }, { sameSpace: false })).toEqual({ a: 2 })
  })
})

describe('replaceCostMap', () => {
  it('phase 1 prioritaire, aucune entree ancienne', () => {
    expect(replaceCostMap({ a: 1, b: 2 }, { a: 9 })).toEqual({ a: 9, b: 2 })
  })
})

describe('scoringInputsKey', () => {
  const ev = { eventTypeId: 't1', eventCategoryId: 'c1', eventSubcategoryId: 's1', eventDate: '2026-11-01' }
  const past = [{ id: 'e1', configurationId: 'cfg', eventTypeId: 't1' }]
  it('change quand le type, la categorie ou un event passe change', () => {
    const base = scoringInputsKey(ev, past)
    expect(scoringInputsKey({ ...ev, eventCategoryId: 'c2' }, past)).not.toBe(base)
    expect(scoringInputsKey(ev, [{ ...past[0], eventTypeId: 't2' }])).not.toBe(base)
    expect(scoringInputsKey(ev, past)).toBe(base)
  })
})
