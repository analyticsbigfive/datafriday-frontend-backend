/**
 * BUG-288-01 — un composant partagé par plusieurs menu items doit produire UNE
 * ligne de réarmement par (PDV, article physique), pas une par ligne de recette.
 *
 * Le backend aplatit MenuItemPackaging/Component/Ingredient en `components[]` où
 * `id` = PK de la ligne de jointure (@@unique[menuItemId, refId] → distincte par
 * recette) et `sourceId` = id catalogue PARTAGÉ. L'identité de stock doit donc se
 * fonder sur `componentIngredientId` (marketPriceId → sourceId → id), pas sur `id`.
 */
import {
  expandMenuItemStock,
  buildStockRequirements,
  computePackagingForQuantity,
} from '@/utils/stockPlanning'

// Deux plats du même PDV partageant le gobelet « Cup 50CL » (sourceId cup-50).
// Les lignes de recette portent des `id` DIFFÉRENTS — c'est le piège du bug.
const menuItems = [
  {
    id: 'mi-tsing',
    name: 'Tsing Tao 50cl 25/26',
    readyForSale: 'No',
    numberOfPiecesRecipe: 1,
    components: [
      {
        id: 'line-tsing-cup',
        sourceId: 'cup-50',
        name: 'Cup 50CL',
        unit: 'unit',
        numberOfUnits: 1,
        itemType: 'Packaging',
      },
    ],
  },
  {
    id: 'mi-fuze',
    name: 'Fuze Tea PET 40cl 25/26 (PFC)',
    readyForSale: 'No',
    numberOfPiecesRecipe: 1,
    components: [
      {
        id: 'line-fuze-cup',
        sourceId: 'cup-50',
        name: 'Cup 50CL',
        unit: 'unit',
        numberOfUnits: 1,
        itemType: 'Packaging',
      },
    ],
  },
]

const configuration = {
  data: {
    floors: [
      { elements: [{ id: 'shop-1', name: 'Bar Nord', type: 'shop' }] },
    ],
  },
}

const predictedRecords = [
  { shopId: 'shop-1', menuItemId: 'mi-tsing', quantity: 305 },
  { shopId: 'shop-1', menuItemId: 'mi-fuze', quantity: 60 },
]

describe('expandMenuItemStock — identité d\'un composant simple', () => {
  it("clé sur l'id catalogue (sourceId), pas sur la PK de ligne de recette", () => {
    const [line] = expandMenuItemStock('mi-tsing', 305, 'Tsing Tao 50cl 25/26', menuItems)
    expect(line.id).toBe('cup-50')
    expect(line.sourceId).toBe('cup-50')
    expect(line.totalQuantity).toBe(305)
  })

  it('privilégie marketPriceId quand il est présent (matière achetée)', () => {
    const withMarketPrice = [
      {
        ...menuItems[0],
        components: [{ ...menuItems[0].components[0], marketPriceId: 'mp-cup' }],
      },
    ]
    const [line] = expandMenuItemStock('mi-tsing', 10, 'Tsing Tao 50cl 25/26', withMarketPrice)
    expect(line.id).toBe('mp-cup')
  })
})

describe('buildStockRequirements — fusion d\'un composant partagé', () => {
  const rows = buildStockRequirements({
    configuration,
    predictedRecords,
    menuItems,
    selectedMenuItems: { 'shop-1': ['mi-tsing', 'mi-fuze'] },
  })
  const cupRows = rows.filter((r) => r.itemName === 'Cup 50CL')

  it('produit UNE seule ligne pour le même article dans le même PDV', () => {
    expect(cupRows).toHaveLength(1)
  })

  it('cumule les quantités des deux recettes', () => {
    expect(cupRows[0].totalQuantity).toBe(365)
  })

  it('conserve le détail par menu item dans sources[]', () => {
    const sources = cupRows[0].sources
    expect(sources).toHaveLength(2)
    const byName = Object.fromEntries(
      sources.map((s) => [s.menuItemName, s.componentQuantity]),
    )
    expect(byName['Tsing Tao 50cl 25/26']).toBe(305)
    expect(byName['Fuze Tea PET 40cl 25/26 (PFC)']).toBe(60)
    // La somme du détail reconstitue le total affiché.
    expect(sources.reduce((sum, s) => sum + s.componentQuantity, 0)).toBe(
      cupRows[0].totalQuantity,
    )
  })

  it("n'arrondit le packaging qu'UNE fois (sur-commande évitée)", () => {
    // packSize 100 : ceil(3.65) = 4 cartons. Fragmenté, on aurait
    // ceil(3.05) + ceil(0.6) = 4 + 1 = 5.
    const catalogue = [
      {
        id: 'cup-50',
        name: 'Cup 50CL',
        unit: 'unit',
        packagingType: 'Carton',
        packagingUnitNumber: 100,
      },
    ]
    const packaging = computePackagingForQuantity(
      cupRows[0],
      cupRows[0].totalQuantity,
      catalogue,
    )
    expect(packaging.packedCount).toBe(4)
  })
})
