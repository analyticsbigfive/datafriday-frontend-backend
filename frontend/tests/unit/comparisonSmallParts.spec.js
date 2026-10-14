/**
 * Montage réel des petits composants du rapport de comparaison (erreurs d'exécution :
 * variable de template inconnue, prop manquante, événement mal nommé).
 */
import { mount } from '@vue/test-utils'
import { globalMountOptions, fakeChipDeltas } from './helpers/comparisonFixtures'
import { buildKpiChips } from '@/utils/comparisonReportView'
import ComparisonKpiStrip from '@/components/space-workspace/analyse/comparison/ComparisonKpiStrip.vue'
import ComparisonFilterList from '@/components/space-workspace/analyse/comparison/ComparisonFilterList.vue'
import ComparisonNotices from '@/components/space-workspace/analyse/comparison/ComparisonNotices.vue'
import ComparisonLoading from '@/components/space-workspace/analyse/comparison/ComparisonLoading.vue'
import ComparisonEmpty from '@/components/space-workspace/analyse/comparison/ComparisonEmpty.vue'
import ComparisonError from '@/components/space-workspace/analyse/comparison/ComparisonError.vue'
import ComparisonBanner from '@/components/space-workspace/analyse/comparison/ComparisonBanner.vue'

const global = globalMountOptions()
let warn
beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => {
  // Un warning Vue (propriété inconnue, prop manquante) = défaut d'exécution.
  const vueWarns = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('[Vue warn]') && !m.includes('Failed to resolve component'))
  warn.mockRestore()
  expect(vueWarns).toEqual([])
})

describe('ComparisonKpiStrip', () => {
  const fmt = { currency: (v) => `${v} EUR`, currencyDetailed: (v) => `${v} EUR`, number: (v) => String(v), percent: (v) => `${v} %` }
  const chips = buildKpiChips({ revenue: 150, avgRevenuePerEvent: 75, cost: 40, transactions: 30, avgTransaction: 5, attendees: 200, transferRate: 15, perCapita: 0.75 }, fakeChipDeltas(), { t: (k) => k, fmt })

  it('affiche 8 puces avec valeur et pastille d\'écart', () => {
    const w = mount(ComparisonKpiStrip, { props: { chips }, global })
    expect(w.findAll('.cks__chip')).toHaveLength(8)
    expect(w.findAll('.delta-pill')).toHaveLength(8)
    expect(w.find('.cks__value').text()).toContain('150 EUR')
  })

  it('affiche le squelette en chargement', () => {
    const w = mount(ComparisonKpiStrip, { props: { chips: [], loading: true }, global })
    expect(w.find('.cks__skel').exists()).toBe(true)
    expect(w.attributes('aria-busy')).toBe('true')
  })
})

