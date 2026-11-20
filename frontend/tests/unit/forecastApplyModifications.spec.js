import { applyForecastModifications } from '@/utils/forecastApplyModifications'
import {
  FORECAST_MODIFICATION_TYPES as T,
  createModification,
  addModification,
} from '@/utils/forecastModificationModel'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'

const mod = (type, fields) => createModification(type, fields)

const catalogById = new Map([
  ['m1', { id: 'm1', basePrice: 8, pricing: { vatRate: 10 } }],
  ['m2', { id: 'm2', basePrice: 4, pricing: { vatRate: 10 } }],
  ['m3', { id: 'm3' }], // aucun prix
])

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(deepFreeze)
  }
  return o
}

function fixtures() {
  const art = (over) => ({
    eventId: 'e1', shopId: 's1', shopName: 'Bar A',
    menuItemId: 'm1', menuItemCategory: 'Bières', menuItemType: 'Boisson',
    quantity: 10, revenue: 100, transactionCount: 8,
    ...over,
  })
  const articleRecords = [
    art({}), // 0 : e1 / s1 / bière
    art({ menuItemId: 'm2', menuItemCategory: 'Softs', quantity: 5, revenue: 50, transactionCount: 4 }), // 1
    art({ shopId: 's2', shopName: 'Bar B', quantity: 4, revenue: 40, transactionCount: 3 }), // 2
    art({ // 3 : vente non rattachée, jamais ciblée
      menuItemId: null, menuItemCategory: UNATTACHED_ITEM_KEY, menuItemType: UNATTACHED_ITEM_KEY,
      quantity: 2, revenue: 20, transactionCount: 2,
    }),
    art({ eventId: 'e2', shopId: 's3', shopName: 'Bar C', quantity: 2, revenue: 20, transactionCount: 2 }), // 4
  ]
  const chart = (over) => ({
    eventId: 'e1', shopId: 's1', shopName: 'Bar A', menuItemId: null,
    quantity: 17, revenue: 170, transactionCount: 14,
    ...over,
  })
  const chartRecords = [
    chart({}), // 0 : e1 / s1
    chart({ shopId: 's2', shopName: 'Bar B', quantity: 4, revenue: 40, transactionCount: 3 }), // 1
    chart({ eventId: 'e2', shopId: 's3', shopName: 'Bar C', quantity: 2, revenue: 20, transactionCount: 2 }), // 2
    chart({ eventId: 'e3', shopId: 's9', shopName: 'Bar Z', quantity: 6, revenue: 60, transactionCount: 5 }), // 3 : sans grain article
  ]
  return { articleRecords, chartRecords }
}

function run(modifications, data = fixtures()) {
  return { data, out: applyForecastModifications({ ...data, modifications, catalogById, spaceId: null }) }
}

const NEUTRAL_STATS = {
  priceModificationCount: 0,
  eventsWithArticleGrain: [],
  eventsWithoutArticleGrain: [],
  unpriceableItemIds: [],
  untargetableRecordCount: 0,
}

describe('liste vide ou sans modification valide', () => {
  it('renvoie les mêmes tableaux (mêmes références) et des stats neutres', () => {
    const { data, out } = run([])
    expect(out.articleRecords).toBe(data.articleRecords)
    expect(out.chartRecords).toBe(data.chartRecords)
    expect(out.stats).toEqual(NEUTRAL_STATS)
  })

  it('liste absente ou uniquement invalide : idem', () => {
    const a = run(undefined)
    expect(a.out.articleRecords).toBe(a.data.articleRecords)
    expect(a.out.chartRecords).toBe(a.data.chartRecords)
    const b = run([mod(T.BASKET, { value: 999 }), mod(T.ITEM_PRICE, { value: 3 })])
    expect(b.out.articleRecords).toBe(b.data.articleRecords)
    expect(b.out.chartRecords).toBe(b.data.chartRecords)
    expect(b.out.stats).toEqual(NEUTRAL_STATS)
  })
})

describe('+0 % neutre', () => {
  it('toutes les valeurs restent égales', () => {
    const list = [
      mod(T.TRANSFORMATION, { value: 0 }),
      mod(T.BASKET, { value: 0 }),
      mod(T.PERCAP, { mode: 'basket', value: 0 }),
      mod(T.CATEGORY_PCT, { target: 'Bières', value: 0 }),
      mod(T.ITEM_PRICE, { target: 'm2', value: 4 }),
    ]
    const { data, out } = run(list)
    expect(out.articleRecords).toEqual(data.articleRecords)
    expect(out.chartRecords).toEqual(data.chartRecords)
  })
})

