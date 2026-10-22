/**
 * Blocs de la page Cost tracking : états vides, bascule « Afficher par », tableau, tiroir d'historique.
 */
import { mount } from '@vue/test-utils'
import CostTrackingGroupSwitch from '@/components/space-workspace/cost-tracking/CostTrackingGroupSwitch.vue'
import CostTrackingHistoryDrawer from '@/components/space-workspace/cost-tracking/CostTrackingHistoryDrawer.vue'
import CostTrackingStateMessage from '@/components/space-workspace/cost-tracking/CostTrackingStateMessage.vue'
import CostTrackingSummaryPanel from '@/components/space-workspace/cost-tracking/CostTrackingSummaryPanel.vue'
import CostTrackingTable from '@/components/space-workspace/cost-tracking/CostTrackingTable.vue'

jest.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (k) => k, locale: { value: 'fr' } }) }))

const row = (over = {}) => ({
  key: 'article:a', id: 'a', kind: 'article', name: 'Burger', typeName: 'Food', categoryName: 'Main', articleCount: 1,
  startCost: 2, currentCost: 2.5, currentPrice: 10, variation: { abs: 0.5, pct: 25, direction: 'up' },
  marginStart: 80, marginEnd: 75, marginDelta: -5, versions: 1, ...over,
})

describe('CostTrackingStateMessage', () => {
  it.each([
    ['loading', 'ctLoading'],
    ['noScope', 'ctNoScopeTitle'],
    ['notStarted', 'ctNotStartedTitle'],
    ['empty', 'ctEmptyTitle'],
  ])('état %s', (kind, title) => {
    const w = mount(CostTrackingStateMessage, { props: { kind } })
    expect(w.text()).toContain(title)
    expect(w.find('.ct-state__retry').exists()).toBe(false)
  })
  it('erreur : bouton réessayer', async () => {
    const w = mount(CostTrackingStateMessage, { props: { kind: 'error' } })
    await w.find('.ct-state__retry').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })
})

describe('CostTrackingGroupSwitch', () => {
  it('marque le mode courant et émet le mode choisi', async () => {
    const w = mount(CostTrackingGroupSwitch, { props: { modelValue: 'category' } })
    const buttons = w.findAll('button')
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true', 'false'])
    await buttons[2].trigger('click')
    expect(w.emitted('update:modelValue')[0]).toEqual(['type'])
  })
})

describe('CostTrackingTable', () => {
  it('sans ligne : message vide, pas de tableau', () => {
    const w = mount(CostTrackingTable, { props: { rows: [] } })
    expect(w.find('table').exists()).toBe(false)
    expect(w.text()).toContain('ctTableEmpty')
  })
  it('un clic sur une ligne d article émet son id', async () => {
    const w = mount(CostTrackingTable, { props: { rows: [row()], groupBy: 'article' } })
    await w.find('tbody tr').trigger('click')
    expect(w.emitted('select')[0]).toEqual(['a'])
  })
  it('en mode catégorie, les lignes ne sont pas cliquables', async () => {
    const w = mount(CostTrackingTable, { props: { rows: [row({ kind: 'category', id: 'c1' })], groupBy: 'category' } })
    await w.find('tbody tr').trigger('click')
    expect(w.emitted('select')).toBeUndefined()
    expect(w.text()).toContain('ctTableTitleCategory')
  })
})

describe('CostTrackingSummaryPanel', () => {
  it('sans donnée : trois messages vides', () => {
    const w = mount(CostTrackingSummaryPanel)
    expect(w.text()).toContain('ctNoRise')
    expect(w.text()).toContain('ctNoFall')
    expect(w.text()).toContain('ctNoChange')
  })
  it('un classement ouvre l historique de l article', async () => {
    const w = mount(CostTrackingSummaryPanel, { props: { rises: [row()] } })
    await w.find('.ct-rank').trigger('click')
    expect(w.emitted('select')[0]).toEqual(['a'])
  })
})

describe('CostTrackingHistoryDrawer', () => {
  const history = {
    article: { id: 'a', name: 'Burger' },
    versions: [
      { id: 'v2', effectiveFrom: '2026-05-01T08:00:00Z', reason: 'market_price', totalCost: 2.5, numberOfPieces: 1, costPerPiece: 2.5, basePrice: 10, vatRate: 5.5,
        recipe: [{ kind: 'ingredient', refId: 'i1', name: 'Steak', quantity: 1, unitCost: 2.5 }] },
      { id: 'v1', effectiveFrom: '2026-03-01T08:00:00Z', reason: 'baseline', totalCost: 2, numberOfPieces: 1, costPerPiece: 2, basePrice: 10, vatRate: 5.5,
        recipe: [{ kind: 'ingredient', refId: 'i1', name: 'Steak', quantity: 1, unitCost: 2 }] },
    ],
  }
  it('fermé : rien dans le DOM', () => {
    expect(mount(CostTrackingHistoryDrawer, { props: { open: false } }).find('.ct-drawer').exists()).toBe(false)
  })
  it('ouvert : versions, version en vigueur, changement de prix décrit, fermeture au clic sur le fond', async () => {
    const w = mount(CostTrackingHistoryDrawer, { props: { open: true, history, tags: ['Food', 'Main'] } })
    expect(w.find('#ct-drawer-title').text()).toBe('Burger')
    expect(w.findAll('.ct-version')).toHaveLength(2)
    expect(w.find('.ct-version--now').exists()).toBe(true)
    expect(w.find('.ct-version__diff').text()).toContain('ctDiffUnit')
    await w.find('.ct-drawer__scrim').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
  it('chargement et erreur', () => {
    expect(mount(CostTrackingHistoryDrawer, { props: { open: true, loading: true } }).text()).toContain('ctHistoryLoading')
    expect(mount(CostTrackingHistoryDrawer, { props: { open: true, error: 'boom' } }).text()).toContain('boom')
  })
})
