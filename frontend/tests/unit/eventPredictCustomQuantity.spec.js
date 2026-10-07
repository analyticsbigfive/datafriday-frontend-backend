/**
 * Retour Bertrand 2026-10-07 : sur « Ventes prévues » (et Menu / vue article), une
 * quantité libre peut être saisie au-delà du maximum du curseur, et la quantité tapée
 * est exactement celle retenue.
 */
import { shallowMount } from '@vue/test-utils'
import EventPredictMenusSection from '@/components/space-workspace/event-predict/sections/EventPredictMenusSection.vue'

const SHOP = { id: 'shop-a', name: 'Buvette', type: 'shop', isOpen: true, menuItemsCount: 1 }
const menuItems = [{ id: 'mi-1664', name: '1664 25cl', basePrice: 4.58 }]

function mount(predicted, quantityAdjustments = {}) {
  return shallowMount(EventPredictMenusSection, {
    props: {
      menuItems,
      configShops: [SHOP],
      predictedTimelineData: [{ shopId: 'shop-a', shopName: 'Buvette', menuItemId: 'mi-1664', itemName: '1664 25cl', totalQuantity: predicted, totalRevenue: predicted * 4.58 }],
      selectedMenuItems: { 'shop-a': ['mi-1664'] },
      quantityAdjustments,
    },
    global: { stubs: { teleport: true }, config: { warnHandler: () => {} } },
  })
}

/** Saisit `units`, puis remonte le composant avec l'ajustement émis (comme le parent). */
function typeUnits(predicted, units) {
  const w = mount(predicted)
  w.vm.setItemUnits('shop-a', 'mi-1664', units)
  const adj = w.emitted('update:quantityAdjustments').pop()[0]
  return mount(predicted, adj).vm
}

describe('Event Predict : quantité libre sur un article prédit', () => {
  it('au-delà de prédit × 5 (31 → 400) : quantité retenue, curseur élargi', () => {
    const vm = typeUnits(31, 400)
    expect(vm.getAdjustedQuantity('shop-a', 'mi-1664')).toBe(400)
    expect(vm.unitSliderMax('shop-a', 'mi-1664')).toBeGreaterThanOrEqual(400)
  })

  it('quantité tapée exacte même quand un % entier ne tombe pas juste (300 → 301)', () => {
    expect(typeUnits(300, 301).getAdjustedQuantity('shop-a', 'mi-1664')).toBe(301)
  })

  it('0 accepté (article retiré du service)', () => {
    expect(typeUnits(31, 0).getAdjustedQuantity('shop-a', 'mi-1664')).toBe(0)
  })

  it('% du PDV tapé au-delà du curseur (700 %) : appliqué à ses articles cochés', () => {
    const w = mount(31)
    w.vm.commitIfChanged(700, 100, (n) => w.vm.handleShopAdjustment('shop-a', n))
    const adj = w.emitted('update:quantityAdjustments').pop()[0]
    expect(adj['shop-a-mi-1664']).toBe(700)
    expect(mount(31, adj).vm.getAdjustedQuantity('shop-a', 'mi-1664')).toBe(217)
  })

  it('sortir du champ sans changer la valeur : rien n\'est écrit', () => {
    const w = mount(31)
    const apply = jest.fn()
    w.vm.commitIfChanged(100, 100, apply)
    w.vm.commitIfChanged(null, 100, apply)
    expect(apply).not.toHaveBeenCalled()
  })
})
