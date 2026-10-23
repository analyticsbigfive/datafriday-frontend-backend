/**
 * Blocs de la page Cost tracking : états vides, bascule « Afficher par », tableau, tiroir d'historique.
 */
import { config, mount } from '@vue/test-utils'
import { vuetifyToggleStubs } from './helpers/vuetifyToggleStubs'
import CostTrackingGroupSwitch from '@/components/space-workspace/cost-tracking/CostTrackingGroupSwitch.vue'
import CostTrackingHistoryDrawer from '@/components/space-workspace/cost-tracking/CostTrackingHistoryDrawer.vue'
import CostTrackingStateMessage from '@/components/space-workspace/cost-tracking/CostTrackingStateMessage.vue'
import CostTrackingSummaryPanel from '@/components/space-workspace/cost-tracking/CostTrackingSummaryPanel.vue'
import CostTrackingTable from '@/components/space-workspace/cost-tracking/CostTrackingTable.vue'

config.global.stubs = { ...config.global.stubs, ...vuetifyToggleStubs }

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
  it('périmètre vide : le titre nomme le mode courant', () => {
    const w = mount(CostTrackingStateMessage, { props: { kind: 'noScope', groupBy: 'supplier' } })
    expect(w.text()).toContain('ctNoScopeTitleSupplier')
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
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false'])
    await buttons[2].trigger('click')
    expect(w.emitted('update:modelValue')[0]).toEqual(['type'])
  })
  it('propose fournisseur, composant et ingrédient sans article filtré', async () => {
    const w = mount(CostTrackingGroupSwitch, { props: { modelValue: 'article' } })
    const buttons = w.findAll('button')
    await buttons[3].trigger('click')
    await buttons[4].trigger('click')
    await buttons[5].trigger('click')
    expect(w.emitted('update:modelValue').map((e) => e[0])).toEqual(['supplier', 'component', 'ingredient'])
  })
})

describe('CostTrackingTable', () => {
  it('le texte d aide suit le mode', () => {
    const w = mount(CostTrackingTable, { props: { rows: [], groupBy: 'supplier' } })
    expect(w.text()).toContain('ctTableHintSupplier')
  })
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
    const buttons = w.findAll('.ct-seg button')
    expect(buttons).toHaveLength(2)
    await buttons[1].trigger('click')
    expect(w.emitted('update:aggregate')[0]).toEqual(['sum'])
  })
  it('ne le propose pas pour des articles', () => {
    const w = mount(CostTrackingSummaryPanel, { props: { groupBy: 'article' } })
    expect(w.find('.ct-seg').exists()).toBe(false)
  })
})

describe('CostTrackingSummaryPanel', () => {
  const names = (w) => w.findAll('.ct-rank__name').map((n) => n.text())
  const mixed = [
    row({ key: 'article:a', id: 'a', name: 'Burger', variation: { abs: 0.5, pct: 25, direction: 'up' } }),
    row({ key: 'article:b', id: 'b', name: 'Frites', variation: { abs: -0.2, pct: -10, direction: 'down' } }),
    row({ key: 'article:c', id: 'c', name: 'Éclair', variation: { abs: 0.1, pct: 5, direction: 'up' } }),
  ]
  it('sans donnée : message vide de la section et des changements', () => {
    const w = mount(CostTrackingSummaryPanel)
    expect(w.text()).toContain('ctPerfEmpty')
    expect(w.text()).toContain('ctNoChange')
  })
  it('une seule section dont le titre suit le niveau affiché', () => {
    expect(mount(CostTrackingSummaryPanel, { props: { groupBy: 'type' } }).text()).toContain('ctPerfTitleType')
    expect(mount(CostTrackingSummaryPanel, { props: { groupBy: 'ingredient' } }).text()).toContain('ctPerfTitleIngredient')
  })
  it('section fournisseurs en plus, sauf en mode fournisseur', async () => {
    const supplierRows = [row({ key: 'supplier:s1', id: 's1', kind: 'supplier', name: 'Metro' })]
    const w = mount(CostTrackingSummaryPanel, { props: { groupBy: 'article', supplierRows } })
    expect(w.text()).toContain('ctPerfTitleSupplier')
    expect(w.text()).toContain('Metro')
    await w.findAll('.ct-rank').filter((n) => n.text().includes('Metro'))[0].trigger('click')
    expect(w.emitted('drill')[0][0]).toMatchObject({ id: 's1', kind: 'supplier' })
    const same = mount(CostTrackingSummaryPanel, { props: { groupBy: 'supplier', supplierRows } })
    expect(same.text().match(/ctPerfTitleSupplier/g)).toHaveLength(1)
    expect(same.text()).not.toContain('Metro')
  })
  it('Moyenne / Total proposé en mode fournisseur, pas en mode composant', () => {
    expect(mount(CostTrackingSummaryPanel, { props: { groupBy: 'supplier' } }).find('.ct-seg').exists()).toBe(true)
    expect(mount(CostTrackingSummaryPanel, { props: { groupBy: 'component' } }).find('.ct-seg').exists()).toBe(false)
  })
  it('un classement descend d un niveau (drill)', async () => {
    const w = mount(CostTrackingSummaryPanel, { props: { rows: [row()] } })
    await w.find('.ct-rank').trigger('click')
    expect(w.emitted('drill')[0][0]).toMatchObject({ id: 'a', kind: 'article' })
  })
  it('affiche 5 lignes puis tout avec Voir tout', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row({ key: `article:${i}`, id: `a${i}`, name: `N${i}` }))
    const w = mount(CostTrackingSummaryPanel, { props: { rows } })
    expect(w.findAll('.ct-rank')).toHaveLength(5)
    await w.find('.ct-perf__more').trigger('click')
    expect(w.findAll('.ct-rank')).toHaveLength(7)
  })
  it('tri par défaut hausses d abord, boutons de tri bascule et grise le bouton actif', async () => {
    const w = mount(CostTrackingSummaryPanel, { props: { rows: mixed } })
    expect(names(w)).toEqual(['Burger', 'Éclair', 'Frites'])
    const [up, down] = w.findAll('.ct-sort__btn')
    expect(up.attributes('disabled')).toBeDefined()
    expect(up.attributes('aria-pressed')).toBe('true')
    await down.trigger('click')
    expect(names(w)).toEqual(['Frites', 'Éclair', 'Burger'])
    expect(down.attributes('disabled')).toBeDefined()
    expect(up.attributes('disabled')).toBeUndefined()
  })
  it('la recherche filtre par nom sans tenir compte de la casse ni des accents', async () => {
    const w = mount(CostTrackingSummaryPanel, { props: { rows: mixed } })
    await w.find('.ct-perf__search').setValue('ECLAIR')
    expect(names(w)).toEqual(['Éclair'])
    await w.find('.ct-perf__search').setValue('zzz')
    expect(w.text()).toContain('ctPerfNoMatch')
  })
  it('la carte affiche amount quand il est fourni, sinon le coût actuel', () => {
    const w = mount(CostTrackingSummaryPanel, {
      props: { rows: [row({ key: 'article:x', name: 'X', amount: 1234 }), row({ key: 'article:y', name: 'Y', currentCost: 2.5, variation: { abs: 0, pct: 1, direction: 'up' } })] },
    })
    const amounts = w.findAll('.ct-rank__amount').map((n) => n.text())
    expect(amounts[0]).toMatch(/1[\s\u202f\u00a0,.]?234/)
    expect(amounts[1]).toMatch(/2[,.]50?/)
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
