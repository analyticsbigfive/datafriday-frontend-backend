import { hasArticleFilter, pickForecastRevenueRecords } from '@/utils/analyseRevenueSource'

const shop = [{ id: 's' }]
const item = [{ id: 'i' }]
const art = [{ id: 'a' }]
const base = { itemLevelRecords: item, shopLevelRecords: shop, articleRecords: art }

describe('pickForecastRevenueRecords', () => {
  it('Prévision sans filtre article : records PdV', () => {
    expect(pickForecastRevenueRecords({ ...base, isPredict: true, filters: {} })).toBe(shop)
  })
  it('Prévision avec filtre type : grain article', () => {
    const filters = { selectedMenuItemTypes: ['Beverages'] }
    expect(pickForecastRevenueRecords({ ...base, isPredict: true, filters })).toBe(art)
  })
  it('Prévision avec menu item cliqué : grain article', () => {
    const filters = { selectedMenuItemIds: ['Heineken 45cl'] }
    expect(pickForecastRevenueRecords({ ...base, isPredict: true, filters })).toBe(art)
  })
  it('Analyse avec filtre article : inchangé (item-level)', () => {
    const filters = { selectedMenuItemTypes: ['Beverages'] }
    expect(pickForecastRevenueRecords({ ...base, isPredict: false, filters })).toBe(item)
  })
  it('hasArticleFilter ignore les filtres PdV', () => {
    expect(hasArticleFilter({ selectedShopIds: ['x'] })).toBe(false)
  })
})
