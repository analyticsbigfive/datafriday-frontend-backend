import {
  buildStockFilterOptions,
  filterStockRowsByMeta,
  hasStockFilter,
  marketPriceTypeCategory,
} from '@/utils/stockRowFilters'

const rows = [{ itemKey: 'a' }, { itemKey: 'b' }, { itemKey: 'c' }, { itemKey: 'd' }]
const meta = {
  a: { typeName: 'Beverage', categoryName: 'Bières', supplierName: 'Provence boisson' },
  b: { typeName: 'Food', categoryName: 'Pains', supplierName: 'Boulangerie' },
  c: { typeName: 'beverage', categoryName: 'Bières', supplierName: 'Boulangerie' },
  d: {},
}

describe('stockRowFilters', () => {
  it('construit des options uniques, triées, sans valeur vide', () => {
    const o = buildStockFilterOptions(rows, meta)
    expect(o.types).toEqual(['Beverage', 'Food'])
    expect(o.categories).toEqual(['Bières', 'Pains'])
    expect(o.suppliers).toEqual(['Boulangerie', 'Provence boisson'])
  })

  it('sans filtre, renvoie les lignes telles quelles', () => {
    expect(filterStockRowsByMeta(rows, meta, {})).toBe(rows)
    expect(hasStockFilter({ type: '', category: null })).toBe(false)
  })

  it('filtre par type sans tenir compte de la casse', () => {
    const out = filterStockRowsByMeta(rows, meta, { type: 'Beverage' })
    expect(out.map((r) => r.itemKey)).toEqual(['a', 'c'])
  })

  it('combine les filtres et exclut les lignes sans valeur', () => {
    const out = filterStockRowsByMeta(rows, meta, { type: 'Beverage', supplier: 'Boulangerie' })
    expect(out.map((r) => r.itemKey)).toEqual(['c'])
    expect(filterStockRowsByMeta(rows, meta, { category: 'Pains' }).map((r) => r.itemKey)).toEqual(['b'])
  })

  it('resout type et categorie par referentiel puis texte libre', () => {
    const types = [{ id: 't1', name: 'Boissons' }]
    const cats = [{ id: 'c1', name: 'Bières' }]
    expect(marketPriceTypeCategory({ marketPriceTypeId: 't1', marketPriceCategoryId: 'c1', goodType: 'Beverage' }, types, cats))
      .toEqual({ typeName: 'Boissons', categoryName: 'Bières' })
    expect(marketPriceTypeCategory({ goodType: 'Food', category: 'Pains' }, types, cats))
      .toEqual({ typeName: 'Food', categoryName: 'Pains' })
    expect(marketPriceTypeCategory(null)).toEqual({ typeName: '', categoryName: '' })
  })
})