describe('ComparisonFilterList', () => {
  it('distingue filtres propres et repris', () => {
    const w = mount(ComparisonFilterList, { props: { filters: [{ key: 'a', label: 'Saison', own: true }, { key: 'b', label: 'PdV', own: false }] }, global })
    const tags = w.findAll('.cfl__tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].classes()).toContain('cfl__tag--own')
    expect(tags[1].classes()).not.toContain('cfl__tag--own')
    expect(w.find('.cfl__legend').exists()).toBe(true)
  })
})

describe('ComparisonNotices', () => {
  it('ne rend rien sans alerte', () => {
    const w = mount(ComparisonNotices, { props: {}, global })
    expect(w.find('.cn').exists()).toBe(false)
  })
  it('liste toutes les alertes', () => {
    const w = mount(ComparisonNotices, {
      props: {
        sameAsMain: true,
        excludedEvents: [{ id: 'e1', name: 'Match 1', date: '2026-01-10', reason: 'no-scenario' }],
        truncation: { truncated: true, total: 150, kept: 100, cap: 100 },
        intraEventRangeIgnored: true,
      },
      global,
    })
    expect(w.findAll('.cn__alert')).toHaveLength(4)
    expect(w.text()).toContain('Match 1')
    expect(w.text()).toContain('100')
    expect(w.text()).not.toContain('{')
  })
})

describe('ComparisonLoading', () => {
  it('affiche la progression x / N', () => {
    const w = mount(ComparisonLoading, { props: { progress: { loaded: 1, total: 4 } }, global })
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('1')
    expect(w.find('.cl__bar i').attributes('style')).toContain('25%')
    expect(w.text()).not.toContain('{')
  })
  it('affiche le texte simple sans progression', () => {
    const w = mount(ComparisonLoading, { props: { progress: null }, global })
    expect(w.find('[role="progressbar"]').exists()).toBe(false)
    expect(w.findAll('.cl__skel').length).toBeGreaterThan(0)
  })
})

describe('ComparisonEmpty', () => {
  it('émet edit au clic', async () => {
    const w = mount(ComparisonEmpty, { global })
    await w.find('button').trigger('click')
    expect(w.emitted('edit')).toHaveLength(1)
  })
})

describe('ComparisonError', () => {
  it('affiche le message et émet retry puis edit', async () => {
    const w = mount(ComparisonError, { props: { message: 'Boom' }, global })
    expect(w.text()).toContain('Boom')
    const [retry, edit] = w.findAll('button')
    await retry.trigger('click')
    await edit.trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    expect(w.emitted('edit')).toHaveLength(1)
  })
})

describe('ComparisonBanner', () => {
  it('émet export-csv, copy, share, edit et toggle-expand', async () => {
    const w = mount(ComparisonBanner, { props: { label: 'Saison 2025', eventCount: 12 }, global })
    expect(w.text()).toContain('Saison 2025')
    expect(w.text()).toContain('12')
    const buttons = w.findAll('button')
    expect(buttons).toHaveLength(5)
    // ordre : extension, export, copie, partage, modifier
    for (const b of buttons) await b.trigger('click')
    expect(w.emitted('toggle-expand')).toHaveLength(1)
    expect(w.emitted('export-csv')).toHaveLength(1)
    expect(w.emitted('copy')).toHaveLength(1)
    expect(w.emitted('share')).toHaveLength(1)
    expect(w.emitted('edit')).toHaveLength(1)
  })
})

describe('ComparisonBanner : mobile et bureau', () => {
  it('mobile : bouton fermer (émet close, cible 44 px), pas de bouton d\'extension', async () => {
    const w = mount(ComparisonBanner, { props: { label: 'Saison 2025', eventCount: 3, mobile: true }, global })
    expect(w.find('[aria-pressed]').exists()).toBe(false)
    const close = w.find('button.cb__ico--touch')
    expect(close.exists()).toBe(true)
    expect(close.attributes('aria-label')).toBe('Fermer la comparaison')
    expect(close.classes()).toContain('cb__ico--touch')
    await close.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('toggle-expand')).toBeUndefined()
  })

  it('bureau : bouton d\'extension, pas de bouton fermer', async () => {
    const w = mount(ComparisonBanner, { props: { label: 'Saison 2025', eventCount: 3 }, global })
    expect(w.find('button.cb__ico--touch').exists()).toBe(false)
    expect(w.find('[aria-pressed]').exists()).toBe(true)
  })

  it('showEventCount faux : le nombre d\'events n\'est pas répété', () => {
    const w = mount(ComparisonBanner, { props: { label: '1 événement(s)', eventCount: 1, showEventCount: false }, global })
    expect(w.find('.cb__label').text()).toBe('1 événement(s)')
  })
})

describe('ComparisonBanner : états des actions', () => {
  it('désactive l\'export pendant le chargement et n\'émet pas', async () => {
    const w = mount(ComparisonBanner, { props: { exportDisabled: true }, global })
    const exp = w.findAll('button')[1]
    expect(exp.attributes('disabled')).toBeDefined()
    await exp.trigger('click')
    expect(w.emitted('export-csv')).toBeUndefined()
  })
  it('affiche un spinner et désactive le bouton pendant export, copie, partage', () => {
    const w = mount(ComparisonBanner, { props: { exporting: true, copying: true, sharing: true }, global })
    const [, exp, copy, share] = w.findAll('button')
    for (const b of [exp, copy, share]) {
      expect(b.attributes('disabled')).toBeDefined()
      expect(b.attributes('aria-busy')).toBe('true')
    }
  })
})

