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
  it('un clic sur une ligne émet la ligne (descente d un niveau)', async () => {
    const w = mount(CostTrackingTable, { props: { rows: [row()], groupBy: 'article' } })
    await w.find('tbody tr').trigger('click')
    expect(w.emitted('select')[0][0]).toMatchObject({ id: 'a', kind: 'article' })
  })
  it('le lien Historique d un article émet son id sans descendre', async () => {
    const w = mount(CostTrackingTable, { props: { rows: [row()], groupBy: 'article' } })
    await w.find('.ct-table__history').trigger('click')
    expect(w.emitted('history')[0]).toEqual(['a'])
    expect(w.emitted('select')).toBeUndefined()
  })
  it('en mode catégorie, une ligne émet la catégorie, sans lien Historique', async () => {
    const w = mount(CostTrackingTable, { props: { rows: [row({ kind: 'category', id: 'c1' })], groupBy: 'category' } })
    await w.find('tbody tr').trigger('click')
    expect(w.emitted('select')[0][0]).toMatchObject({ id: 'c1', kind: 'category' })
    expect(w.find('.ct-table__history').exists()).toBe(false)
    expect(w.text()).toContain('ctTableTitleCategory')
  })
})

describe('CostTrackingSummaryPanel : total ou moyenne', () => {
  it('propose le choix pour une catégorie et émet la valeur choisie', async () => {
    const w = mount(CostTrackingSummaryPanel, { props: { groupBy: 'category', aggregate: 'avg' } })
    const buttons = w.findAll('.ct-summary__agg')
    expect(buttons).toHaveLength(2)
    await buttons[1].trigger('click')
    expect(w.emitted('update:aggregate')[0]).toEqual(['sum'])
  })
  it('ne le propose pas pour des articles', () => {
    const w = mount(CostTrackingSummaryPanel, { props: { groupBy: 'article' } })
    expect(w.find('.ct-summary__aggregate').exists()).toBe(false)
  })
})

describe('CostTrackingSummaryPanel', () => {
  it('sans donnée : trois messages vides', () => {
    const w = mount(CostTrackingSummaryPanel)
    expect(w.text()).toContain('ctNoRise')
    expect(w.text()).toContain('ctNoFall')
    expect(w.text()).toContain('ctNoChange')
  })
  it('un classement descend d un niveau (drill)', async () => {
    const w = mount(CostTrackingSummaryPanel, { props: { rises: [row()] } })
    await w.find('.ct-rank').trigger('click')
    expect(w.emitted('drill')[0][0]).toMatchObject({ id: 'a', kind: 'article' })
  })
  it('affiche 5 lignes puis tout avec Voir tout', async () => {
    const rises = Array.from({ length: 7 }, (_, i) => row({ key: `article:${i}`, id: `a${i}` }))
    const w = mount(CostTrackingSummaryPanel, { props: { rises } })
    expect(w.findAll('.ct-rank')).toHaveLength(5)
    await w.find('.ct-summary__more').trigger('click')
    expect(w.findAll('.ct-rank')).toHaveLength(7)
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
