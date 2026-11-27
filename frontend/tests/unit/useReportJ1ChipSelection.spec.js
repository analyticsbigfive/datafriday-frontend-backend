import { createStore } from 'vuex'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { useReportJ1ChipSelection } from '@/composables/useReportJ1ChipSelection'

function setup() {
  const store = createStore({
    state: { analyse: { filters: { comparisonMode: false }, selectedToolbox: 'analyse' } },
    mutations: {
      setComparison(state, v) { state.analyse.filters.comparisonMode = v },
      setToolbox(state, v) { state.analyse.selectedToolbox = v },
    },
  })
  const placement = { request: jest.fn() }
  const notify = jest.fn()
  let api
  const Host = defineComponent({
    setup() {
      api = useReportJ1ChipSelection({ placement, notify })
      return () => h('div')
    },
  })
  const wrapper = mount(Host, { global: { plugins: [store] } })
  return { api, store, placement, notify, wrapper }
}

describe('useReportJ1ChipSelection', () => {
  it('start active le mode, vide la sélection et prévient', () => {
    const { api, notify } = setup()
    api.start('kpi-bar')
    expect(api.isActive('kpi-bar')).toBe(true)
    expect(api.isActive('widget-bar')).toBe(false)
    expect(api.picked.value).toEqual([])
    expect(api.canConfirm.value).toBe(false)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('toggle ajoute puis retire, ignore les clés étrangères et le mode inactif', () => {
    const { api } = setup()
    api.toggle('kpi-bar', 'revenue')
    expect(api.picked.value).toEqual([])
    api.start('kpi-bar')
    api.toggle('kpi-bar', 'revenue')
    api.toggle('kpi-bar', 'margin')
    expect(api.picked.value).toEqual(['revenue'])
    expect(api.isPicked('kpi-bar', 'revenue')).toBe(true)
    api.toggle('kpi-bar', 'revenue')
    expect(api.picked.value).toEqual([])
  })

  it('confirm ouvre le drawer avec les pastilles dans l ordre d origine puis quitte le mode', () => {
    const { api, placement } = setup()
    api.start('kpi-bar')
    api.confirm('Barre KPI')
    expect(placement.request).not.toHaveBeenCalled()
    api.toggle('kpi-bar', 'percap')
    api.toggle('kpi-bar', 'revenue')
    api.confirm('Barre KPI')
    expect(placement.request).toHaveBeenCalledWith({ kind: 'kpi-bar', label: 'Barre KPI', options: { items: 'revenue,percap' } })
    expect(api.activeKind.value).toBeNull()
  })

  it('cancel et Échap quittent le mode', () => {
    const { api } = setup()
    api.start('widget-bar')
    api.cancel()
    expect(api.activeKind.value).toBeNull()
    api.start('widget-bar')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(api.activeKind.value).toBeNull()
  })

  it('passer en Comparaison ou Predict quitte le mode', async () => {
    const { api, store } = setup()
    api.start('kpi-bar')
    store.commit('setComparison', true)
    await nextTick()
    expect(api.activeKind.value).toBeNull()
    store.commit('setComparison', false)
    api.start('kpi-bar')
    store.commit('setToolbox', 'predict')
    await nextTick()
    expect(api.activeKind.value).toBeNull()
  })
})
