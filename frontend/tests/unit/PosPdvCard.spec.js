/**
 * PosPdvCard : statut, sources de vente (ajout aux autres sources), PIN, ▶ / ■ et ouverture de
 * la caisse. Vuetify est neutralisé par des stubs minimaux.
 */
import { mount } from '@vue/test-utils'
import PosPdvCard from '@/components/space-workspace/pos/PosPdvCard.vue'

const stubs = {
  'v-icon': { template: '<i class="v-icon-stub"><slot /></i>' },
  'v-progress-circular': { template: '<i class="v-progress-stub" />' },
  'v-btn': { emits: ['click'], template: '<button class="v-btn-stub" @click="$emit(\'click\')"><slot /></button>' },
  'v-menu': { template: '<div><slot name="activator" :props="{}" /></div>' },
  'v-list': { template: '<div><slot /></div>' },
  'v-list-item': { template: '<div><slot /></div>' },
  'v-list-item-title': { template: '<span><slot /></span>' },
}

const row = (over = {}) => ({
  elementId: 'p1', name: 'Buvette Tribune Nord', type: 'Buvette', zoneLabel: 'Espace Tribune Nord',
  spaceMenuLabel: 'Menu Buvette Standard', itemsCount: 21, status: 'inactive', pin: null, qrSlug: 'abc',
  responsibleHrPersonId: null, responsibleName: null, otherSources: ['WEEZEVENT'], sales: { tickets: 0, revenueTtc: 0 }, ...over,
})

const mountCard = (pdv, props = {}) =>
  mount(PosPdvCard, { props: { pdv, canEditResponsible: false, ...props }, global: { stubs } })

describe('PosPdvCard', () => {
  it('caisse arrêtée : statut inactif, source existante, invite à démarrer, pas de PIN', () => {
    const w = mountCard(row())
    expect(w.text()).toContain('Buvette Tribune Nord')
    expect(w.text()).toContain('Espace Tribune Nord · Menu Buvette Standard · 21 articles')
    expect(w.find('.pos-pdv__status').classes()).toContain('pos-pdv__status--inactive')
    expect(w.text()).toContain('Source : Weezevent')
    expect(w.text()).toContain('Démarrer pour ouvrir')
    expect(w.find('.pos-pin').exists()).toBe(false)
    expect(w.find('.pos-pdv__open').exists()).toBe(false)
  })

  it('caisse démarrée : la caisse POS s ajoute aux autres sources et affiche le PIN', () => {
    const w = mountCard(row({ status: 'selling', pin: '482913' }))
    expect(w.text()).toContain('Source : Data Friday POS + Weezevent')
    expect(w.find('.pos-pin__code').text()).toBe('482913')
    expect(w.find('.pos-pdv__open').exists()).toBe(true)
    expect(w.find('.pos-pdv__dot--selling').exists()).toBe(true)
  })

  it('émet toggle et open-cashier avec le PdV', async () => {
    const pdv = row({ status: 'ready', pin: '111111' })
    const w = mountCard(pdv)
    await w.find('.pos-pdv__toggle').trigger('click')
    await w.find('.pos-pdv__open').trigger('click')
    expect(w.emitted('toggle')[0]).toEqual([pdv])
    expect(w.emitted('open-cashier')[0]).toEqual([pdv])
  })

  it('le bouton de nouveau PIN n apparaît qu avec le droit de gestion', () => {
    const pdv = row({ status: 'ready', pin: '111111' })
    expect(mountCard(pdv).find('.pos-pin__reset').exists()).toBe(false)
    expect(mountCard(pdv, { canManage: true }).find('.pos-pin__reset').exists()).toBe(true)
  })
})
