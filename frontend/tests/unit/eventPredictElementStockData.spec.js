/**
 * BUG-291-01 — la vue « Par article » du Réappro listait des PLATS (Hot Dog 53,
 * Tsing Tao 691) alors qu'on ne charge pas des plats dans un camion : on charge
 * des pains, des sauces, des gobelets et des serviettes.
 *
 * `elementStockData` agrège la sortie de `shopStockData` (déjà éclatée par shop)
 * tous stands confondus, avec la MÊME clé `${name}|||${unit}` — c'est ce qui
 * garantit que les deux modes de l'écran ne peuvent pas afficher des lignes
 * différentes pour le même stock.
 */
import EventPredictStockUpSection from '@/components/EventPredictStockUpSection.vue'

const { elementStockData, totalStockCost } = EventPredictStockUpSection.computed

const line = (name, unit, qty, opts = {}) => ({
  id: opts.id ?? `${name}-${unit}`,
  name,
  unit,
  totalQuantity: qty,
  unitCost: opts.unitCost ?? 0,
  itemType: opts.itemType ?? null,
  isExpanded: opts.isExpanded ?? true,
  sources: opts.sources ?? [],
})

const src = (menuItemName, menuItemQuantity, componentQuantity, unit) => ({
  menuItemName,
  menuItemQuantity,
  componentQuantity,
  unit,
})

describe('elementStockData — agrégation tous stands confondus', () => {
  it('fusionne le même élément vendu sur deux stands en UNE ligne', () => {
    const ctx = {
      fbElements: [
        { id: 's6a', name: '6 A' },
        { id: 's1a', name: '1 A' },
      ],
      shopStockData: {
        s6a: [line('Bun - Burger', 'Pc', 105, { unitCost: 0.55 })],
        s1a: [line('Bun - Burger', 'Pc', 60, { unitCost: 0.55 })],
      },
    }

    const rows = elementStockData.call(ctx)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Bun - Burger')
    expect(rows[0].totalQuantity).toBe(165)
    expect(rows[0].shops).toEqual([
      { shopId: 's6a', shopName: '6 A', quantity: 105 },
      { shopId: 's1a', shopName: '1 A', quantity: 60 },
    ])
  })

  it('sépare deux lignes de même nom mais d\'unité différente', () => {
    const ctx = {
      fbElements: [{ id: 's1', name: '1 A' }],
      shopStockData: {
        s1: [line('Sauce burger', 'kg', 2.1), line('Sauce burger', 'L', 0.5)],
      },
    }

    const rows = elementStockData.call(ctx)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.unit).sort()).toEqual(['L', 'kg'])
  })

  it('fusionne les sources par plat : un gobelet partagé par 3 recettes = 1 ligne, 3 sources', () => {
    const ctx = {
      fbElements: [
        { id: 's1', name: '1 A' },
        { id: 's2', name: '2 A' },
      ],
      shopStockData: {
        s1: [
          line('Cup 50cl', 'Pc', 366, {
            sources: [
              src('Tsing Tao 50cl', 267, 267, 'Pc'),
              src('Fuze Tea', 99, 99, 'Pc'),
            ],
          }),
        ],
        s2: [
          line('Cup 50cl', 'Pc', 100, {
            // Même plat qu'au stand 1 → la source doit se CUMULER, pas se dupliquer.
            sources: [src('Tsing Tao 50cl', 60, 60, 'Pc'), src('Coca', 40, 40, 'Pc')],
          }),
        ],
      },
    }

    const rows = elementStockData.call(ctx)

    expect(rows).toHaveLength(1)
    expect(rows[0].totalQuantity).toBe(466)
    expect(rows[0].sources.map((s) => s.menuItemName)).toEqual([
      'Tsing Tao 50cl',
      'Fuze Tea',
      'Coca',
    ])
    const tsing = rows[0].sources.find((s) => s.menuItemName === 'Tsing Tao 50cl')
    expect(tsing.componentQuantity).toBe(327) // 267 + 60
    expect(tsing.menuItemQuantity).toBe(327)
  })

  it('ne mute pas les sources de `shopStockData` (copie défensive)', () => {
    const shared = src('Burger', 105, 105, 'Pc')
    const ctx = {
      fbElements: [
        { id: 's1', name: '1 A' },
        { id: 's2', name: '2 A' },
      ],
      shopStockData: {
        s1: [line('Bun', 'Pc', 105, { sources: [shared] })],
        s2: [line('Bun', 'Pc', 20, { sources: [src('Burger', 20, 20, 'Pc')] })],
      },
    }

    elementStockData.call(ctx)

    // Sans le `{ ...src }` du premier passage, l'agrégation incrémenterait
    // l'objet source d'origine → les quantités du mode « Par PDV » gonfleraient
    // à chaque recalcul du mode « Par article ».
    expect(shared.componentQuantity).toBe(105)
  })

  it('trie par nom et conserve unité, type et coût unitaire', () => {
    const ctx = {
      fbElements: [{ id: 's1', name: '6 A' }],
      shopStockData: {
        s1: [
          line('Viande Hachée', 'Kg', 12.6, { unitCost: 9.08, itemType: 'Ingredient' }),
          line('Bun - Burger', 'Pc', 105, { unitCost: 0.55, itemType: 'Ingredient' }),
          line('Sauce burger', 'kg', 2.1, { unitCost: 3.71, itemType: 'Component' }),
        ],
      },
    }

    const rows = elementStockData.call(ctx)

    expect(rows.map((r) => r.name)).toEqual(['Bun - Burger', 'Sauce burger', 'Viande Hachée'])
    const sauce = rows.find((r) => r.name === 'Sauce burger')
    expect(sauce.itemType).toBe('Component')
    expect(sauce.unitCost).toBe(3.71)
    expect(sauce.unit).toBe('kg')
  })

  it('renvoie [] quand aucun stand n\'a de stock', () => {
    const ctx = { fbElements: [{ id: 's1', name: '1 A' }], shopStockData: {} }
    expect(elementStockData.call(ctx)).toEqual([])
  })
})

describe('totalStockCost — même source que les lignes affichées', () => {
  it('somme coût unitaire × quantité sur les ÉLÉMENTS', () => {
    // Cas mesuré : Burger 25/26 (Aux), 105 u sur le 6 A → 206,03 €.
    const ctx = {
      elementStockData: [
        { unitCost: 1.2, totalQuantity: 4.2 }, // Salade    →   5,040
        { unitCost: 9.08, totalQuantity: 12.6 }, // Viande   → 114,408
        { unitCost: 0.55, totalQuantity: 105 }, // Bun       →  57,750
        { unitCost: 0.1746, totalQuantity: 105 }, // Cheddar →  18,333
        { unitCost: 0.0054, totalQuantity: 105 }, // Serviette→   0,567
        { unitCost: 3.71, totalQuantity: 2.1 }, // Sauce     →   7,791
        { unitCost: 2.04, totalQuantity: 1.05 }, // Pickles  →   2,142
      ],
    }

    expect(totalStockCost.call(ctx)).toBeCloseTo(206.031, 2)
  })

  it('ignore les lignes sans coût connu plutôt que de compter 0 × quantité comme un trou', () => {
    const ctx = {
      elementStockData: [
        { unitCost: 0, totalQuantity: 3 },
        { unitCost: 2, totalQuantity: 4 },
      ],
    }
    expect(totalStockCost.call(ctx)).toBe(8)
  })
})
