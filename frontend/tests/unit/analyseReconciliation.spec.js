import {
  buildReconciliationContext,
  reconcileRecord,
  UNATTACHED_ITEM_KEY,
  UNATTACHED_SHOP_KEY,
} from '@/utils/analyseReconciliation'

// BUG-353-01 — contrat de ce module depuis 2026-08-24 :
//   • l'identité article vient EXCLUSIVEMENT du `menuItemId` posé par le backend
//     (mapping Data Integration WeezeventProductMapping → MenuItem) ;
//   • aucun rapprochement par nom, aucune lecture du SpaceMenu ;
//   • une vente sans mapping n'est PAS écartée (décision JLH 2026-08-24, réaffirmée
//     après avoir envisagé l'exclusion) : elle reste dans les totaux, affichée
//     « Non mappées » (UNATTACHED_ITEM_KEY), et le bandeau de la page chiffre ce
//     volume (BUG-356-01).
// Les anciens cas « remapped » (match flou au seuil 70 contre l'assignation du PdV)
// ont disparu avec l'algorithme : c'est ce qui faisait basculer les ventes d'un
// article absent du SpaceMenu sur son homonyme le plus proche.

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
  { id: 'el3', name: 'Lounge', shopType: ['gppremium'], floorName: 'Niveau 2' },
]

function ctx(overrides = {}) {
  return buildReconciliationContext({
    menuItems,
    productCategories,
    productTypes,
    floorElements,
    ...overrides,
  })
}

describe('reconcileRecord — identité article (mapping Data Integration)', () => {
  it('menuItemId backend → mapped + dimensions catalogue, faits préservés', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemId: 'mi1', menuItemName: 'Heineken', revenue: 10 },
      ctx(),
    )
    expect(r.menuItemId).toBe('mi1')
    expect(r.mapStatus).toBe('mapped')
    expect(r.menuItemType).toBe('Beverage')
    expect(r.menuItemCategory).toBe('Beer')
    expect(r.revenue).toBe(10)
  })

  it('menuItemId hors catalogue chargé → mapped quand même, dims depuis le record', () => {
    // Le backend a résolu le mapping ; le catalogue local peut être partiel (autre
    // espace, chargement en cours). On ne rejette pas son verdict pour autant.
    const r = reconcileRecord(
      {
        shopName: 'Bar Nord',
        menuItemId: 'mi-inconnu-du-store',
        menuItemName: 'Bud 33cl 26/27 (LMFC)',
        menuItemType: 'Beverage',
        menuItemCategory: 'Beer',
      },
      ctx(),
    )
    expect(r.menuItemId).toBe('mi-inconnu-du-store')
    expect(r.mapStatus).toBe('mapped')
    expect(r.menuItemName).toBe('Bud 33cl 26/27 (LMFC)')
    expect(r.menuItemType).toBe('Beverage')
  })

  it('AUCUN remap par nom : un libellé proche du catalogue ne crée pas d’identité', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Heinekn' }, // typo, pas d'id backend
      ctx(),
    )
    expect(r.mapStatus).toBe('unmapped')
    expect(r.menuItemId).toBeNull()
    expect(r.menuItemName).toBe('Heinekn') // libellé vendu préservé, jamais réécrit
  })

  it('vente sans mapping → NON écartée, sentinelle « Non mappées »', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemName: 'Mystery Snack XYZ', revenue: 7, quantity: 2 },
      ctx(),
    )
    expect(r.mapStatus).toBe('unmapped')
    expect(r.menuItemType).toBe(UNATTACHED_ITEM_KEY)
    expect(r.menuItemCategory).toBe(UNATTACHED_ITEM_KEY)
    expect(r.revenue).toBe(7) // compte toujours dans les totaux
    expect(r.quantity).toBe(2)
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

