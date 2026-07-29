import {
  comboKey,
  comboLabel,
  groupBasketsByCombo,
  COMBO_KEY_SEP,
  OTHERS_COMBO_KEY,
} from '@/utils/transactionBaskets'
import { buildItemFilterPredicate, resolveShopType } from '@/utils/analyseDimensions'
import {
  buildReconciliationContext,
  reconcileRecord,
  UNATTACHED_SHOP_KEY,
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

  it('neutralise les filtres ARTICLE en vidant leurs tableaux (décision produit #42)', () => {
    const pageFilters = { selectedMenuItemCategories: ['Bières'], selectedShopIds: ['Bar Nord'] }
    const keep = buildItemFilterPredicate({
      ...pageFilters,
      selectedMenuItemIds: [],
      selectedMenuItemTypes: [],
      selectedMenuItemCategories: [],
    })
    // Le panier passe malgré le filtre catégorie actif sur la page : les paniers
    // n'ont pas de dimension article résolue, les appliquer les supprimerait tous.
    expect([reconcileRecord(basket(), ctx)].filter(keep)).toHaveLength(1)
  })
})
