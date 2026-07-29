import {
  comboKey,
  comboLabel,
  groupBasketsByCombo,
  buildBasketFilterPredicate,
  COMBO_KEY_SEP,
  OTHERS_COMBO_KEY,
} from '@/utils/transactionBaskets'
import { buildItemFilterPredicate, resolveShopType } from '@/utils/analyseDimensions'
import {
  buildReconciliationContext,
  reconcileRecord,
  UNATTACHED_SHOP_KEY,
  UNATTACHED_ITEM_KEY,
} from '@/utils/analyseReconciliation'

// Donut « Répartition des catégories de produits par transaction ».
// Ce calcul produit TOUS les pourcentages affichés : une erreur ici est
// silencieuse et fausse la lecture métier (« 44 % bière seule »).

const PALETTE = ['#a', '#b', '#c', '#d']
const OPTS = { topN: 3, unmatchedLabel: 'Non rattachés', othersLabel: 'Autres', palette: PALETTE }

/** BasketComboRecord minimal. */
function rec(categoryCombo, transactionCount, itemCombo = []) {
  return { categoryCombo, itemCombo, transactionCount }
}

const byCategory = (r) => r.categoryCombo
const byItem = (r) => r.itemCombo

describe('comboKey', () => {
  it('utilise un séparateur qui ne peut pas apparaître dans un libellé', () => {
    expect(COMBO_KEY_SEP).toBe('\u001f')
    expect(COMBO_KEY_SEP).not.toBe(', ')
  })

  it('ne confond pas un article contenant une virgule avec une combinaison de deux', () => {
    // Le piège que le séparateur évite : avec ', ' ces deux clés seraient égales.
    expect(comboKey(['Pichet Biere 1,5l'])).not.toBe(comboKey(['Pichet Biere 1', '5l']))
  })

  it('distingue deux combinaisons de même longueur', () => {
    expect(comboKey(['Bières', 'Consigne'])).not.toBe(comboKey(['Bières', 'Snack']))
  })

  it('représente une entrée non résolue par une chaîne vide, stable', () => {
    expect(comboKey([null])).toBe(comboKey([null]))
    expect(comboKey(['Bières', null])).toBe(comboKey(['Bières', null]))
  })

  it('tolère une combinaison absente', () => {
    expect(comboKey(null)).toBe('')
    expect(comboKey([])).toBe('')
  })
})

describe('comboLabel', () => {
  it('joint les entrées par « , »', () => {
    expect(comboLabel(['Bières', 'Boissons Soft'], 'Non rattachés')).toBe('Bières, Boissons Soft')
  })

  it('remplace les entrées non résolues par le libellé fourni', () => {
    expect(comboLabel(['Bières', null], 'Non rattachés')).toBe('Bières, Non rattachés')
    expect(comboLabel([null], 'Non rattachés')).toBe('Non rattachés')
  })

  it('retombe sur le libellé de repli pour une combinaison vide', () => {
    expect(comboLabel([], 'Non rattachés')).toBe('Non rattachés')
  })
})