describe('leviers de volume et de panier', () => {
  it('transformation +10 % et basket +10 % : CA x1,21, quantités et transactions x1,1', () => {
    const { data, out } = run([
      mod(T.TRANSFORMATION, { value: 10 }),
      mod(T.BASKET, { value: 10 }),
    ])
    data.articleRecords.forEach((rec, i) => {
      const o = out.articleRecords[i]
      expect(o.revenue).toBeCloseTo(rec.revenue * 1.21, 8)
      expect(o.quantity).toBeCloseTo(rec.quantity * 1.1, 8)
      expect(o.transactionCount).toBeCloseTo(rec.transactionCount * 1.1, 8)
    })
    data.chartRecords.forEach((rec, i) => {
      const o = out.chartRecords[i]
      expect(o.revenue).toBeCloseTo(rec.revenue * 1.21, 8)
      expect(o.quantity).toBeCloseTo(rec.quantity * 1.1, 8)
      expect(o.transactionCount).toBeCloseTo(rec.transactionCount * 1.1, 8)
    })
  })

  it('transformation et percap (mode transformation) se multiplient', () => {
    const { data, out } = run([
      mod(T.TRANSFORMATION, { value: 10 }),
      mod(T.PERCAP, { mode: 'transformation', value: 10 }),
    ])
    expect(out.articleRecords[0].quantity).toBeCloseTo(data.articleRecords[0].quantity * 1.21, 8)
    expect(out.articleRecords[0].revenue).toBeCloseTo(data.articleRecords[0].revenue * 1.21, 8)
  })

  it('basket et percap (mode basket) : CA seul, quantités et transactions inchangées', () => {
    const { data, out } = run([
      mod(T.BASKET, { value: 10 }),
      mod(T.PERCAP, { mode: 'basket', value: 10 }),
    ])
    ;['articleRecords', 'chartRecords'].forEach((key) => {
      data[key].forEach((rec, i) => {
        const o = out[key][i]
        expect(o.revenue).toBeCloseTo(rec.revenue * 1.21, 8)
        expect(o.quantity).toBe(rec.quantity)
        expect(o.transactionCount).toBe(rec.transactionCount)
      })
    })
  })

  it('percap seul en mode basket : CA x1,2, volumes inchangés', () => {
    const { data, out } = run([mod(T.PERCAP, { mode: 'basket', value: 20 })])
    expect(out.articleRecords[0].revenue).toBeCloseTo(120, 8)
    expect(out.articleRecords[0].quantity).toBe(data.articleRecords[0].quantity)
  })

  it('les leviers s\'appliquent aussi aux ventes non rattachées et aux events sans grain article', () => {
    const { out } = run([mod(T.TRANSFORMATION, { value: 50 })])
    expect(out.articleRecords[3].quantity).toBe(3)
    expect(out.chartRecords[3].revenue).toBeCloseTo(90, 8)
  })

  it('transformation -100 % : tout tombe à 0', () => {
    const { out } = run([mod(T.TRANSFORMATION, { value: -100 })])
    expect(out.articleRecords.every((r) => r.quantity === 0 && r.revenue === 0)).toBe(true)
    expect(out.chartRecords.every((r) => r.quantity === 0 && r.revenue === 0)).toBe(true)
  })
})

