import { normalizeShopType, shopTypeColor } from '@/constants/shopTypes'
import { resolveShopType, resolveItemType, resolveItemCategory } from '@/utils/analyseDimensions'

describe('normalizeShopType', () => {
  it('mappe une valeur simple canonique', () => {
    expect(normalizeShopType('food')).toBe('food')
    expect(normalizeShopType('beer')).toBe('beer')
  })

  it('mappe le singulier vers le pluriel canonique', () => {
    expect(normalizeShopType('beverage')).toBe('beverages')
  })

  it('préserve les composites, dédupe et ordonne canoniquement', () => {
    expect(normalizeShopType('food, beverages')).toBe('food, beverages')
    expect(normalizeShopType('beverages, food')).toBe('food, beverages')
    expect(normalizeShopType('beverages, beer')).toBe('beverages, beer')
    expect(normalizeShopType('food, food')).toBe('food')
  })

  it('absorbe le vocabulaire fnb-* mort et le typo underscore', () => {
    expect(normalizeShopType('fnb-bar')).toBe('beverages')
    expect(normalizeShopType('fnb-food')).toBe('food')
    expect(normalizeShopType('gp_premium')).toBe('gppremium')
  })

  it('mappe le vocabulaire backend réel en underscore (fnb_*)', () => {
    // Valeurs observées sur Auxerre : `/spaces/:id/shops` renvoie l'underscore.
    expect(normalizeShopType('fnb_beverages')).toBe('beverages')
    expect(normalizeShopType('fnb_food')).toBe('food')
    expect(normalizeShopType('FNB_BEVERAGES')).toBe('beverages')
  })

  it('route les inconnus vers le bucket « other »', () => {
    expect(normalizeShopType('Points of sale')).toBe('other')
    expect(normalizeShopType('shop')).toBe('other')
    expect(normalizeShopType('merchandise')).toBe('other')
  })

  it('renvoie chaîne vide pour falsy (donut/filtre l\'ignore)', () => {
    expect(normalizeShopType('')).toBe('')
    expect(normalizeShopType(null)).toBe('')
    expect(normalizeShopType(undefined)).toBe('')
  })
})

describe('shopTypeColor', () => {
  it('renvoie la couleur du 1er token connu pour un composite', () => {
    expect(shopTypeColor('food, beverages')).toBe('#EF5350')
  })
  it('undefined si inconnu', () => {
    expect(shopTypeColor('')).toBeUndefined()
  })
})

describe('résolveurs de dimension (clé partagée donut/filtre)', () => {
  it('resolveShopType normalise le shopType brut du record', () => {
    expect(resolveShopType({ shopType: 'beverage' })).toBe('beverages')
  })

  it('multi-subtypes builder2 : VENTILATION par article, jamais de slice composite', () => {
    // PdV [food, beverages] : chaque vente rangée sous le type de l'article vendu.
    expect(resolveShopType({ shopType: 'food, beverages', menuItemType: 'Beverage' })).toBe('beverages')
    expect(resolveShopType({ shopType: 'food, beverages', menuItemType: 'Food' })).toBe('food')
    // Article hors subtypes du PdV : l'article reste la vérité (ex. Beer).
    expect(resolveShopType({ shopType: 'food, beverages', menuItemType: 'Beer' })).toBe('beer')
    // Article non résolu → repli 1er subtype (ordre canonique).
    expect(resolveShopType({ shopType: 'beverages, food' })).toBe('food')
    expect(resolveShopType({ shopType: 'food, beverages', menuItemType: 'Points of sale' })).toBe('food')
  })

  it('resolveItemType/Category utilisent le vrai catalogue quand présent', () => {
    const r = { menuItemType: 'Food', menuItemCategory: 'Burger' }
    expect(resolveItemType(r)).toBe('Food')
    expect(resolveItemCategory(r)).toBe('Burger')
  })

  it('type ≠ catégorie quand le catalogue les distingue', () => {
    const r = { menuItemType: 'Beverage', menuItemCategory: 'Soft Drink' }
    expect(resolveItemType(r)).not.toBe(resolveItemCategory(r))
  })

  it('catalogue-only : dimension absente → chaîne vide (PLUS de repli regex/mock)', () => {
    // Un record non réconcilié sans dimension catalogue ne doit JAMAIS être
    // reclassé par mot-clé (« Heineken IPA » → Beer). La réconciliation pose
    // soit la vraie catégorie, soit la sentinelle UNATTACHED — jamais ici.
    const r = { menuItemName: 'Heineken IPA', menuItemType: null, menuItemCategory: null }
    expect(resolveItemType(r)).toBe('')
    expect(resolveItemCategory(r)).toBe('')
  })
})