describe('groupBasketsByCombo', () => {
  it('additionne les transactions des records de MÊME combinaison', () => {
    const out = groupBasketsByCombo(
      [rec(['Bières'], 10), rec(['Bières'], 5), rec(['Snack'], 2)],
      byCategory,
      OPTS,
    )
    expect(out.labels).toEqual(['Bières', 'Snack'])
    expect(out.values).toEqual([15, 2])
  })

  it('trie par nombre de transactions décroissant', () => {
    const out = groupBasketsByCombo(
      [rec(['Snack'], 2), rec(['Bières'], 44), rec(['Boissons Soft'], 9)],
      byCategory,
      OPTS,
    )
    expect(out.labels).toEqual(['Bières', 'Boissons Soft', 'Snack'])
  })

  it('ne sépare pas les combinaisons multi-catégories des simples', () => {
    const out = groupBasketsByCombo(
      [rec(['Bières'], 44), rec(['Bières', 'Boissons Soft'], 6)],
      byCategory,
      OPTS,
    )
    expect(out.labels).toEqual(['Bières', 'Bières, Boissons Soft'])
    expect(out.values).toEqual([44, 6])
  })

  it('agrège la queue au-delà du top N dans « Autres », en dernier', () => {
    const out = groupBasketsByCombo(
      [rec(['A'], 10), rec(['B'], 8), rec(['C'], 6), rec(['D'], 4), rec(['E'], 1)],
      byCategory,
      OPTS, // topN = 3
    )
    expect(out.labels).toEqual(['A', 'B', 'C', 'Autres'])
    expect(out.values).toEqual([10, 8, 6, 5]) // 4 + 1
  })

  it('rend le bucket « Autres » NON drillable via une clé nulle', () => {
    const out = groupBasketsByCombo(
      [rec(['A'], 4), rec(['B'], 3), rec(['C'], 2), rec(['D'], 1)],
      byCategory,
      OPTS,
    )
    expect(out.keys.at(-1)).toBe(OTHERS_COMBO_KEY)
    expect(out.keys.at(-1)).toBeNull()
  })

  it('n’ajoute pas de bucket « Autres » quand tout tient dans le top N', () => {
    const out = groupBasketsByCombo([rec(['A'], 4), rec(['B'], 3)], byCategory, OPTS)
    expect(out.labels).toEqual(['A', 'B'])
    expect(out.keys).not.toContain(OTHERS_COMBO_KEY)
  })

  it('COMPTE les paniers non résolus au lieu de les écarter', () => {
    // Convention maison : afficher « Non rattachés » plutôt que sous-compter.
    const out = groupBasketsByCombo(
      [rec(['Bières'], 10), rec([null], 4), rec(['Bières', null], 3)],
      byCategory,
      OPTS,
    )
    expect(out.values.reduce((a, b) => a + b, 0)).toBe(17)
    expect(out.labels).toContain('Non rattachés')
    expect(out.labels).toContain('Bières, Non rattachés')
  })

  it('préserve le total : la somme des parts égale la somme des transactions', () => {
    const records = [rec(['A'], 10), rec(['B'], 8), rec(['C'], 6), rec(['D'], 4), rec(['E'], 1)]
    const out = groupBasketsByCombo(records, byCategory, OPTS)
    const expected = records.reduce((sum, r) => sum + r.transactionCount, 0)
    expect(out.values.reduce((a, b) => a + b, 0)).toBe(expected)
  })

  it('fonctionne à l’identique au grain ARTICLE (donut de droite)', () => {
    const out = groupBasketsByCombo(
      [
        rec(['Bières'], 5, ['50cl Heineken']),
        rec(['Bières'], 3, ['Consigne Pichet', 'Pichet Biere 1,5l']),
      ],
      byItem,
      OPTS,
    )
    expect(out.labels).toEqual(['50cl Heineken', 'Consigne Pichet, Pichet Biere 1,5l'])
    expect(out.values).toEqual([5, 3])
  })

  it('cycle la palette au-delà de sa longueur', () => {
    const out = groupBasketsByCombo(
      [rec(['A'], 5), rec(['B'], 4), rec(['C'], 3), rec(['D'], 2), rec(['E'], 1)],
      byCategory,
      { ...OPTS, topN: 10 },
    )
    expect(out.colors).toEqual(['#a', '#b', '#c', '#d', '#a'])
  })

  it('retourne une structure vide sans record', () => {
    expect(groupBasketsByCombo([], byCategory, OPTS)).toEqual({
      keys: [], labels: [], values: [], colors: [],
    })
    expect(groupBasketsByCombo(null, byCategory, OPTS).values).toEqual([])
  })
})

