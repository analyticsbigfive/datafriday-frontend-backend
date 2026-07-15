import {
  buildReconciliationContext,
  reconcileRecord,
  UNATTACHED_ITEM_KEY,
  UNATTACHED_SHOP_KEY,
} from '@/utils/analyseReconciliation'

const menuItems = [
  { id: 'mi1', name: 'Heineken', categoryId: 'c1', typeId: 't1' },
  { id: 'mi2', name: 'Cheese Burger', categoryId: 'c2', typeId: 't2' },
  { id: 'mi3', name: 'Coca Cola', categoryId: 'c3', typeId: 't1' },
]
const productTypes = [
  { id: 't1', name: 'Beverage' },
  { id: 't2', name: 'Food' },
]
const productCategories = [
  { id: 'c1', name: 'Beer', typeId: 't1', typeName: 'Beverage' },
  { id: 'c2', name: 'Burger', typeId: 't2', typeName: 'Food' },
  { id: 'c3', name: 'Soft Drink', typeId: 't1', typeName: 'Beverage' },
]
const floorElements = [
  { id: 'el1', name: 'Bar Nord', shopType: ['beverages'], floorName: 'Niveau 0' },
  { id: 'el2', name: 'Food Court', shopType: ['food'], floorName: 'Niveau 1' },
  // PdV sans assignation propre → repli catalogue global (lenient).
  { id: 'el3', name: 'Lounge', shopType: ['gppremium'], floorName: 'Niveau 2' },
]
const assignment = {
  menuItems: {
    el1: { mi1: true, mi3: true },
    el2: { mi2: true },
    // el3 : aucune assignation
  },
}

function ctx(overrides = {}) {
  return buildReconciliationContext({
    menuItems,
    productCategories,
    productTypes,
    floorElements,
    assignment,
    ...overrides,
  })
}

describe('reconcileRecord — item', () => {
  it('match exact : menuItemId déjà assigné au PdV → mapped + dimensions catalogue', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemId: 'mi1', menuItemName: 'Heineken', revenue: 10 },
      ctx(),
    )
    expect(r.mapStatus).toBe('mapped')
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Beer')
    expect(r.revenue).toBe(10) // fait préservé
  })

  it('remap par nom (findBestMatch, prix omis) contre les items assignés au PdV', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Heinekn' }, // typo, pas d'id
      ctx(),
    )
    expect(r.mapStatus).toBe('remapped')
    expect(r.menuItemName).toBe('Heineken') // nom catalogue
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Beer')
  })

  it('non rattaché : aucun match ni dims backend → sentinelle UNATTACHED_ITEM_KEY', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Mystery Snack XYZ' },
      ctx(),
    )
    expect(r.mapStatus).toBe('unmapped')
    expect(r.menuItemType).toBe(UNATTACHED_ITEM_KEY)
    expect(r.menuItemCategory).toBe(UNATTACHED_ITEM_KEY)
  })

  it('non rattaché AVEC dims backend → repli sur les champs du record (pas de sentinelle)', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Mystery Snack XYZ', menuItemType: 'Food', menuItemCategory: 'Snack' },
      ctx(),
    )
    expect(r.mapStatus).toBe('unmapped')
    expect(r.menuItemType).toBe('Food')
    expect(r.menuItemCategory).toBe('Snack')
  })

  it('PdV sans assignation propre → repli catalogue GLOBAL (identité retrouvée)', () => {
    // Lounge (el3) est dans la config sans item assigné : le match lenient contre tout
    // le catalogue retrouve l'identité (dims, coût) — il n'exclut plus rien.
    const r = reconcileRecord(
      { shopName: 'Lounge', menuItemName: 'Cheese Burger' },
      ctx(),
    )
    expect(['mapped', 'remapped']).toContain(r.mapStatus)
    expect(r.menuItemType).toBe('Food')
    expect(r.menuItemCategory).toBe('Burger')
  })

  it('config sans aucune assignation → repli global pour TOUS les PdV', () => {
    const r = reconcileRecord(
      { shopName: 'Lounge', menuItemName: 'Cheese Burger' },
      ctx({ assignment: { menuItems: {} } }),
    )
    expect(['mapped', 'remapped']).toContain(r.mapStatus)
    expect(r.menuItemType).toBe('Food')
  })

  it('mapping nom→id explicite a priorité sur le flou', () => {
    const nameToMenuItemId = new Map([['coca cola', 'mi3']])
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Coca Cola' },
      ctx({ nameToMenuItemId }),
    )
    expect(r.mapStatus).toBe('remapped')
    expect(r.menuItemCategory).toBe('Soft Drink')
  })

  it('assignation PdV partielle → second match contre catalogue global', () => {
    // Cheese Burger existe et est classifié au catalogue, mais pas assigné à Bar Nord.
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Cheese Burger' },
      ctx(),
    )
    expect(r.mapStatus).toBe('remapped')
    expect(r.menuItemType).toBe('Food')
    expect(r.menuItemCategory).toBe('Burger')
  })

  it('catégorie source assimilée au catalogue → catégorie canonique + type parent', () => {
    const r = reconcileRecord(
      {
        shopName: 'Bar Nord',
        menuItemName: 'Produit source inconnu',
        menuItemCategory: 'Soft Drinks',
      },
      ctx(),
    )
    expect(r.mapStatus).toBe('unmapped')
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Soft Drink')
  })
})

