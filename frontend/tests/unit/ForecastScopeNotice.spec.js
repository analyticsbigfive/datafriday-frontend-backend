/**
 * ForecastScopeNotice : encart « modifications sans effet sur les events sans prévision par
 * article ». Dictionnaire FR réel, v-icon neutralisé.
 */
import { mount } from '@vue/test-utils'
import { translations } from '@/i18n/translations'
import ForecastScopeNotice from '@/components/space-workspace/analyse/forecast/ForecastScopeNotice.vue'

const FR = translations.fr
const EN = translations.en

const mountNotice = (stats) => mount(ForecastScopeNotice, {
  props: { stats },
  global: { stubs: { 'v-icon': true } },
})

describe('ForecastScopeNotice', () => {
  it('affiche le nombre d\'events sans prévision par article (liste d\'identifiants)', () => {
    const w = mountNotice({ priceModificationCount: 2, eventsWithoutArticleGrain: ['e2', 'e5', 'e9'] })
    const box = w.find('.fsn')
    expect(box.exists()).toBe(true)
    expect(box.attributes('role')).toBe('status')
    expect(box.text()).toBe(FR.fcstScopeNotice.replace('{count}', '3'))
    expect(box.text()).toContain('3 événement(s)')
  })

  it('accepte aussi un nombre déjà compté', () => {
    const w = mountNotice({ priceModificationCount: 1, eventsWithoutArticleGrain: 4 })
    expect(w.text()).toContain('4 événement(s)')
  })

  it('rien sans modification de prix, de catégorie ou de type', () => {
    const w = mountNotice({ priceModificationCount: 0, eventsWithoutArticleGrain: ['e1'] })
    expect(w.find('.fsn').exists()).toBe(false)
  })

  it('rien quand tous les events ont une prévision par article', () => {
    expect(mountNotice({ priceModificationCount: 3, eventsWithoutArticleGrain: [] }).find('.fsn').exists()).toBe(false)
    expect(mountNotice({ priceModificationCount: 3, eventsWithoutArticleGrain: 0 }).find('.fsn').exists()).toBe(false)
  })

  it('rien sans statistiques ou avec des statistiques incomplètes', () => {
    expect(mountNotice(null).find('.fsn').exists()).toBe(false)
    expect(mountNotice({}).find('.fsn').exists()).toBe(false)
    expect(mountNotice({ priceModificationCount: 2 }).find('.fsn').exists()).toBe(false)
  })

  it('le texte existe en français et en anglais, avec le même marqueur {count}', () => {
    expect(FR.fcstScopeNotice).toContain('{count}')
    expect(EN.fcstScopeNotice).toContain('{count}')
    expect(FR.fcstScopeNotice).not.toMatch(/\u2014/)
    expect(EN.fcstScopeNotice).not.toMatch(/\u2014/)
  })
})
