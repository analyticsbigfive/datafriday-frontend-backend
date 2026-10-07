/**
 * Retour Bertrand 2026-10-07 : un article « Sans ventes prévues » auquel on donne une
 * quantité manuelle doit monter le CA ajusté de SON PDV (le CA global le comptait déjà),
 * et apparaître dans l'onglet « Menu » (articles cochés à quantité ajustée > 0).
 */
import { shallowMount } from '@vue/test-utils'
import EventPredictMenusSection from '@/components/space-workspace/event-predict/sections/EventPredictMenusSection.vue'

const SHOP = { id: 'shop-perrier', name: 'Buvette 2 Perrier', type: 'shop', isOpen: true, menuItemsCount: 3 }
const menuItems = [
  { id: 'mi-biere', name: 'Bière 25/27 (Aix)', basePrice: 6, totalCost: 1.5 },
  { id: 'mi-hotdog', name: 'Hot Dog Veggie 25/27 (Aix)', basePrice: 6.36, totalCost: 1.17 },
  { id: 'mi-mojito', name: 'Mojito 25/27 (Aix)', basePrice: 7.08, totalCost: 2.12 },
]
// Seule la bière est prédite (100 u, 600 €).
const timeline = [
  { shopId: 'shop-perrier', shopName: 'Buvette 2 Perrier', menuItemId: 'mi-biere', itemName: 'Bière 25/27 (Aix)', totalQuantity: 100, totalRevenue: 600 },
]

function mount(manualQuantities, selected = ['mi-biere', 'mi-hotdog', 'mi-mojito'], extraTimeline = []) {
  return shallowMount(EventPredictMenusSection, {
    props: {
      menuItems,
      configShops: [SHOP],
      predictedTimelineData: [...timeline, ...extraTimeline],
      selectedMenuItems: { 'shop-perrier': selected },
      manualQuantities,
      shopMenuAssignmentItems: {
        'buvette 2 perrier': [
          { id: 'mi-biere', name: 'Bière 25/27 (Aix)', basePrice: 6 },
          { id: 'mi-hotdog', name: 'Hot Dog Veggie 25/27 (Aix)', basePrice: 6.36 },
          { id: 'mi-mojito', name: 'Mojito 25/27 (Aix)', basePrice: 7.08 },
        ],
      },
      shopMenuAssignment: { 'buvette 2 perrier': new Set(['mi-biere', 'mi-hotdog', 'mi-mojito']) },
    },
    global: { stubs: { teleport: true }, config: { warnHandler: () => {} } },
  })
}

describe('Event Predict : quantité manuelle et CA ajusté du PDV', () => {
  it('sans quantité manuelle : CA ajusté du PDV = articles prédits', () => {
    expect(mount({}).vm.getAdjustedRevenue('shop-perrier')).toBeCloseTo(600)
  })

  it('10 Hot Dog Veggie saisis à la main : le CA ajusté du PDV monte de 10 × 6,36 €', () => {
    const vm = mount({ 'shop-perrier-mi-hotdog': 10 }).vm
    expect(vm.getAdjustedRevenue('shop-perrier')).toBeCloseTo(663.6)
    // Le CA brut (prédit) ne bouge pas.
    expect(vm.getPredictedRevenue('shop-perrier')).toBeCloseTo(600)
  })

  it('article décoché : sa quantité manuelle ne compte pas dans le CA ajusté', () => {
    const vm = mount({ 'shop-perrier-mi-hotdog': 10 }, ['mi-biere', 'mi-mojito']).vm
    expect(vm.getAdjustedRevenue('shop-perrier')).toBeCloseTo(600)
  })

  it('onglet « Menu » : articles cochés à quantité ajustée > 0, tous onglets confondus', () => {
    const vm = mount({ 'shop-perrier-mi-hotdog': 10 }).vm
    const el = vm.fbElements[0]
    vm.setShopTab(el.id, 'menu')
    expect(vm.getActiveBucketItems(el).map((it) => it.id)).toEqual(['mi-biere', 'mi-hotdog'])
    expect(vm.getShopTabCounts(el)).toMatchObject({ menu: 2, sales: 1, noSales: 2 })
  })

  it("article présent dans la timeline à moins d'une unité (cas Redbull 25cl, PAUC/SARAN) : la quantité manuelle compte", () => {
    // Vendu dans les matchs passés, 0,3 unité prévue après pondération : onglet
    // « Sans ventes prévues », mais présent dans la timeline (ancien bug : prix 0 €).
    const lowRow = { shopId: 'shop-perrier', shopName: 'Buvette 2 Perrier', menuItemId: 'mi-hotdog', itemName: 'Hot Dog Veggie 25/27 (Aix)', totalQuantity: 0.3, totalRevenue: 1.91 }
    const vm = mount({ 'shop-perrier-mi-hotdog': 10 }, undefined, [lowRow]).vm
    expect(vm.getGroupedMenuItems(vm.fbElements[0]).find((i) => i.id === 'mi-hotdog')._bucket).toBe('noSales')
    expect(vm.getAdjustedRevenue('shop-perrier')).toBeCloseTo(663.6, 0)
  })

  it('article présent dans la timeline à 0 unité et 0 € : prix catalogue en repli', () => {
    const zeroRow = { shopId: 'shop-perrier', shopName: 'Buvette 2 Perrier', menuItemId: 'mi-hotdog', itemName: 'Hot Dog Veggie 25/27 (Aix)', totalQuantity: 0, totalRevenue: 0 }
    const vm = mount({ 'shop-perrier-mi-hotdog': 10 }, undefined, [zeroRow]).vm
    expect(vm.getAdjustedRevenue('shop-perrier')).toBeCloseTo(663.6)
  })
})
