/**
 * ForecastScopeNotice : icône (i) en tête des filtres appliqués du rapport Forecast. Le détail du
 * calcul (events estimés par le mix historique, events sans effet) s'affiche dans une infobulle,
 * plus de bandeau permanent. Dictionnaire FR réel, v-icon neutralisé, v-tooltip remplacé par un
 * stub qui rend l'activateur ET le contenu (le vrai tooltip n'existe qu'au survol).
 */
import { mount } from '@vue/test-utils'
import { translations } from '@/i18n/translations'
import ForecastScopeNotice from '@/components/space-workspace/analyse/forecast/ForecastScopeNotice.vue'

const FR = translations.fr
const EN = translations.en

const VTooltipStub = {
  template: '<div class="tt"><slot name="activator" :props="{}" /><div class="tt__body"><slot /></div></div>',
}

const mountNotice = (stats) => mount(ForecastScopeNotice, {
  props: { stats },
  global: { stubs: { 'v-icon': true, 'v-tooltip': VTooltipStub } },
})

const lineTexts = (w) => w.findAll('.fsn__txt > span').map((l) => l.text())

describe('ForecastScopeNotice', () => {
  it('une icône (i) bouton, nommée pour les lecteurs d\'écran, et plus aucun bandeau', () => {
    const w = mountNotice({ priceModificationCount: 2, eventsWithoutArticleGrain: ['e2', 'e5', 'e9'] })
    const icon = w.find('button.fsn')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('type')).toBe('button')
    expect(icon.attributes('aria-label')).toBe(FR.fcstNoticeIconLabel)
    expect(w.find('[role="status"]').exists()).toBe(false)
    // Le texte n'est pas dans le bouton : il vit dans l'infobulle.
    expect(icon.text()).toBe('')
  })

  it('l\'infobulle affiche le nombre d\'events sans prévision par article (liste d\'identifiants)', () => {
    const w = mountNotice({ priceModificationCount: 2, eventsWithoutArticleGrain: ['e2', 'e5', 'e9'] })
    expect(lineTexts(w)).toEqual([FR.fcstScopeNotice.replace('{count}', '3')])
    expect(w.find('.tt__body').text()).toContain('3 événement(s)')
  })

  it('events estimés par le mix historique : ligne d\'information, avant celle des events sans effet', () => {
    const w = mountNotice({ priceModificationCount: 1, eventsFromHistoricalMix: ['e3', 'e4'], eventsWithoutArticleGrain: ['e9'] })
    expect(lineTexts(w)).toEqual([
      FR.fcstHistoryNotice.replace('{count}', '2'),
      FR.fcstScopeNotice.replace('{count}', '1'),
    ])
    expect(EN.fcstHistoryNotice).toContain('{count}')
    expect(FR.fcstHistoryNotice).not.toMatch(/\u2014/)
  })

  it('historique seul : une seule ligne', () => {
    const w = mountNotice({ priceModificationCount: 1, eventsFromHistoricalMix: 3, eventsWithoutArticleGrain: [] })
    expect(lineTexts(w)).toEqual([FR.fcstHistoryNotice.replace('{count}', '3')])
  })

  it('accepte aussi un nombre déjà compté', () => {
    const w = mountNotice({ priceModificationCount: 1, eventsWithoutArticleGrain: 4 })
    expect(w.find('.tt__body').text()).toContain('4 événement(s)')
  })

  it('rien sans modification de prix, de catégorie ou de type', () => {
    const w = mountNotice({ priceModificationCount: 0, eventsWithoutArticleGrain: ['e1'] })
    expect(w.find('.fsn').exists()).toBe(false)
    expect(w.find('.tt').exists()).toBe(false)
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
