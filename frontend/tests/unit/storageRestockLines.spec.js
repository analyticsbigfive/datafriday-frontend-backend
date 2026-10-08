// Réassort des espaces de stockage dans le réarmement (chantier logistic_ventilation,
// partie 4) : lignes d'étape 2, coefficients `refill`, rejeu des corrections et
// regroupement dans la feuille de ventilation.

import { buildStorageRestockLines, storageRefillCoeffs, isStorageRestockLine } from '@/utils/storageRestockLines'
import { recomputeShoppingFromOverrides } from '@/utils/restockPlanSnapshot'
import { groupDepositLinesByItem } from '@/utils/restockDepositSheet'

const groups = [
  {
    elementId: 'st-1',
    elementName: 'Réserve Oceanne',
    rows: [
      { key: 'storage:st-1:coca', name: 'Coca', unit: 'Pc', menuItemId: null, remaining: 10, required: 50 },
      { key: 'storage:st-1:eau', name: 'Eau', unit: 'L', menuItemId: null, remaining: 5, required: 0 },
    ],
  },
]

describe('buildStorageRestockLines', () => {
  it('crée une ligne stockage par article à réassortir, arrondie au colis', () => {
    const packagingFor = () => ({ packedCount: 3, packagingUnitNumber: 24, purchaseUnitConversion: 1 })
    const [line, ...rest] = buildStorageRestockLines(groups, { packagingFor })
    expect(rest).toEqual([])
    expect(line).toMatchObject({
      rowKey: 'storage|||st-1|||storage:st-1:coca',
      elementType: 'storage',
      shopId: 'st-1',
      shopName: 'Réserve Oceanne',
      itemKey: 'storage:st-1:coca',
      itemName: 'Coca',
      remainingQuantity: 10,
      targetQuantity: 60,
      restockQuantity: 72,
    })
    expect(isStorageRestockLine(line)).toBe(true)
  })

  it('porte les matchs de la feuille (visible quel que soit le match filtré)', () => {
    const [line] = buildStorageRestockLines(groups, { eventIds: ['ev-1', 'ev-2'], eventNames: ['A', 'B'] })
    expect(line.eventIds).toEqual(['ev-1', 'ev-2'])
    expect(line.eventNames).toEqual(['A', 'B'])
  })

  it('arrondit au supérieur sans conditionnement exploitable', () => {
    const lines = buildStorageRestockLines(
      [{ elementId: 'st-1', elementName: 'R', rows: [{ key: 'k', name: 'Vin', unit: 'L', remaining: 0, required: 2.34 }] }],
      { packagingFor: () => ({ packedCount: 1 }) },
    )
    expect(lines[0].restockQuantity).toBe(2.4)
  })
})

describe('storageRefillCoeffs', () => {
  it("pointe vers l'article de feuille de course qui porte le réassort", () => {
    const rows = [
      { itemKey: 'pdv-item', rowKey: 'a' },
      { itemKey: 'storage:st-1:coca', rowKey: 'b', elementType: 'storage' },
    ]
    expect(storageRefillCoeffs(rows, { 'storage:st-1:coca': 'coca|||Pc' })).toEqual({
      'storage:st-1:coca': [{ itemKey: 'coca|||Pc', perUnit: 1, refill: true }],
    })
  })
})

describe('recomputeShoppingFromOverrides avec réassort de stockage', () => {
  const snapshot = {
    restockLines: [
      { rowKey: 'shop|||coca', itemKey: 'coca|||Pc', restockQuantity: 40 },
      { rowKey: 'storage|||st-1|||k', itemKey: 'k', elementType: 'storage', restockQuantity: 48 },
    ],
    recipeCoeffs: {
      'coca|||Pc': [{ itemKey: 'coca|||Pc', perUnit: 1 }],
      k: [{ itemKey: 'coca|||Pc', perUnit: 1, refill: true }],
    },
    shoppingGroups: [
      {
        supplierId: 'sup',
        items: [
          // besoin PDV 40, stock réserve 10 → achat 30, + réassort 48 → 78
          { itemKey: 'coca|||Pc', restockNeed: 40, storageOnHand: 10, storageRefill: 48, buyQuantity: 78, quantity: 78, packaging: null },
        ],
      },
    ],
  }

  it('une correction de la ligne stockage modifie le réassort, pas le besoin PDV', () => {
    const [group] = recomputeShoppingFromOverrides(snapshot, { 'storage|||st-1|||k': 24 })
    expect(group.items[0]).toMatchObject({ restockNeed: 40, storageRefill: 24, buyQuantity: 54 })
  })

  it('une correction PDV garde le réassort', () => {
    const [group] = recomputeShoppingFromOverrides(snapshot, { 'shop|||coca': 20 })
    expect(group.items[0]).toMatchObject({ restockNeed: 20, storageRefill: 48, buyQuantity: 58 })
  })

  it('article acheté uniquement pour le stockage', () => {
    const only = {
      ...snapshot,
      shoppingGroups: [
        { supplierId: 'sup', items: [{ itemKey: 'coca|||Pc', restockNeed: 48, storageOnHand: 0, storageRefill: 48, fromStorageOnly: true, buyQuantity: 48, quantity: 48, packaging: null }] },
      ],
    }
    const [group] = recomputeShoppingFromOverrides(only, { 'storage|||st-1|||k': 72 })
    expect(group.items[0]).toMatchObject({ restockNeed: 72, storageRefill: 72, buyQuantity: 72 })
  })
})

describe('groupDepositLinesByItem avec stockages', () => {
  it("range un stockage sous l'article PDV du même nom", () => {
    const groupsOut = groupDepositLinesByItem([
      { rowKey: 's', elementType: 'storage', shopId: 'st-1', shopName: 'Réserve', itemKey: 'storage:st-1:coca', itemName: 'Coca ', restockQuantity: 48, packaging: null },
      { rowKey: 'p', shopId: 'shop-1', shopName: 'Océane 11', itemKey: 'coca|||Pc', itemName: 'Coca', restockQuantity: 24, packaging: null },
    ])
    expect(groupsOut).toHaveLength(1)
    expect(groupsOut[0].rows.map((r) => [r.shopName, r.elementType])).toEqual([['Océane 11', null], ['Réserve', 'storage']])
    expect(groupsOut[0].totalQuantity).toBe(72)
  })

  it('regroupe un même article de plusieurs stockages sans ligne PDV', () => {
    const groupsOut = groupDepositLinesByItem([
      { rowKey: 'a', elementType: 'storage', shopId: 'st-1', shopName: 'A', itemKey: 'storage:st-1:eau', itemName: 'Eau', restockQuantity: 5 },
      { rowKey: 'b', elementType: 'storage', shopId: 'st-2', shopName: 'B', itemKey: 'storage:st-2:eau', itemName: 'eau', restockQuantity: 7 },
    ])
    expect(groupsOut).toHaveLength(1)
    expect(groupsOut[0].totalQuantity).toBe(12)
  })
})
