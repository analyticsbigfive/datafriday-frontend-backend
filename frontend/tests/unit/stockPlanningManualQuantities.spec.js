/**
 * Module Live ← Event Predict (docs/modules/11_LIVE.md) : `buildStockRequirements`
 * a été étendue avec `manualQuantities` pour couvrir les items à prédiction 0 mais
 * quantité forcée à la main — même sémantique que
 * `EventPredictStockUpSection.getAdjustedQuantity()` (la quantité manuelle sert de
 * BASE, mise à l'échelle par le même slider % que la prédiction, pas un simple
 * override du résultat final).
 */
import { buildStockRequirements } from '@/utils/stockPlanning'

const menuItems = [
  { id: 'mi-cookie', name: 'Cookie', readyForSale: 'Yes' },
]

const configuration = {
  data: {
    floors: [{ elements: [{ id: 'shop-1', name: 'Bar Nord', type: 'shop' }] }],
  },
}

const selectedMenuItems = { 'shop-1': ['mi-cookie'] }

describe('buildStockRequirements — manualQuantities (items à prédiction 0)', () => {
  it('ignore un item sans prédiction et sans manualQuantities (comportement inchangé)', () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords: [{ shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 0 }],
      selectedMenuItems,
    })
    expect(rows).toHaveLength(0)
  })

  it('utilise la quantité manuelle comme base quand la prédiction est 0', () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords: [{ shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 0 }],
      selectedMenuItems,
      manualQuantities: { 'shop-1-mi-cookie': 40 },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].itemName).toBe('Cookie')
    expect(rows[0].totalQuantity).toBe(40)
  })

  it('met la quantité manuelle à l\'échelle du même slider % que la prédiction', () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords: [{ shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 0 }],
      selectedMenuItems,
      manualQuantities: { 'shop-1-mi-cookie': 40 },
      quantityAdjustments: { 'shop-1-mi-cookie': 150 },
    })
    expect(rows[0].totalQuantity).toBe(60) // 40 * 150 / 100
  })

  it('ignore manualQuantities quand une prédiction > 0 existe déjà (pas un override)', () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords: [{ shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 10 }],
      selectedMenuItems,
      manualQuantities: { 'shop-1-mi-cookie': 999 },
    })
    expect(rows[0].totalQuantity).toBe(10)
  })
})
