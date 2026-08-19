import {
  classifyMenuRevenueBucket,
  enrichGranularMenuDimensions,
  humanizeDimensionLabel,
  buildCategoryParentTypeMap,
  correctTypeViaCatalog,
  applyCatalogTypeCorrection,
  hasItemOnlyFilters,
} from '@/utils/analyseDimensions'

describe('analyse dimensions', () => {
  it('enrichit type et catégorie depuis relations catalogue', () => {
    const records = [{ menuItemId: 'mi-1', menuItemName: 'Burger' }]
    const items = [{ id: 'mi-1', name: 'Burger', typeId: 'type-food', categoryId: 'cat-burger' }]
    const types = [{ id: 'type-food', name: 'Food' }]
    const categories = [{ id: 'cat-burger', name: 'Burger' }]

    expect(enrichGranularMenuDimensions(records, items, types, categories)[0]).toMatchObject({
      menuItemType: 'Food',
      menuItemCategory: 'Burger',
    })
  })

  it('supporte champs catalogue legacy', () => {
    const result = enrichGranularMenuDimensions(
      [{ menuItemId: 'mi-2' }],
      [{ id: 'mi-2', name: 'Cola', type: 'Beverage', category: 'Soft Drink' }],
    )[0]

    expect(result).toMatchObject({
      menuItemName: 'Cola',
      menuItemType: 'Beverage',
      menuItemCategory: 'Soft Drink',
    })
  })

  it('mappe l’identité via produit Weezevent mais NE dérive PAS type/catégorie de Weezevent', () => {
    const result = enrichGranularMenuDimensions(
      [{ weezeventProductId: 'wz-1', menuItemId: null, menuItemName: null }],
      [{ id: 'mi-3', name: 'Cola catalogue' }],
      [],
      [],
      [{ id: 'wz-1', name: 'Cola transaction', nature: 'DRINK', subnature: 'SOFT' }],
      [{ weezeventProductId: 'wz-1', menuItemId: 'mi-3' }],
    )[0]

    // Identité (id + nom) résolue via le mapping → OK.
    expect(result.menuItemId).toBe('mi-3')
    expect(result.menuItemName).toBe('Cola catalogue')
    // Mais nature/subnature Weezevent ne fabriquent plus de type/catégorie : le
    // catalogue (vide ici pour mi-3) est la seule source → dimensions nulles.
    expect(result.menuItemType).toBeNull()
    expect(result.menuItemCategory).toBeNull()
  })

  it.each([
    [{ menuItemType: 'Food', menuItemCategory: 'Burger' }, 'FOOD'],
    [{ menuItemType: 'Beverage', menuItemCategory: 'Beer' }, 'BEER'],
    [{ menuItemType: 'Drink', menuItemCategory: 'Soft' }, 'BEVERAGE'],
    // Plus d'item identifié → repli sur le type de PdV (shopType).
    [{ menuItemType: null, menuItemCategory: null, shopType: 'fnb-food' }, 'FOOD'],
    [{ menuItemType: null, menuItemCategory: null, shopType: 'fnb-beverages' }, 'BEVERAGE'],
    [{ menuItemType: null, menuItemCategory: null, shopType: 'fnb-bar' }, 'BEVERAGE'],
    // Nom d'article seul, sans type/catégorie.
    [{ menuItemName: 'Pression 50cl' }, 'BEER'],
    [{ menuItemName: 'Coca-Cola' }, 'BEVERAGE'],
    [{ menuItemName: 'Hot Dog' }, 'FOOD'],
    // Aucun signal → repli Beverage (jamais UNCLASSIFIED).
    [{ menuItemType: null, menuItemCategory: null }, 'BEVERAGE'],
  ])('classe %p dans %s', (record, expected) => {
    expect(classifyMenuRevenueBucket(record)).toBe(expected)
  })

  it('humanise slug sans perdre mapping explicite', () => {
    expect(humanizeDimensionLabel('fnb-beverages', {
      'fnb-beverages': 'Food & Beverage - Boissons',
    })).toBe('Food & Beverage - Boissons')
    expect(humanizeDimensionLabel('vip-shop')).toBe('Vip Shop')
  })
})