describe('reconcileRecord — PdV', () => {
  it('shop matché → shopType normalisé + area = floorName', () => {
    const r = reconcileRecord({ shopName: 'Bar Nord', menuItemId: 'mi1' }, ctx())
    expect(r.shopStatus).toBe('mapped')
    expect(r.shopType).toBe('beverages')
    expect(r.shopArea).toBe('Niveau 0')
  })

  it('record shop-level sans libellé article → mapStatus noitem, dims item vides', () => {
    const r = reconcileRecord({ shopName: 'Bar Nord', revenue: 50 }, ctx())
    expect(r.mapStatus).toBe('noitem')
    expect(r.menuItemType).toBe('')
    expect(r.menuItemCategory).toBe('')
    expect(r.shopStatus).toBe('mapped') // PdV résolu quand même
    expect(r.shopType).toBe('beverages')
  })

  it('shop inconnu → shopStatus unmapped MAIS article résolu (repli global, non excluant)', () => {
    const r = reconcileRecord(
      { shopName: 'Stand Fantôme', menuItemId: 'mi1', menuItemName: 'Heineken' },
      ctx(),
    )
    expect(r.shopStatus).toBe('unmapped')
    expect(r.shopType).toBe(UNATTACHED_SHOP_KEY)
    expect(r.mapStatus).toBe('mapped') // identité retrouvée au catalogue global
    expect(r.menuItemType).toBe('Beverage')
  })

  it('shop inconnu avec shopType backend → repli sur le champ du record', () => {
    const r = reconcileRecord(
      { shopName: 'Stand Fantôme', menuItemId: 'mi1', shopType: 'bar', shopArea: 'Parvis' },
      ctx(),
    )
    expect(r.shopStatus).toBe('unmapped')
    expect(r.shopType).toBe('beverages') // 'bar' → clé canonique
    expect(r.shopArea).toBe('Parvis')
  })
})

// Scénario Auxerre 2A : assignation par OBJETS NestJS (assignmentItemsByShop),
// match par NOM contre les items assignés au PdV.
describe('réconciliation par assignation NestJS (objets, match nom)', () => {
  const assignmentItemsByShop = new Map([
    ['2 a', [
      { id: 'wz1', name: 'BONBONS', category: 'Snack' },
      { id: 'wz2', name: 'Burger', category: 'Plats Chauds' },
      { id: 'wz3', name: 'PINTE BIERE 50cl', category: 'Beer' },
    ]],
  ])
  function ctx2a() {
    return buildReconciliationContext({
      menuItems, productCategories, productTypes,
      floorElements: [{ id: 'el2a', name: '2 A', shopType: ['bar'], floorName: 'N0' }],
      assignmentItemsByShop,
    })
  }
  it('PINTE BIERE vendue (id ≠ catalogue) → mapped par NOM', () => {
    const r = reconcileRecord({ shopName: '2 A', menuItemId: 'tl-999', menuItemName: 'PINTE BIERE 50cl' }, ctx2a())
    expect(r.shopStatus).toBe('mapped')
    expect(['mapped', 'remapped']).toContain(r.mapStatus)
    expect(r.menuItemName).toBe('PINTE BIERE 50cl')
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Beer')
  })
  it('FRITES absente assignation ET catalogue → unmapped (mais AFFICHÉE)', () => {
    const r = reconcileRecord({ shopName: '2 A', menuItemId: 'tl-500', menuItemName: 'FRITES' }, ctx2a())
    expect(r.shopStatus).toBe('mapped')
    expect(r.mapStatus).toBe('unmapped')
    expect(r.menuItemName).toBe('FRITES') // libellé Weezevent brut préservé
    expect(r.menuItemType).toBe(UNATTACHED_ITEM_KEY)
  })
  it('produit Weezevent brut (sans nom ni id) → noitem (agrégat, pas une vente d’article)', () => {
    const r = reconcileRecord({ shopName: '2 A', menuItemId: null, weezeventProductId: '#cmpzfm7a8' }, ctx2a())
    expect(r.mapStatus).toBe('noitem')
  })
  it('dims : type/cat repli sur le record (backend) quand l’item assigné ne porte pas le type', () => {
    const r = reconcileRecord(
      { shopName: '2 A', menuItemName: 'PINTE BIERE 50cl', menuItemType: 'Beverage', menuItemCategory: 'Beer' },
      ctx2a(),
    )
    expect(r.menuItemType).toBe('Beverage') // repli record (l'objet NestJS n'a pas de type)
    expect(r.menuItemCategory).toBe('Beer')
  })
})