describe('prix : effet sur le CA seul', () => {
  it('categoryPct +10 % : CA des articles de la catégorie x1,1, rien d\'autre ne bouge', () => {
    const { data, out } = run([mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 })])
    const a = out.articleRecords
    expect(a[0].revenue).toBeCloseTo(110, 8)
    expect(a[2].revenue).toBeCloseTo(44, 8)
    expect(a[4].revenue).toBeCloseTo(22, 8)
    expect(a[1]).toBe(data.articleRecords[1]) // Softs : inchangé, même référence
    expect(a[3]).toBe(data.articleRecords[3]) // non rattaché : inchangé
    a.forEach((rec, i) => {
      expect(rec.quantity).toBe(data.articleRecords[i].quantity)
      expect(rec.transactionCount).toBe(data.articleRecords[i].transactionCount)
    })
  })

  it('typePct -20 % : tous les articles du type', () => {
    const { out } = run([mod(T.TYPE_PCT, { target: 'Boisson', value: -20 })])
    expect(out.articleRecords[0].revenue).toBeCloseTo(80, 8)
    expect(out.articleRecords[1].revenue).toBeCloseTo(40, 8)
    expect(out.articleRecords[3].revenue).toBe(20) // sentinelle : intacte
  })

  it('-100 % sur une catégorie : CA de ces articles à 0, quantités conservées', () => {
    const { data, out } = run([mod(T.CATEGORY_PCT, { target: 'Bières', value: -100 })])
    expect(out.articleRecords[0].revenue).toBe(0)
    expect(out.articleRecords[2].revenue).toBe(0)
    expect(out.articleRecords[4].revenue).toBe(0)
    expect(out.articleRecords[0].quantity).toBe(data.articleRecords[0].quantity)
    expect(out.articleRecords[1].revenue).toBe(50)
  })

  it('itemPrice : CA x (nouveau TTC / TTC catalogue)', () => {
    const { out } = run([mod(T.ITEM_PRICE, { target: 'm1', value: 10 })])
    expect(out.articleRecords[0].revenue).toBeCloseTo(125, 8) // 100 x 10/8
    expect(out.articleRecords[2].revenue).toBeCloseTo(50, 8)
    expect(out.articleRecords[1].revenue).toBe(50) // m2 inchangé
  })

  it('itemPrice égal au TTC catalogue : valeurs inchangées', () => {
    const { data, out } = run([mod(T.ITEM_PRICE, { target: 'm1', value: 8 })])
    expect(out.articleRecords).toEqual(data.articleRecords)
    expect(out.chartRecords).toEqual(data.chartRecords)
    expect(out.stats.unpriceableItemIds).toEqual([])
  })

  it('prix, transformation et panier se multiplient sur un article', () => {
    const { out } = run([
      mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }),
      mod(T.TRANSFORMATION, { value: 10 }),
      mod(T.BASKET, { value: 10 }),
    ])
    expect(out.articleRecords[0].revenue).toBeCloseTo(100 * 1.1 * 1.1 * 1.1, 8)
    expect(out.articleRecords[0].quantity).toBeCloseTo(11, 8)
    expect(out.articleRecords[1].revenue).toBeCloseTo(50 * 1.1 * 1.1, 8) // Softs : pas de prix
  })

  it('catégorie ou type sans article correspondant : aucun effet', () => {
    const { data, out } = run([mod(T.CATEGORY_PCT, { target: 'Inconnue', value: 50 })])
    expect(out.articleRecords).toEqual(data.articleRecords)
    expect(out.chartRecords).toEqual(data.chartRecords)
  })
})

describe('la dernière modification de prix l\'emporte', () => {
  const item = mod(T.ITEM_PRICE, { target: 'm1', value: 12 }) // x1,5
  const cat = mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }) // x1,1

  it('itemPrice puis categoryPct sur la même catégorie : la catégorie gagne', () => {
    const { out } = run([item, cat])
    expect(out.articleRecords[0].revenue).toBeCloseTo(110, 8)
  })

  it('categoryPct puis itemPrice : l\'article gagne', () => {
    const { out } = run([cat, item])
    expect(out.articleRecords[0].revenue).toBeCloseTo(150, 8)
  })

  it('re-ajout de la même clé : remplace la valeur précédente', () => {
    let list = addModification([], mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }))
    list = addModification(list, mod(T.CATEGORY_PCT, { target: 'Bières', value: 30 }))
    expect(list).toHaveLength(1)
    const { out } = run(list)
    expect(out.articleRecords[0].revenue).toBeCloseTo(130, 8)
  })

  it('même levier ajouté deux fois dans une liste brute : le dernier l\'emporte', () => {
    const { out } = run([mod(T.TRANSFORMATION, { value: 10 }), mod(T.TRANSFORMATION, { value: 50 })])
    expect(out.articleRecords[0].quantity).toBeCloseTo(15, 8)
  })
})

