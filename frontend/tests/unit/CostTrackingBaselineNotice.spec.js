/**
 * Notice « Suivi des coûts actif depuis le... » : affichée, fermable par la croix, fermeture
 * mémorisée (clé costTracking.baselineNoticeDismissed) sans jamais lever si le stockage est bloqué.
 */
import { mount } from '@vue/test-utils'
import CostTrackingBaselineNotice from '@/components/space-workspace/cost-tracking/CostTrackingBaselineNotice.vue'

jest.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (k) => k, locale: { value: 'fr' } }) }))

const KEY = 'costTracking.baselineNoticeDismissed'
const stubs = { 'router-link': { template: '<a class="rl"><slot /></a>' } }
const mountNotice = (props = {}) =>
  mount(CostTrackingBaselineNotice, {
    props: { startedAt: Date.parse('2026-05-04T12:00:00Z'), firstEvent: { name: 'J32 vs Brest', t: Date.parse('2026-05-09T12:00:00Z') }, ...props },
    global: { stubs },
  })

describe('CostTrackingBaselineNotice', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => jest.restoreAllMocks())

  it('affiche le titre et le premier match couvert', () => {
    const w = mountNotice()
    expect(w.find('.ct-notice').exists()).toBe(true)
    expect(w.text()).toContain('ctNoticeTitle')
    expect(w.find('.ct-notice__first').exists()).toBe(true)
  })

  it('sans premier match, la ligne dédiée disparaît', () => {
    expect(mountNotice({ firstEvent: null }).find('.ct-notice__first').exists()).toBe(false)
  })

  it('la croix ferme la notice et mémorise la fermeture', async () => {
    const w = mountNotice()
    await w.find('.ct-notice__close').trigger('click')
    expect(w.find('.ct-notice').exists()).toBe(false)
    expect(window.localStorage.getItem(KEY)).toBe('1')
  })

  it('reste fermée au montage suivant', () => {
    window.localStorage.setItem(KEY, '1')
    expect(mountNotice().find('.ct-notice').exists()).toBe(false)
  })

  it('stockage bloqué : visible, et la fermeture ne lève pas', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const w = mountNotice()
    expect(w.find('.ct-notice').exists()).toBe(true)
    await w.find('.ct-notice__close').trigger('click')
    expect(w.find('.ct-notice').exists()).toBe(false)
  })
})