// Les records de panier sortent BRUTS du SQL. Les donuts « type de PdV » / « zone »
// émettent en revanche des clés RÉCONCILIÉES : sans réconciliation préalable, un
// clic viderait le graphique. Même invariant que BUG-244-01, un cran plus loin.
describe('réconciliation des paniers avant filtrage (AnalyseView.filteredBaskets)', () => {
  const floorElements = [
    { id: 'el1', name: 'Bar Nord', shopType: ['beverages'], floorName: 'Niveau 0', area: 'Zone brute' },
  ]
  const ctx = buildReconciliationContext({
    menuItems: [],
    productCategories: [],
    productTypes: [],
    floorElements,
    assignment: null,
    assignmentItemsByShop: null,
    weezeventProducts: [],
  })

  /** BasketComboRecord tel que renvoyé par GET /spaces/:id/transaction-baskets. */
  function basket(over = {}) {
    return {
      minute: '20:30',
      shopId: 'el1',
      shopName: 'Bar Nord',
      shopType: 'beverages',
      shopArea: 'Zone brute',
      categoryCombo: ['Bières', 'Boissons Soft'],
      itemCombo: ['50cl Heineken', 'Coca Cola'],
      transactionCount: 4,
      quantity: 8,
      revenueHt: 32,
      ...over,
    }
  }

  it('préserve les combinaisons et le compte à travers reconcileRecord', () => {
    const out = reconcileRecord(basket(), ctx)
    expect(out.categoryCombo).toEqual(['Bières', 'Boissons Soft'])
    expect(out.itemCombo).toEqual(['50cl Heineken', 'Coca Cola'])
    expect(out.transactionCount).toBe(4)
  })

  it('recalcule la zone depuis le FloorElement — le champ brut n’est qu’un repli', () => {
    // C'est le piège : le donut « zone » émet « Niveau 0 » (floorName), pas la
    // valeur brute portée par le record.
    const raw = basket()
    const out = reconcileRecord(raw, ctx)
    expect(raw.shopArea).toBe('Zone brute')
    expect(out.shopArea).toBe('Niveau 0')
    expect(out.shopArea).not.toBe(raw.shopArea)
  })

  it('un filtre de zone issu du donut retrouve le panier APRÈS réconciliation, pas avant', () => {
    const f = { selectedShopAreas: ['Niveau 0'] }
    const keep = buildItemFilterPredicate(f)
    expect([basket()].filter(keep)).toHaveLength(0)                       // brut → vide
    expect([reconcileRecord(basket(), ctx)].filter(keep)).toHaveLength(1) // réconcilié → trouvé
  })

  it('classe un PdV non mappé sous la sentinelle, que le donut sait émettre', () => {
    const orphan = reconcileRecord(basket({ shopId: 'loc-brut', shopName: 'PdV inconnu', shopType: null }), ctx)
    expect(resolveShopType(orphan)).toBe(UNATTACHED_SHOP_KEY)
    const keep = buildItemFilterPredicate({ selectedShopTypes: [UNATTACHED_SHOP_KEY] })
    expect([orphan].filter(keep)).toHaveLength(1)
  })

  it('applique le curseur horaire (un panier porte un `minute`, contrairement aux scénarios)', () => {
    const keep = buildItemFilterPredicate({ selectedTimeRange: { start: '21:00', end: '22:00' } })
    expect([reconcileRecord(basket(), ctx)].filter(keep)).toHaveLength(0)
    expect([reconcileRecord(basket({ minute: '21:30' }), ctx)].filter(keep)).toHaveLength(1)
  })

})

