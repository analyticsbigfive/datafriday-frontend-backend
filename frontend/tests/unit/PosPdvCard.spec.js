/**
 * PosPdvCard : nom du PdV, statut porté par la pastille, PIN, ▶ / ■ et ouverture de la caisse.
 * Ni le libellé du statut ni les sources de vente ne sont écrits sur la carte. Vuetify est neutralisé par des stubs minimaux.
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
  it('caisse arrêtée : nom en premier, pastille inactive, invite à démarrer, pas de PIN', () => {
    const w = mountCard(row())
    expect(w.find('.pos-pdv__name').text()).toBe('Buvette Tribune Nord')
    expect(w.text()).toContain('Espace Tribune Nord · Menu Buvette Standard · 21 articles')
    expect(w.find('.pos-pdv__dot').classes()).toContain('pos-pdv__dot--inactive')
    expect(w.find('.pos-pdv__status').exists()).toBe(false)
    expect(w.find('.pos-pdv__sources').exists()).toBe(false)
    expect(w.text()).not.toContain('Source')
    expect(w.text()).toContain('Démarrer pour ouvrir')
    expect(w.find('.pos-pin').exists()).toBe(false)
    expect(w.find('.pos-pdv__open').exists()).toBe(false)
  })

  it('caisse démarrée : affiche le PIN et la pastille de statut, sans libellé de statut', () => {
    const w = mountCard(row({ status: 'selling', pin: '482913' }))
    expect(w.find('.pos-pdv__status').exists()).toBe(false)
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

describe('PosPdvCard : QR code', () => {
  const qrStubs = { ...stubs, GuestPinQrDialog: { template: '<div class="qr-dialog-stub" />' } }

  it('propose le QR code (le lien est dans sa fenêtre), même caisse arrêtée, sans bouton lien', () => {
    const w = mount(PosPdvCard, { props: { pdv: row({ qrSlug: 'buvette-d-xyz' }), canEditResponsible: false }, global: { stubs: qrStubs } })
    expect(w.findAll('.pos-qr__btn')).toHaveLength(1)
    expect(w.find('.pos-qr__btn').attributes('aria-label')).toBe('Afficher le QR code')
  })
})
