import {
  NOT_SET_KEY,
  PROMO_YES_KEY,
  PROMO_NO_KEY,
  buildDimensionIndex,
  expandToLeaves,
  recordMetric,
  brandBreakdown,
  industrialBreakdown,
  supplierCostBreakdown,
  promotionBreakdown,
  promotionTypeBreakdown,
  promotionDiscount,
  listDimensionOptions,
  entriesToDonut,
} from '@/utils/articleDimensionBreakdown'
import { buildArticleDimensionPredicate } from '@/utils/articleDimensionFilter'
import { buildItemFilterPredicate } from '@/utils/analyseDimensions'

const index = buildDimensionIndex([
  {
    menuItemId: 'beer', brandName: 'Heineken',
    industrialShares: [{ industrialId: 'i1', name: 'Heineken Group', share: 1 }],
    supplierCosts: [{ supplierId: 's1', name: 'France Boissons', unitCost: 1 }],
    promotion: null, comboChildren: [],
  },
  {
    menuItemId: 'beer-promo', brandName: 'Heineken',
    industrialShares: [{ industrialId: 'i1', name: 'Heineken Group', share: 1 }],
    supplierCosts: [{ supplierId: 's1', name: 'France Boissons', unitCost: 1 }],
    promotion: { typeId: 'pt1', typeName: 'Pompier', referenceMenuItemId: 'beer', referencePrice: 5.5, price: 3 },
    comboChildren: [],
  },
  {
    menuItemId: 'burger', brandName: null,
    industrialShares: [
      { industrialId: 'i2', name: 'Bridor', share: 0.75 },
      { industrialId: 'i3', name: 'McCain', share: 0.25 },
    ],
    supplierCosts: [{ supplierId: null, name: null, unitCost: 0.5 }, { supplierId: 's2', name: 'Sysco', unitCost: 1.5 }],
    promotion: null, comboChildren: [],
  },
  { menuItemId: 'fries', brandName: 'Maison', industrialShares: [], supplierCosts: [], promotion: null, comboChildren: [] },
  {
    menuItemId: 'combo', brandName: null, industrialShares: [],
    supplierCosts: [{ supplierId: 's3', name: 'Emballages SA', unitCost: 0.2 }],
    promotion: null,
    comboChildren: [{ menuItemId: 'burger', weight: 0.75, quantity: 1 }, { menuItemId: 'fries', weight: 0.25, quantity: 2 }],
  },
])

const rec = (menuItemId, quantity, revenue) => ({ menuItemId, quantity, revenue })
const asObj = (entries) => Object.fromEntries(entries.map((e) => [e.key, e.value]))

describe('articleDimensionBreakdown', () => {
  it('ventile un combo sur ses enfants et garde sa propre recette pour le coût', () => {
    const leaves = expandToLeaves('combo', index, { includeSelf: true })
    expect(leaves.map((l) => [l.id, l.weight, l.self])).toEqual([
      ['combo', 1, true], ['burger', 0.75, false], ['fries', 0.25, false],
    ])
    // Sans includeSelf, seuls les enfants portent marque et industriel.
    expect(expandToLeaves('combo', index).map((l) => l.id)).toEqual(['burger', 'fries'])
    expect(expandToLeaves('combo', index, { byQuantity: true }).map((l) => [l.id, l.weight])).toEqual([
      ['burger', 1], ['fries', 2],
    ])
    // Combo cyclique : la profondeur est bornée, pas de boucle infinie.
    const loop = buildDimensionIndex([{ menuItemId: 'a', comboChildren: [{ menuItemId: 'a', weight: 1 }] }])
    expect(expandToLeaves('a', loop).length).toBeGreaterThan(0)
  })

  it('par marque : combo ventilé, sans marque en dernier', () => {
    const out = brandBreakdown([rec('beer', 10, 50), rec('combo', 4, 100)], index, recordMetric('revenue'))
    // combo 100 : burger 75 (sans marque), fries 25 (Maison)
    expect(asObj(out)).toEqual({ Heineken: 50, Maison: 25, [NOT_SET_KEY]: 75 })
    expect(out[out.length - 1].key).toBe(NOT_SET_KEY)
  })

  it('par industriel : prorata des parts, sans industriel = Non renseigné', () => {
    const out = industrialBreakdown([rec('burger', 2, 20), rec('fries', 1, 4), rec(null, 1, 6)], index, recordMetric('revenue'))
    expect(asObj(out)).toEqual({ Bridor: 15, McCain: 5, [NOT_SET_KEY]: 10 })
  })

  it('mode quantité utilise la quantité', () => {
    const out = brandBreakdown([rec('beer', 10, 50)], index, recordMetric('quantity'))
    expect(asObj(out)).toEqual({ Heineken: 10 })
  })

  it('coût par fournisseur : quantité x coût, combo = recette propre + enfants au prorata', () => {
    const out = supplierCostBreakdown([rec('beer', 10, 50), rec('combo', 4, 100)], index)
    const m = asObj(out)
    expect(m['France Boissons']).toBeCloseTo(10)
    expect(m['Emballages SA']).toBeCloseTo(0.8)
    // Coût d'un combo : chaque enfant compté EN ENTIER (quantité par combo), pas au prorata du prix.
    expect(m.Sysco).toBeCloseTo(4 * 1 * 1.5)
    expect(m[NOT_SET_KEY]).toBeCloseTo(4 * 1 * 0.5)
    expect(out[out.length - 1].key).toBe(NOT_SET_KEY)
    // Article sans coût de recette : jamais un segment à 0.
    expect(supplierCostBreakdown([rec('fries', 5, 20)], index)).toEqual([])
  })

  it('promotion oui / non, type, et remise accordée', () => {
    const recs = [rec('beer', 10, 55), rec('beer-promo', 4, 12)]
    const metric = recordMetric('revenue')
    expect(promotionBreakdown(recs, index, metric)).toEqual([
      { key: PROMO_YES_KEY, value: 12 }, { key: PROMO_NO_KEY, value: 55 },
    ])
    expect(promotionTypeBreakdown(recs, index, metric)).toEqual([{ key: 'Pompier', value: 12 }])
    expect(promotionDiscount(recs, index)).toEqual({ amount: (5.5 - 3) * 4, withoutReference: 0 })
  })

  it('remise : ventes promo sans prix de référence comptées à part', () => {
    const idx = buildDimensionIndex([
      { menuItemId: 'p', promotion: { typeName: null, referencePrice: null, price: 3 }, comboChildren: [] },
    ])
    expect(promotionDiscount([rec('p', 3, 9)], idx)).toEqual({ amount: 0, withoutReference: 3 })
    expect(promotionTypeBreakdown([rec('p', 3, 9)], idx, recordMetric('revenue'))).toEqual([{ key: NOT_SET_KEY, value: 9 }])
  })

  it('options de filtre et props de donut (gris pour Non renseigné)', () => {
    const o = listDimensionOptions(index)
    expect(o.brands).toEqual(['Heineken', 'Maison', NOT_SET_KEY])
    expect(o.suppliers).toContain('Sysco')
    expect(o.promotionTypes).toEqual(['Pompier', NOT_SET_KEY])
    const d = entriesToDonut([{ key: 'A', value: 3 }, { key: NOT_SET_KEY, value: 1 }], (k) => (k === NOT_SET_KEY ? 'NR' : k), ['#111', '#222'])
    expect(d.labels).toEqual(['A', 'NR'])
    expect(d.colors).toEqual(['#111', '#B0BEC5'])
    expect(d.total).toBe(4)
  })
})