describe('articles non ciblables et non modifiables', () => {
  it('sentinelle et article sans menuItemId jamais ciblés', () => {
    const list = [
      mod(T.CATEGORY_PCT, { target: UNATTACHED_ITEM_KEY, value: 50 }),
      mod(T.TYPE_PCT, { target: UNATTACHED_ITEM_KEY, value: 50 }),
    ]
    const { data, out } = run(list)
    expect(out.articleRecords).toEqual(data.articleRecords)
    expect(out.articleRecords[3]).toBe(data.articleRecords[3])
    expect(out.stats.untargetableRecordCount).toBe(1)
    expect(out.stats.priceModificationCount).toBe(2)
  })

  it('article sans menuItemId mais portant une catégorie réelle : jamais ciblé', () => {
    const data = fixtures()
    data.articleRecords[3] = { ...data.articleRecords[3], menuItemCategory: 'Bières', menuItemType: 'Boisson' }
    const { out } = run([mod(T.CATEGORY_PCT, { target: 'Bières', value: 50 })], data)
    expect(out.articleRecords[3].revenue).toBe(20)
    expect(out.stats.untargetableRecordCount).toBe(1)
  })

  it('mappedMenuItemId est reconnu comme identifiant d\'article', () => {
    const data = fixtures()
    data.articleRecords[0] = { ...data.articleRecords[0], menuItemId: undefined, mappedMenuItemId: 'm1' }
    const { out } = run([mod(T.ITEM_PRICE, { target: 'm1', value: 10 })], data)
    expect(out.articleRecords[0].revenue).toBeCloseTo(125, 8)
  })

  it('article sans prix catalogue : CA inchangé et signalé non modifiable', () => {
    const data = fixtures()
    data.articleRecords[1] = { ...data.articleRecords[1], menuItemId: 'm3' }
    const { out } = run([mod(T.ITEM_PRICE, { target: 'm3', value: 5 })], data)
    expect(out.articleRecords[1].revenue).toBe(50)
    expect(out.stats.unpriceableItemIds).toEqual(['m3'])
  })

  it('pas de diagnostic de prix quand la liste ne contient que des leviers', () => {
    const { out } = run([mod(T.TRANSFORMATION, { value: 10 })])
    expect(out.stats).toEqual(NEUTRAL_STATS)
  })
})

describe('ratio de prix des records PdV', () => {
  const cat = mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 })

  it('cas nominal : somme des CA article après prix / somme de base, par event et PdV', () => {
    const { out } = run([cat])
    // e1 / s1 : base 100 + 50 + 20 = 170, après prix 110 + 50 + 20 = 180
    expect(out.chartRecords[0].revenue).toBeCloseTo(170 * (180 / 170), 8)
    // e1 / s2 : seulement des bières, ratio 1,1
    expect(out.chartRecords[1].revenue).toBeCloseTo(44, 8)
    // e2 / s3 : ratio 1,1
    expect(out.chartRecords[2].revenue).toBeCloseTo(22, 8)
    // quantités et transactions du graphe inchangées par un prix
    expect(out.chartRecords[0].quantity).toBe(17)
    expect(out.chartRecords[0].transactionCount).toBe(14)
  })

  it('repli par shopName (insensible à la casse) quand l\'identifiant de PdV est inconnu', () => {
    const data = fixtures()
    data.chartRecords = [
      { eventId: 'e1', shopId: 'inconnu', shopName: ' bar b ', quantity: 4, revenue: 40, transactionCount: 3 },
    ]
    const { out } = run([cat], data)
    expect(out.chartRecords[0].revenue).toBeCloseTo(44, 8) // ratio de Bar B (1,1), pas celui de l'event
  })

  it('repli par shopName quand le record n\'a pas d\'identifiant de PdV', () => {
    const data = fixtures()
    data.chartRecords = [{ eventId: 'e1', shopName: 'Bar A', quantity: 17, revenue: 170, transactionCount: 14 }]
    const { out } = run([cat], data)
    expect(out.chartRecords[0].revenue).toBeCloseTo(180, 8)
  })

  it('repli sur l\'event entier quand ni l\'identifiant ni le nom ne correspondent', () => {
    const data = fixtures()
    data.chartRecords = [
      { eventId: 'e1', shopId: 'x', shopName: 'Inconnu', quantity: 10, revenue: 210, transactionCount: 9 },
    ]
    const { out } = run([cat], data)
    // e1 entier : base 100 + 50 + 40 + 20 = 210, après prix 110 + 50 + 44 + 20 = 224
    expect(out.chartRecords[0].revenue).toBeCloseTo(224, 8)
  })

  it('event sans grain article : ratio 1 et compté dans les stats', () => {
    const { out } = run([cat])
    expect(out.chartRecords[3].revenue).toBe(60)
    expect(out.stats.eventsWithoutArticleGrain).toEqual(['e3'])
    expect(out.stats.eventsWithArticleGrain).toEqual(['e1', 'e2'])
  })

  it('event sans grain article : les leviers de volume et de panier s\'appliquent quand même', () => {
    const { out } = run([cat, mod(T.BASKET, { value: 10 })])
    expect(out.chartRecords[3].revenue).toBeCloseTo(66, 8)
  })

  it('identifiant de PdV côté article : elementId quand shopId est absent', () => {
    const data = fixtures()
    data.articleRecords = data.articleRecords.map((r) => ({ ...r, shopId: undefined, elementId: r.shopId }))
    data.chartRecords = [{ eventId: 'e1', shopId: 's2', shopName: 'sans rapport', quantity: 4, revenue: 40, transactionCount: 3 }]
    const { out } = run([cat], data)
    expect(out.chartRecords[0].revenue).toBeCloseTo(44, 8) // trouvé par identifiant, pas par nom
  })

  it('un PdV sans CA article de base (somme nulle) retombe sur l\'event', () => {
    const data = fixtures()
    data.articleRecords = [
      { eventId: 'e1', shopId: 's1', shopName: 'Bar A', menuItemId: 'm1', menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 1, revenue: 0, transactionCount: 1 },
      { eventId: 'e1', shopId: 's2', shopName: 'Bar B', menuItemId: 'm1', menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 1, revenue: 100, transactionCount: 1 },
    ]
    data.chartRecords = [{ eventId: 'e1', shopId: 's1', shopName: 'Bar A', quantity: 1, revenue: 10, transactionCount: 1 }]
    const { out } = run([cat], data)
    expect(out.chartRecords[0].revenue).toBeCloseTo(11, 8)
  })
})