describe('correction type via catalogue (Beer dans By item type)', () => {
  const categories = [
    { name: 'Beer', typeName: 'Beverage' },
    { name: 'Soft Drink', typeId: 't-bev' },
    { name: 'Burger', typeName: 'Food' },
  ]
  const types = [{ id: 't-bev', name: 'Beverage' }]

  it('buildCategoryParentTypeMap : nom catégorie → type parent (typeName ou typeId)', () => {
    const m = buildCategoryParentTypeMap(categories, types)
    expect(m.get('beer')).toBe('Beverage')
    expect(m.get('soft drink')).toBe('Beverage') // résolu via typeId
    expect(m.get('burger')).toBe('Food')
  })

  it('correctTypeViaCatalog : type qui est une catégorie → type parent', () => {
    const m = buildCategoryParentTypeMap(categories, types)
    expect(correctTypeViaCatalog('Beer', m)).toBe('Beverage')
    expect(correctTypeViaCatalog('Beverage', m)).toBe('Beverage') // vrai type → inchangé
    expect(correctTypeViaCatalog('Food', m)).toBe('Food') // inconnu côté catégorie → inchangé
  })

  it('applyCatalogTypeCorrection : remap type et bascule catégorie si vide', () => {
    const m = buildCategoryParentTypeMap(categories, types)
    const [a, b, c] = applyCatalogTypeCorrection([
      { menuItemType: 'Beer', menuItemCategory: '', revenue: 100 },
      { menuItemType: 'Beer', menuItemCategory: 'Beer (can)', revenue: 50 },
      { menuItemType: 'Beverage', menuItemCategory: 'Beer', revenue: 30 },
    ], m)
    expect(a).toMatchObject({ menuItemType: 'Beverage', menuItemCategory: 'Beer' }) // catégorie vide → comblée
    expect(b).toMatchObject({ menuItemType: 'Beverage', menuItemCategory: 'Beer (can)' }) // catégorie conservée
    expect(c).toMatchObject({ menuItemType: 'Beverage', menuItemCategory: 'Beer' }) // déjà correct → inchangé
  })

  it('enrichGranularMenuDimensions corrige le type via le catalogue', () => {
    const out = enrichGranularMenuDimensions(
      [{ menuItemType: 'Beer', menuItemCategory: null }],
      [],
      types,
      categories,
    )[0]
    expect(out.menuItemType).toBe('Beverage')
    expect(out.menuItemCategory).toBe('Beer')
  })
})

// BUG-339-04 : décide la source des KPI totaux (AnalyseView.kpiRecords) — shop-level par
// défaut, item-level seulement quand un filtre au grain article/minute est actif.
describe('hasItemOnlyFilters (BUG-339-04)', () => {
  it('aucun filtre → false (KPI totaux restent shop-level)', () => {
    expect(hasItemOnlyFilters()).toBe(false)
    expect(hasItemOnlyFilters({})).toBe(false)
    expect(hasItemOnlyFilters({ selectedTimeRange: { start: null, end: null } })).toBe(false)
  })

  it('chaque dimension article déclenche à elle seule', () => {
    expect(hasItemOnlyFilters({ selectedMenuItemIds: ['Bière'] })).toBe(true)
    expect(hasItemOnlyFilters({ selectedMenuItemTypes: ['Beverage'] })).toBe(true)
    expect(hasItemOnlyFilters({ selectedMenuItemCategories: ['Beer'] })).toBe(true)
  })

  it('tranche horaire bornée (même partiellement) déclenche', () => {
    expect(hasItemOnlyFilters({ selectedTimeRange: { start: '19:00', end: null } })).toBe(true)
    expect(hasItemOnlyFilters({ selectedTimeRange: { start: null, end: '23:00' } })).toBe(true)
  })

  it('filtres PdV seuls → false (le shop-level sait déjà les appliquer)', () => {
    expect(
      hasItemOnlyFilters({
        selectedShopIds: ['Buvette Nord'],
        selectedShopTypes: ['Bar'],
        selectedShopAreas: ['Tribune Est'],
      }),
    ).toBe(false)
  })
})