describe('articleDimensionFilter', () => {
  it('ne filtre rien sans index chargé ni filtre actif', () => {
    expect(buildArticleDimensionPredicate({ selectedBrands: ['Heineken'] }, null)).toBeNull()
    expect(buildArticleDimensionPredicate({ selectedBrands: [] }, index)).toBeNull()
  })

  it('marque : un combo passe par ses enfants', () => {
    const pass = buildArticleDimensionPredicate({ selectedBrands: ['Maison'] }, index)
    expect(pass(rec('combo', 1, 1))).toBe(true)
    expect(pass(rec('beer', 1, 1))).toBe(false)
    const notSet = buildArticleDimensionPredicate({ selectedBrands: [NOT_SET_KEY] }, index)
    expect(notSet(rec(null, 1, 1))).toBe(true)
    expect(notSet(rec('burger', 1, 1))).toBe(true)
  })

  it('fournisseur : passe si la recette contient ce fournisseur', () => {
    const pass = buildArticleDimensionPredicate({ selectedSuppliers: ['Sysco'] }, index)
    expect(pass(rec('burger', 1, 1))).toBe(true)
    expect(pass(rec('combo', 1, 1))).toBe(true)
    expect(pass(rec('beer', 1, 1))).toBe(false)
    expect(pass(rec(null, 1, 1))).toBe(false)
  })

  it('industriel, promotion et type de promotion', () => {
    expect(buildArticleDimensionPredicate({ selectedIndustrials: ['McCain'] }, index)(rec('burger', 1, 1))).toBe(true)
    expect(buildArticleDimensionPredicate({ selectedIndustrials: [NOT_SET_KEY] }, index)(rec('fries', 1, 1))).toBe(true)
    const promo = buildArticleDimensionPredicate({ selectedPromotions: [PROMO_YES_KEY] }, index)
    expect(promo(rec('beer-promo', 1, 1))).toBe(true)
    expect(promo(rec('beer', 1, 1))).toBe(false)
    const type = buildArticleDimensionPredicate({ selectedPromotionTypes: ['Pompier'] }, index)
    expect(type(rec('beer-promo', 1, 1))).toBe(true)
    expect(type(rec('beer', 1, 1))).toBe(false)
  })

  it('est branché sur buildItemFilterPredicate (avec les autres filtres)', () => {
    const keep = buildItemFilterPredicate(
      { selectedBrands: ['Heineken'], selectedMenuItemTypes: [] },
      { skipMinute: true, articleDimensions: index },
    )
    expect(keep({ ...rec('beer', 1, 1), shopName: 'Bar' })).toBe(true)
    expect(keep({ ...rec('fries', 1, 1), shopName: 'Bar' })).toBe(false)
    // Sans index (endpoint pas encore répondu) : aucun filtrage, la page ne se vide pas.
    const loading = buildItemFilterPredicate({ selectedBrands: ['Heineken'] }, { skipMinute: true })
    expect(loading({ ...rec('fries', 1, 1), shopName: 'Bar' })).toBe(true)
  })
})
