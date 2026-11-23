/**
 * Ligne « Revenue net » des bandeaux rouges (Prévision et comparaison Forecast) : valeur, écart vs la
 * prévision d'origine, « — » sans coût connu ; le bandeau de comparaison la montre à la place du libellé.
 */
import { mount } from '@vue/test-utils'
import { translations } from '@/i18n/translations'
import NetRevenueLine from '@/components/space-workspace/analyse/comparison/NetRevenueLine.vue'
import ComparisonBanner from '@/components/space-workspace/analyse/comparison/ComparisonBanner.vue'

const FR = translations.fr
const stubs = { 'v-icon': true, 'v-progress-circular': true }
const delta = (over) => ({ kind: 'delta', delta: 2, tone: 'good', text: '▲ 2,0 %', ...over })

describe('NetRevenueLine', () => {
  it('affiche le libellé, le montant et l\'écart', () => {
    const w = mount(NetRevenueLine, { props: { value: 71682, delta: delta({}) } })
    expect(w.find('.nrl__label').text()).toBe(FR.anNetRevenueLabel)
    expect(w.find('.nrl__value').text().replace(/\s/g, '')).toBe('71682€')
    expect(w.find('.nrl__delta').text()).toContain('▲ 2,0 %')
    expect(w.find('.nrl__delta').classes()).toContain('nrl__delta--good')
    expect(w.attributes('title')).toBe(FR.anNetRevenueTip)
  })

  it('l\'écart est lisible par un lecteur d\'écran (« en hausse de 2,0 % »)', () => {
    const w = mount(NetRevenueLine, { props: { value: 10, delta: delta({}) } })
    expect(w.find('.nrl__sr').text()).toBe(translations.fr.anDeltaSrUp.replace('{value}', '2,0 %'))
    const down = mount(NetRevenueLine, { props: { value: 10, delta: delta({ delta: -3, tone: 'bad', text: '▼ 3,0 %' }) } })
    expect(down.find('.nrl__delta').classes()).toContain('nrl__delta--bad')
    expect(down.find('.nrl__sr').text()).toBe(translations.fr.anDeltaSrDown.replace('{value}', '3,0 %'))
    const zero = mount(NetRevenueLine, { props: { value: 10, delta: delta({ delta: 0, tone: 'neutral', text: '= 0,0 %' }) } })
    expect(zero.find('.nrl__sr').text()).toBe(translations.fr.anDeltaSrZero)
  })

  it('sans écart (principal) : le montant seul, pas de pastille', () => {
    const w = mount(NetRevenueLine, { props: { value: 70274 } })
    expect(w.find('.nrl__delta').exists()).toBe(false)
    expect(mount(NetRevenueLine, { props: { value: 5, delta: { kind: 'none', text: '—', tone: 'neutral' } } }).find('.nrl__delta').exists()).toBe(false)
  })

  it('sans coût connu : « — » et une infobulle qui dit pourquoi', () => {
    const w = mount(NetRevenueLine, { props: { value: null } })
    expect(w.find('.nrl__value').text()).toBe('—')
    expect(w.attributes('title')).toBe(FR.anNetRevenueNoCost)
  })

  it('un revenu net nul reste un montant (0 €), pas un « — »', () => {
    const w = mount(NetRevenueLine, { props: { value: 0 } })
    expect(w.find('.nrl__value').text().replace(/\s/g, '')).toBe('0€')
  })

  it('textes sans tiret long, en français et en anglais', () => {
    for (const k of ['anNetRevenueLabel', 'anNetRevenueTip', 'anNetRevenueNoCost']) {
      expect(translations.fr[k]).toBeTruthy()
      expect(translations.en[k]).toBeTruthy()
      expect(translations.fr[k]).not.toMatch(/—/)
      expect(translations.en[k]).not.toMatch(/—/)
    }
  })
})

describe('ComparisonBanner : Revenue net', () => {
  const mountBanner = (props) => mount(ComparisonBanner, {
    props: { label: 'Prix TTC 1664 : 9,50 €', eventCount: 71, ...props },
    global: { stubs },
  })

  it('Forecast : le Revenue net remplace le libellé et le nombre d\'events (doublons des puces)', () => {
    const w = mountBanner({ netRevenue: { value: 71682, delta: delta({}) } })
    expect(w.find('.cb__net').exists()).toBe(true)
    expect(w.find('.cb__label').exists()).toBe(false)
    expect(w.text()).not.toContain('Prix TTC 1664')
    expect(w.text()).not.toContain('71 événement')
    expect(w.text()).toContain(FR.anNetRevenueLabel)
    expect(w.text()).toContain('▲ 2,0 %')
    // Le bouton « Modifier les critères » reste dans la même ligne.
    expect(w.find('.cb__edit').exists()).toBe(true)
  })

  it('autres comparaisons (sans netRevenue) : libellé et nombre d\'events inchangés', () => {
    const w = mountBanner({})
    expect(w.find('.cb__net').exists()).toBe(false)
    expect(w.find('.cb__label').text()).toContain('Prix TTC 1664')
    expect(w.find('.cb__label').text()).toContain('71')
  })
})