// Repli WEEZEVENT : quand ni le catalogue ni les champs backend ne fournissent les
// dims, on retombe sur nature (→ type) / subnature (→ catégorie) du produit.
describe('repli Weezevent nature/subnature', () => {
  const weezeventProducts = [
    { id: 'wp1', weezeventId: 'ext1', name: 'PINTE MYSTERE', nature: 'DRINK', subnature: 'Beer' },
    { id: 'wp2', name: 'SNACK SANS SUBNATURE', nature: 'FOOD' },
  ]
  const ctxWz = (over = {}) => ctx({ weezeventProducts, ...over })

  it('lookup par weezeventProductId → nature/subnature appliqués', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Truc Introuvable XYZ', weezeventProductId: 'wp1' },
      ctxWz(),
    )
    expect(r.mapStatus).toBe('unmapped')
    // 'Beer' est une CATÉGORIE du catalogue → catégorie canonique + type parent.
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Beer')
    expect(r.weezpayNature).toBe('DRINK')
    expect(r.weezpaySubnature).toBe('Beer')
  })

  it('lookup par id externe (weezeventId) puis par NOM', () => {
    const byExt = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Zzz', weezeventProductId: 'ext1' },
      ctxWz(),
    )
    expect(byExt.menuItemCategory).toBe('Beer')
    const byName = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'PINTE MYSTERE' },
      ctxWz(),
    )
    expect(byName.menuItemCategory).toBe('Beer')
  })

  it('sans subnature → nature sert aussi de catégorie (type canonicalisé catalogue)', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'SNACK SANS SUBNATURE' },
      ctxWz(),
    )
    expect(r.menuItemType).toBe('Food') // 'FOOD' → casse canonique du type catalogue
    expect(r.menuItemCategory).toBe('FOOD') // aucune catégorie catalogue 'food' → brute
  })

  it('nature = catégorie catalogue → remontée au TYPE parent', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Zzz', weezeventProductId: 'wp9' },
      ctxWz({ weezeventProducts: [{ id: 'wp9', name: 'Zzz', nature: 'Beer' }] }),
    )
    expect(r.menuItemType).toBe('Beverage') // parent de la catégorie Beer
    expect(r.menuItemCategory).toBe('Beer')
  })

  it('le catalogue matché garde la priorité sur Weezevent', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemId: 'mi1', menuItemName: 'Heineken', weezeventProductId: 'wp1' },
      ctxWz(),
    )
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Beer')
    expect(r.weezpayNature).toBeUndefined() // repli non appliqué
  })

  it('les champs backend du record gardent la priorité sur Weezevent', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Truc Introuvable XYZ', weezeventProductId: 'wp1', menuItemType: 'Food', menuItemCategory: 'Snack' },
      ctxWz(),
    )
    expect(r.menuItemType).toBe('Food')
    expect(r.menuItemCategory).toBe('Snack')
  })

  it('produit inconnu → sentinelle inchangée (non-régression)', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Mystery Snack XYZ', weezeventProductId: 'inconnu' },
      ctxWz(),
    )
    expect(r.menuItemType).toBe(UNATTACHED_ITEM_KEY)
    expect(r.menuItemCategory).toBe(UNATTACHED_ITEM_KEY)
  })
})

describe('buildReconciliationContext — robustesse', () => {
  it('accepte une assignation déjà sous forme de Map<elementId, Set>', () => {
    const mapAssign = new Map([['el1', new Set(['mi1'])]])
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemId: 'mi1' },
      ctx({ assignment: mapAssign }),
    )
    expect(r.mapStatus).toBe('mapped')
  })

  it('sans floorElements → PdV non rattaché mais article résolu au catalogue global', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Cheese Burger' },
      ctx({ floorElements: [] }),
    )
    expect(r.shopStatus).toBe('unmapped')
    expect(['mapped', 'remapped']).toContain(r.mapStatus)
    expect(r.menuItemType).toBe('Food')
  })
})