describe('stats', () => {
  it('compte les modifications de prix actives, pas les leviers', () => {
    const { out } = run([
      mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }),
      mod(T.TYPE_PCT, { target: 'Boisson', value: 5 }),
      mod(T.ITEM_PRICE, { target: 'm1', value: 9 }),
      mod(T.BASKET, { value: 10 }),
    ])
    expect(out.stats.priceModificationCount).toBe(3)
  })
})

describe('immutabilité', () => {
  it('ne mute jamais les entrées (données gelées en profondeur)', () => {
    const data = fixtures()
    const snapshot = JSON.parse(JSON.stringify(data))
    deepFreeze(data)
    const list = deepFreeze([
      mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }),
      mod(T.TRANSFORMATION, { value: 10 }),
      mod(T.BASKET, { value: 10 }),
    ])
    expect(() =>
      applyForecastModifications({ ...data, modifications: list, catalogById, spaceId: null }),
    ).not.toThrow()
    expect(data).toEqual(snapshot)
  })

  it('renvoie de nouveaux objets pour les records modifiés et de nouveaux tableaux', () => {
    const { data, out } = run([mod(T.TRANSFORMATION, { value: 10 })])
    expect(out.articleRecords).not.toBe(data.articleRecords)
    expect(out.chartRecords).not.toBe(data.chartRecords)
    expect(out.articleRecords[0]).not.toBe(data.articleRecords[0])
    expect(data.articleRecords[0].quantity).toBe(10)
  })

  it('n\'ajoute pas de champ absent du record et conserve les autres champs', () => {
    const data = fixtures()
    data.chartRecords = [{ eventId: 'e1', shopId: 's1', shopName: 'Bar A', revenue: 100, label: 'x' }]
    const { out } = run([mod(T.TRANSFORMATION, { value: 10 })], data)
    expect(out.chartRecords[0]).toMatchObject({ eventId: 'e1', shopId: 's1', shopName: 'Bar A', label: 'x' })
    expect(out.chartRecords[0].revenue).toBeCloseTo(110, 8)
    expect('quantity' in out.chartRecords[0]).toBe(false)
    expect('transactionCount' in out.chartRecords[0]).toBe(false)
  })
})
