/**
 * Panneau de filtres, bandeau, pastilles et carte du graphique de la page Cost tracking.
 * Le test vérifie aussi que la vue et la colonne gauche se compilent (import).
 */
import { mount } from '@vue/test-utils'
import CostTrackingBanner from '@/components/space-workspace/cost-tracking/CostTrackingBanner.vue'
import CostTrackingChartCard from '@/components/space-workspace/cost-tracking/CostTrackingChartCard.vue'
import CostTrackingFilterChips from '@/components/space-workspace/cost-tracking/CostTrackingFilterChips.vue'
import CostTrackingFilterPanel from '@/components/space-workspace/cost-tracking/CostTrackingFilterPanel.vue'

jest.mock('@/components/WorkspaceAppHeader.vue', () => ({ __esModule: true, default: { template: '<div />' } }))
jest.mock('@/components/WorkspaceToolSelect.vue', () => ({ __esModule: true, default: { template: '<div />' } }))
jest.mock('@/composables/useWorkspaceToolbox', () => ({ useWorkspaceToolbox: () => ({ toolboxItems: [], onToolboxSelect: () => {} }) }))
jest.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (k) => k, locale: { value: 'fr' } }) }))

describe('compilation', () => {
  it('la vue et la colonne gauche s importent', async () => {
    const view = await import('@/components/space-workspace/cost-tracking/views/SpaceCostTrackingView.vue')
    const left = await import('@/components/space-workspace/cost-tracking/CostTrackingLeftColumn.vue')
    expect(view.default).toBeTruthy()
    expect(left.default).toBeTruthy()
  })
})

describe('CostTrackingFilterPanel', () => {
  const base = {
    typeOptions: [{ id: 't1', name: 'Food' }],
    categoryOptions: [{ id: 'c1', name: 'Main', typeId: 't1', typeName: 'Food' }],
    articleOptions: [{ id: 'a1', name: 'Burger', typeId: 't1', categoryId: 'c1' }],
  }
  it('émet les choix de type, catégorie, article et la réinitialisation', async () => {
    const w = mount(CostTrackingFilterPanel, { props: base })
    await w.find('#ct-type').setValue('t1')
    await w.find('#ct-category').setValue('c1')
    await w.find('#ct-article').setValue('a1')
    await w.find('.ct-link').trigger('click')
    expect(w.emitted('set-type')[0]).toEqual(['t1'])
    expect(w.emitted('set-category')[0]).toEqual(['c1'])
    expect(w.emitted('set-article')[0]).toEqual(['a1'])
    expect(w.emitted('reset')).toHaveLength(1)
  })
  it('revenir à « tous » émet null', async () => {
    const w = mount(CostTrackingFilterPanel, { props: { ...base, typeId: 't1' } })
    await w.find('#ct-type').setValue('')
    expect(w.emitted('set-type')[0]).toEqual([null])
  })
  it('la courbe de marge est désactivée au-delà de 3 lignes', () => {
    const w = mount(CostTrackingFilterPanel, { props: { ...base, canMargin: false } })
    const sw = w.findAll('[role="switch"]')[0]
    expect(sw.attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('ctMarginHintOff')
  })
  it('période personnalisée : dates puis plage émise', async () => {
    const w = mount(CostTrackingFilterPanel, { props: { ...base, period: 'custom' } })
    await w.find('#ct-from').setValue('2026-03-01')
    expect(w.emitted('set-custom-range')).toBeUndefined()
    await w.find('#ct-to').setValue('2026-04-01')
    expect(w.emitted('set-custom-range')[0]).toEqual(['2026-03-01', '2026-04-01'])
  })
  it('le filtre ingrédient dépend de l article : désactivé sans article, émet son choix avec', async () => {
    const without = mount(CostTrackingFilterPanel, { props: { ...base } })
    expect(without.find('#ct-ingredient').attributes('disabled')).toBeDefined()
    const w = mount(CostTrackingFilterPanel, {
      props: { ...base, menuItemId: 'a', ingredientOptions: [{ id: 'i1', name: 'Pain' }] },
    })
    await w.find('#ct-ingredient').setValue('i1')
    expect(w.emitted('set-ingredient')[0]).toEqual(['i1'])
  })
  it('il n y a plus de bascule des matchs : les événements sont toujours affichés', () => {
    const w = mount(CostTrackingFilterPanel, { props: { ...base } })
    expect(w.text()).not.toContain('ctShowEvents')
  })
})

describe('CostTrackingFilterChips et bandeau', () => {
  it('retirer une pastille émet sa clé', async () => {
    const w = mount(CostTrackingFilterChips, { props: { periodLabel: '6 mois', chips: [{ key: 'type', label: 'Type : Food' }], countLabel: '3 catégories' } })
    await w.find('button').trigger('click')
    expect(w.emitted('remove')[0]).toEqual(['type'])
  })
  it('le bandeau affiche titre et sous-titre et replie la colonne', async () => {
    const w = mount(CostTrackingBanner, { props: { title: 'FC : Cost tracking', subtitle: '3 courbes' } })
    expect(w.find('h1').text()).toBe('FC : Cost tracking')
    await w.find('button').trigger('click')
    expect(w.emitted('toggle-left')).toHaveLength(1)
  })
})

describe('CostTrackingChartCard', () => {
  const props = { chartModel: () => ({}), bounds: [Date.parse('2026-03-01'), Date.parse('2026-06-30')] }
  it('état vide : message à la place du graphique', () => {
    const w = mount(CostTrackingChartCard, { props: { ...props, state: 'notStarted' } })
    expect(w.find('.ct-state').exists()).toBe(true)
    expect(w.find('svg').exists()).toBe(false)
  })
  it('bascule Afficher par émise', async () => {
    const w = mount(CostTrackingChartCard, { props: { ...props, state: 'loading' } })
    await w.findAll('.ct-seg button')[1].trigger('click')
    expect(w.emitted('set-group-by')[0]).toEqual(['category'])
  })
})