// ─── LA garantie de non-régression du bug ────────────────────────────────────
// Reproduit le cas réel : Le Mans FC, event « Le Mans-Brest » du 22/08/2026.
// « Bud 33cl 26/27 (LMFC) » et « Budweiser 45cl 26/27 (LMFC) » sont deux MenuItem
// distincts, tous deux mappés dans Data Integration. Tant que la réconciliation
// consultait le SpaceMenu du PdV et rapprochait par NOM (seuil 70), l'absence de
// Bud 33 dans le SpaceMenu suffisait à faire basculer ses 916 unités sous Bud 45.
describe('BUG-353-01 — l’Analyse est indépendante du SpaceMenu', () => {
  const BUD_33 = 'mi-bud-33'
  const BUD_45 = 'mi-bud-45'
  const catalogue = [
    { id: BUD_33, name: 'Bud 33cl 26/27 (LMFC)', categoryId: 'c1', typeId: 't1' },
    { id: BUD_45, name: 'Budweiser 45cl 26/27 (LMFC)', categoryId: 'c1', typeId: 't1' },
  ]
  const vente = {
    shopName: 'Kiosk FB1',
    menuItemId: BUD_33,
    menuItemName: 'Bud 33cl 26/27 (LMFC)',
    quantity: 916,
    revenue: 4961.89,
  }

  // Le SpaceMenu ne contient QUE Bud 45 — la configuration exacte qui produisait le bug.
  const contexte = () =>
    buildReconciliationContext({
      menuItems: catalogue,
      productCategories,
      productTypes,
      floorElements: [{ id: 'el-kiosk', name: 'Kiosk FB1', shopType: ['beverages'], floorName: 'RDC' }],
    })

  it('la vente reste sur Bud 33cl, jamais rapprochée de Budweiser 45cl', () => {
    const r = reconcileRecord(vente, contexte())
    expect(r.menuItemId).toBe(BUD_33)
    expect(r.menuItemId).not.toBe(BUD_45)
    expect(r.menuItemName).toBe('Bud 33cl 26/27 (LMFC)')
    expect(r.mapStatus).toBe('mapped')
    expect(r.quantity).toBe(916)
  })

  it('passer une assignation SpaceMenu au contexte ne change RIEN au résultat', () => {
    // `buildReconciliationContext` ignore désormais ces clés : la preuve durable que
    // toucher au SpaceMenu ne peut plus déplacer une vente d'un article vers un autre.
    const sansSpaceMenu = reconcileRecord(vente, contexte())
    const avecSpaceMenuBud45Seul = reconcileRecord(
      vente,
      buildReconciliationContext({
        menuItems: catalogue,
        productCategories,
        productTypes,
        floorElements: [{ id: 'el-kiosk', name: 'Kiosk FB1', shopType: ['beverages'], floorName: 'RDC' }],
        assignment: { menuItems: { 'el-kiosk': { [BUD_45]: true } } },
        assignmentItemsByShop: new Map([
          ['kiosk fb1', [{ id: BUD_45, name: 'Budweiser 45cl 26/27 (LMFC)', category: 'Beer' }]],
        ]),
      }),
    )
    expect(avecSpaceMenuBud45Seul).toEqual(sansSpaceMenu)
    expect(avecSpaceMenuBud45Seul.menuItemId).toBe(BUD_33)
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

  it('shop inconnu → shopStatus unmapped MAIS identité article conservée', () => {
    const r = reconcileRecord(
      { shopName: 'Stand Fantôme', menuItemId: 'mi1', menuItemName: 'Heineken' },
      ctx(),
    )
    expect(r.shopStatus).toBe('unmapped')
    expect(r.shopType).toBe(UNATTACHED_SHOP_KEY)
    expect(r.mapStatus).toBe('mapped')
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

  it('produit Weezevent brut (sans nom ni id) → noitem (agrégat, pas une vente d’article)', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemId: null, weezeventProductId: '#cmpzfm7a8' },
      ctx(),
    )
    expect(r.mapStatus).toBe('noitem')
  })
})

// Repli WEEZEVENT : quand ni le catalogue ni les champs backend ne fournissent les
// dims, on retombe sur nature (→ type) / subnature (→ catégorie) du produit.
// Inchangé par BUG-353-01 : ce repli habille, il ne décide pas de l'identité.
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
  it('sans floorElements → PdV non rattaché, identité article intacte', () => {
    const r = reconcileRecord(
      { shopName: 'Bar Nord', menuItemId: 'mi2', menuItemName: 'Cheese Burger' },
      ctx({ floorElements: [] }),
    )
    expect(r.shopStatus).toBe('unmapped')
    expect(r.mapStatus).toBe('mapped')
    expect(r.menuItemId).toBe('mi2')
    expect(r.menuItemType).toBe('Food')
  })

  it('les clés SpaceMenu passées par erreur sont ignorées sans lever', () => {
    expect(() =>
      ctx({
        assignment: { menuItems: { el1: { mi1: true } } },
        assignmentItemsByShop: new Map([['bar nord', [{ id: 'mi1', name: 'Heineken' }]]]),
        nameToMenuItemId: new Map([['heineken', 'mi1']]),
      }),
    ).not.toThrow()
  })
})
