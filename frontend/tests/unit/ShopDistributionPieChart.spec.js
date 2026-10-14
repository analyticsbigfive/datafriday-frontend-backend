/**
 * ShopDistributionPieChart : mode lecture seule (drawer Comparaison). Aucun clic ne filtre,
 * la sélection du store n'est pas lue, les pastilles d'écart s'affichent dans les légendes.
 */
jest.mock('vuetify', () => ({
  useTheme: () => ({ global: { current: { value: { dark: false } } }, current: { value: { dark: false } } }),
  useDisplay: () => ({ mobile: { value: false }, smAndDown: { value: false }, width: { value: 1400 } }),
}))
jest.mock('vue-chartjs', () => ({
  Doughnut: { name: 'Doughnut', props: ['data', 'options'], template: '<canvas class="stub-doughnut" />' },
}))

import { createStore } from 'vuex'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { globalMountOptions } from './helpers/comparisonFixtures'
import ShopDistributionPieChart from '@/components/space-workspace/analyse/charts/ShopDistributionPieChart.vue'

const RECORDS = [
  { shopName: 'Buvette', shopType: 'food', shopArea: 'Nord', revenue: 100, quantity: 10 },
  { shopName: 'Grill', shopType: 'beverages', shopArea: 'Sud', revenue: 200, quantity: 4 },
]
const pill = (text) => ({ kind: 'delta', delta: 5, unit: '%', invert: false, tone: 'good', text, isNew: false })
const DELTAS = {
  sections: { shopChartRevenue: pill('▲ 9,9 %') },
  shopDistribution: {
    revenue: { shop: new Map([['Buvette', pill('▲ 7,5 %')], ['Grill', { kind: 'new', delta: null, unit: '%', invert: false, tone: 'neutral', text: '—', isNew: true }]]), type: new Map(), area: new Map([['Nord', pill('▼ 3,0 %')]]) },
    quantity: { shop: new Map(), type: new Map(), area: new Map() },
  },
}

const appendItem = {
  inheritAttrs: true,
  emits: ['click'],
  render() {
    return h('div', { role: 'menuitem', onClick: () => this.$emit('click') }, [this.$slots.default?.(), this.$slots.append?.()])
  },
}

function mountChart(props, selected = {}) {
  const store = createStore({
    state: () => ({ analyse: { filters: { selectedShopIds: selected.ids || [], selectedShopTypes: [], selectedShopAreas: [] }, configContextLoading: false, configContextSettled: true, configContextError: null } }),
  })
  const g = globalMountOptions({ stubs: { 'v-list-item': appendItem } })
  g.plugins = [store]
  return mount(ShopDistributionPieChart, { props: { records: RECORDS, ...props }, global: g })
}

describe('ShopDistributionPieChart', () => {
  it('lecture seule : badge, pastilles dans les légendes, « nouveau » pour une valeur absente', () => {
    const w = mountChart({ readonly: true, deltas: DELTAS })
    expect(w.find('.sdp-lock').exists()).toBe(true)
    const texts = w.findAll('.delta-pill').map((p) => p.text())
    expect(texts.some((x) => x.includes('7,5'))).toBe(true)
    expect(texts.some((x) => x.includes('3,0'))).toBe(true)
    expect(texts.some((x) => x.includes('9,9'))).toBe(true)
  })

  it('lecture seule : un clic sur une légende n\'émet aucun événement de filtre', async () => {
    const w = mountChart({ readonly: true, deltas: DELTAS })
    for (const item of w.findAll('[role="menuitem"]')) await item.trigger('click')
    expect(w.emitted('shop-click')).toBeUndefined()
    expect(w.emitted('shop-type-click')).toBeUndefined()
    expect(w.emitted('shop-area-click')).toBeUndefined()
  })

  it('lecture seule : la sélection du store n\'est pas reflétée', () => {
    const w = mountChart({ readonly: true }, { ids: ['Buvette'] })
    expect(w.find('.legend-item--selected').exists()).toBe(false)
  })

  it('sans les props : comportement du principal (pas de badge, pas de pastille, clic émis, sélection lue)', async () => {
    const w = mountChart({}, { ids: ['Buvette'] })
    expect(w.find('.sdp-lock').exists()).toBe(false)
    expect(w.find('.delta-pill').exists()).toBe(false)
    await w.findAll('[role="menuitem"]')[0].trigger('click')
    expect(w.emitted('shop-click')).toHaveLength(1)
    expect(w.emitted('shop-click')[0]).toEqual(['Grill'])
  })
})
