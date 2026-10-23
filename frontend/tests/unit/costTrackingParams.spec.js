import { buildSeriesParams, canAggregate, isPricelessMode, staleSelectionPatch } from '@/utils/costTrackingParams'

const range = { from: '2026-04-01', to: '2026-04-30' }

describe('buildSeriesParams', () => {
  it('passe supplierKey et componentId quand ils sont choisis, sinon undefined', () => {
    const p = buildSeriesParams({ range, filters: { supplierKey: 'name:promocash', componentId: 'c1' }, groupBy: 'article' })
    expect(p).toMatchObject({ from: '2026-04-01', to: '2026-04-30', supplierKey: 'name:promocash', componentId: 'c1', groupBy: 'article' })
    const none = buildSeriesParams({ range, filters: {}, groupBy: 'article' })
    expect(none.supplierKey).toBeUndefined()
    expect(none.componentId).toBeUndefined()
  })
  it('agrégat transmis pour type, catégorie et fournisseur seulement', () => {
    for (const g of ['type', 'category', 'supplier']) {
      expect(buildSeriesParams({ range, groupBy: g, aggregate: 'sum' }).aggregate).toBe('sum')
    }
    for (const g of ['article', 'component', 'ingredient']) {
      expect(buildSeriesParams({ range, groupBy: g, aggregate: 'sum' }).aggregate).toBeUndefined()
    }
  })
})

describe('modes', () => {
  it('canAggregate', () => {
    expect(canAggregate('supplier')).toBe(true)
    expect(canAggregate('component')).toBe(false)
  })
  it('sans prix : fournisseur, composant, ingrédient sans article ; la recette d un article en garde', () => {
    expect(isPricelessMode('supplier')).toBe(true)
    expect(isPricelessMode('component')).toBe(true)
    expect(isPricelessMode('ingredient', null)).toBe(true)
    expect(isPricelessMode('ingredient', 'a1')).toBe(false)
    expect(isPricelessMode('article')).toBe(false)
  })
})

describe('staleSelectionPatch', () => {
  const options = { suppliers: [{ key: 's1' }], components: [{ id: 'c1' }] }
  it('rien à vider quand les sélections existent encore ou sont vides', () => {
    expect(staleSelectionPatch(options, { supplierKey: 's1', componentId: 'c1' })).toBeNull()
    expect(staleSelectionPatch(options, { supplierKey: null, componentId: null })).toBeNull()
  })
  it('vide la sélection absente de la liste', () => {
    expect(staleSelectionPatch(options, { supplierKey: 'x', componentId: 'c1' })).toEqual({ supplierKey: null })
    expect(staleSelectionPatch({ suppliers: [], components: [] }, { supplierKey: 'x', componentId: 'y' }))
      .toEqual({ supplierKey: null, componentId: null })
  })
})