// Sémantique « CONTIENT », tranchée par l'owner (JLH) le 2026-07-29 — question #42 :
// filtrer « Bières » garde les tickets qui contiennent de la bière, paniers MIXTES
// compris, et non les seuls tickets 100 % bière. C'est la décision qui fixe le
// dénominateur, donc tous les pourcentages affichés.
describe('buildBasketFilterPredicate — sémantique « contient »', () => {
  const beerOnly = {
    shopName: 'Bar Nord', minute: '20:30',
    categoryCombo: ['Bières'], typeCombo: ['Beverage'], itemCombo: ['50cl Heineken'],
    transactionCount: 44,
  }
  const beerAndSoft = {
    shopName: 'Bar Nord', minute: '20:31',
    categoryCombo: ['Bières', 'Boissons Soft'], typeCombo: ['Beverage'],
    itemCombo: ['50cl Heineken', 'Coca Cola'], transactionCount: 6,
  }
  const softOnly = {
    shopName: 'Bar Nord', minute: '20:32',
    categoryCombo: ['Boissons Soft'], typeCombo: ['Beverage'],
    itemCombo: ['Coca Cola'], transactionCount: 9,
  }
  const foodOnly = {
    shopName: 'Food Court', minute: '20:33',
    categoryCombo: ['Sides'], typeCombo: ['Food'], itemCombo: ['Frites'],
    transactionCount: 12,
  }
  const all = [beerOnly, beerAndSoft, softOnly, foodOnly]
  const keep = (f) => all.filter(buildBasketFilterPredicate(f))

  it('ne filtre rien sans sélection', () => {
    expect(keep({})).toHaveLength(4)
  })

  it('GARDE les paniers mixtes — c’est la décision #42', () => {
    const out = keep({ selectedMenuItemCategories: ['Bières'] })
    expect(out).toContain(beerOnly)
    expect(out).toContain(beerAndSoft) // « contient », pas « uniquement »
    expect(out).toHaveLength(2)
  })

  it('n’est PAS « uniquement » : le mixte ne doit pas être exclu', () => {
    // Le test qui échouerait si on avait implémenté l'autre lecture.
    expect(keep({ selectedMenuItemCategories: ['Bières'] })).not.toEqual([beerOnly])
  })

  it('écarte les paniers qui ne contiennent pas la catégorie', () => {
    const out = keep({ selectedMenuItemCategories: ['Bières'] })
    expect(out).not.toContain(softOnly)
    expect(out).not.toContain(foodOnly)
  })

  it('multi-sélection = OU, comme partout ailleurs dans la page', () => {
    const out = keep({ selectedMenuItemCategories: ['Bières', 'Sides'] })
    expect(out).toHaveLength(3) // beerOnly + beerAndSoft + foodOnly
    expect(out).not.toContain(softOnly)
  })

  it('filtre par TYPE d’article sur typeCombo', () => {
    expect(keep({ selectedMenuItemTypes: ['Food'] })).toEqual([foodOnly])
    expect(keep({ selectedMenuItemTypes: ['Beverage'] })).toHaveLength(3)
  })

  it('filtre par NOM d’article, casse ignorée', () => {
    const out = keep({ selectedMenuItemIds: ['coca cola'] })
    expect(out).toContain(beerAndSoft)
    expect(out).toContain(softOnly)
    expect(out).toHaveLength(2)
  })

  it('combine les dimensions article et PdV en ET', () => {
    expect(keep({ selectedMenuItemCategories: ['Bières'], selectedShopIds: ['Food Court'] })).toHaveLength(0)
    expect(keep({ selectedMenuItemCategories: ['Sides'], selectedShopIds: ['Food Court'] })).toEqual([foodOnly])
  })

  it('fait matcher la part grise « Non rattachés » sur une entrée null', () => {
    // Le donut émet UNATTACHED_ITEM_KEY ; le backend renvoie null. Sans cette
    // équivalence, cliquer la part grise ne retrouverait aucun panier.
    const orphan = { shopName: 'Bar Nord', minute: '20:34', categoryCombo: ['Bières', null], typeCombo: [], itemCombo: ['?'], transactionCount: 3 }
    const out = [beerOnly, orphan].filter(
      buildBasketFilterPredicate({ selectedMenuItemCategories: [UNATTACHED_ITEM_KEY] }),
    )
    expect(out).toEqual([orphan])
  })

  it('applique aussi le curseur horaire', () => {
    expect(keep({ selectedTimeRange: { start: '20:32', end: '20:35' } })).toEqual([softOnly, foodOnly])
  })
})
