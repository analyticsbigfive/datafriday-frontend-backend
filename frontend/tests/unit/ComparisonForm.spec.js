/**
 * ComparisonForm : rendu et interactions de base (fumée), sans Vuetify (v-icon neutralisé).
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: { state: { seasons: { seasons: [] } }, getters: {}, commit: jest.fn(), dispatch: jest.fn() },
}))
jest.mock('@/api/endpoints/eventPredict.api', () => ({ listEventPredictVersions: jest.fn(), getEventIdsWithPredictVersions: jest.fn() }))

import { defineComponent, h, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import store from '@/store'
import { getEventIdsWithPredictVersions } from '@/api/endpoints/eventPredict.api'
import { useComparisonForm } from '@/composables/useComparisonForm'
import ComparisonForm from '@/components/space-workspace/analyse/comparison/ComparisonForm.vue'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
async function settle() {
  for (let i = 0; i < 6; i++) { await tick(); await nextTick() }
}

const EVENTS = [
  { id: 'e1', name: 'Match 1', date: '2026-01-10', eventType: 'Sport', category: 'Basket', doorsOpening: '18:00', showTime: '20:00' },
  { id: 'e2', name: 'Match 2', date: '2026-01-20', eventType: 'Sport', category: 'Rugby', doorsOpening: '17:00', showTime: '19:00' },
]
const MAIN = { timeRange: 'last12months', startDate: null, endDate: null, temperatureRange: [-10, 45], selectedEventTypes: [], selectedEventCategories: [], selectedSubcategories: [] }

let formRef
function mountForm({ events = EVENTS, hasReport = false } = {}) {
  store.getters = {
    'analyse/analysableEvents': EVENTS,
    'analyse/filteredEvents': events,
    'analyse/uniqueDoorsOpenings': ['17:00', '18:00'],
    'analyse/uniqueShowTimes': ['19:00', '20:00'],
  }
  const onRun = jest.fn()
  const Harness = defineComponent({
    setup() {
      const form = useComparisonForm({ mainFilters: ref(MAIN), mainEvents: ref(events), translate: (k) => k, locale: 'fr', enabled: ref(true) })
      formRef = form
      return () => h(ComparisonForm, { form, hasReport, onRun })
    },
  })
  const w = mount(Harness, { global: { stubs: { 'v-icon': true } } })
  return { w, onRun }
}

beforeEach(() => {
  jest.clearAllMocks()
  getEventIdsWithPredictVersions.mockResolvedValue([])
})

describe('ComparisonForm', () => {
  it('affiche type, période, compteurs et pied ; « Retour au rapport » absent sans rapport', async () => {
    const { w } = mountForm()
    await settle()
    expect(w.find('select').exists()).toBe(true)
    // Période par défaut = période précédente (12 mois d'avant) : aucun des 2 events n'y est.
    expect(w.findAll('.cf-pv__n').map((n) => n.text())).toEqual(['2', '0'])
    formRef.patch({ period: 'custom', from: '2026-01-01', to: '2026-01-31' })
    await nextTick()
    expect(w.findAll('.cf-pv__n').map((n) => n.text())).toEqual(['2', '2'])
    expect(w.findAll('.cf-btn--ghost')).toHaveLength(1)
    // Predict désactivé : aucun scénario.
    const predict = w.findAll('option').find((o) => o.attributes('value') === 'predict')
    expect(predict.attributes('disabled')).toBeDefined()
  })

  it('« Retour au rapport » visible quand un rapport existe', async () => {
    const { w } = mountForm({ hasReport: true })
    await settle()
    expect(w.findAll('.cf-btn--ghost')).toHaveLength(2)
  })

  it('Comparer émet run avec le modèle (copie) ; désactivé sans event', async () => {
    const { w, onRun } = mountForm()
    await settle()
    formRef.patch({ kind: 'event', eventIds: [] })
    await nextTick()
    expect(w.find('.cf-btn--primary').attributes('disabled')).toBeDefined()
    formRef.patch({ eventIds: ['e1'] })
    await nextTick()
    await w.find('.cf-btn--primary').trigger('click')
    expect(onRun).toHaveBeenCalledTimes(1)
    const model = onRun.mock.calls[0][0]
    expect(model.kind).toBe('event')
    expect(model.eventIds).toEqual(['e1'])
    expect(model).not.toBe(formRef.model)
  })

  it('puces : aria-pressed suit la sélection et alimente le modèle', async () => {
    const { w } = mountForm()
    await settle()
    // Première puce du bloc avancé = Lundi.
    const chip = w.find('.cf-adv .cf-chip')
    expect(chip.attributes('aria-pressed')).toBe('false')
    await chip.trigger('click')
    expect(formRef.model.selectedDaysOfWeek).toEqual(['mon'])
    expect(w.find('.cf-adv .cf-chip').attributes('aria-pressed')).toBe('true')
    expect(w.find('.cf-opt__cnt').text()).toBe('1')
  })

  it('Predict : encart affiché, filtres avancés désactivés', async () => {
    getEventIdsWithPredictVersions.mockResolvedValue(['e1'])
    const { w } = mountForm()
    await settle()
    formRef.setKind('predict')
    await nextTick()
    expect(w.find('.cf-notice').exists()).toBe(true)
    expect(w.find('fieldset.cf-opt__inner').attributes('disabled')).toBeDefined()
    expect(w.find('.cf-evlist').exists()).toBe(false)
  })

  it('liste d\'événements : recherche locale et « Tout effacer »', async () => {
    const { w } = mountForm()
    await settle()
    formRef.patch({ kind: 'event', eventIds: ['e1', 'e2'] })
    await nextTick()
    expect(w.findAll('.cf-evlist__row')).toHaveLength(2)
    await w.find('.cf-evlist__q').setValue('match 2')
    expect(w.findAll('.cf-evlist__row')).toHaveLength(1)
    await w.find('.cf-evlist__clear').trigger('click')
    expect(formRef.model.eventIds).toEqual([])
  })
})
