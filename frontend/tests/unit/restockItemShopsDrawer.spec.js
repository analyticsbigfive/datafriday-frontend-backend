// Chantier 388 : drawer de répartition du besoin par PDV (étape 1 réarmement).
import { mount } from '@vue/test-utils'
import RestockItemShopsDrawer from '@/components/space-workspace/restock/drawers/RestockItemShopsDrawer.vue'

// Coquille stubée : la vraie (Teleport + v-navigation-drawer) n'apporte rien
// au contrat testé ici (lignes rendues, émissions).
const EventDrawerShellStub = {
  name: 'EventDrawerShell',
  props: ['modelValue', 'title', 'subtitle', 'side'],
  emits: ['update:modelValue'],
  template: '<div class="shell-stub" :data-side="side" :data-open="String(modelValue)"><h1>{{ title }}</h1><h2>{{ subtitle }}</h2><slot /></div>',
}

const data = () => ({
  itemName: 'Bun - Burger',
  itemPercent: 110,
  totalRequired: '30 pcs',
  toOrder: '8 Packs de 4 pcs',
  rows: [
    {
      shopId: 'shop-a', shopName: 'Bloc 22bis', predicted: '20 pcs', remaining: '4 pcs',
      required: '18 pcs', requiredOk: false, deposit: '5 Packs', percent: 110, overridden: false,
    },
    {
      shopId: 'shop-b', shopName: 'Buvette Nord', predicted: '10 pcs', remaining: '0 pcs',
      required: '12 pcs', requiredOk: false, deposit: '3 Packs', percent: 120, overridden: true,
    },
    {
      shopId: 'shop-c', shopName: 'Kiosque Sud', predicted: '5 pcs', remaining: '9 pcs',
      required: '0 pcs', requiredOk: true, deposit: '0 pcs', percent: 0, overridden: true,
    },
  ],
})

function mountDrawer(props = {}) {
  return mount(RestockItemShopsDrawer, {
    props: { modelValue: true, data: data(), ...props },
    global: { stubs: { EventDrawerShell: EventDrawerShellStub, VIcon: true } },
  })
}

describe('RestockItemShopsDrawer', () => {
  it('drawer à gauche, en-tête avec nom de l\'article, nombre de PDV et totaux', () => {
    const wrapper = mountDrawer()
    const shell = wrapper.find('.shell-stub')
    expect(shell.attributes('data-side')).toBe('left')
    expect(shell.attributes('data-open')).toBe('true')
    expect(wrapper.find('h1').text()).toBe('Bun - Burger')
    expect(wrapper.find('h2').text()).toMatch(/^3 /)
    expect(wrapper.text()).toContain('30 pcs')
    expect(wrapper.text()).toContain('8 Packs de 4 pcs')
    expect(wrapper.text()).toContain('110%')
  })

  it('rend une ligne par PDV avec Prévu, Restant, Requis, À déposer et %', () => {
    const wrapper = mountDrawer()
    const rows = wrapper.findAll('[data-test="shop-row"]')
    expect(rows).toHaveLength(3)
    const b = rows[1].text()
    expect(b).toContain('Buvette Nord')
    expect(b).toContain('10 pcs')
    expect(b).toContain('12 pcs')
    expect(b).toContain('3 Packs')
    expect(b).toContain('120%')
    expect(rows[2].find('[data-test="shop-slider"]').element.value).toBe('0')
  })

  it('émet update-percent au mouvement du curseur d\'un PDV', async () => {
    const wrapper = mountDrawer()
    const slider = wrapper.findAll('[data-test="shop-slider"]')[0]
    slider.element.value = '150'
    await slider.trigger('input')
    expect(wrapper.emitted('update-percent')).toEqual([[{ shopId: 'shop-a', value: 150 }]])
  })

  it('émet reset-percent sur un PDV réglé ; bouton inactif sinon', async () => {
    const wrapper = mountDrawer()
    const resets = wrapper.findAll('[data-test="shop-reset"]')
    expect(resets[0].attributes('disabled')).toBeDefined()
    await resets[1].trigger('click')
    expect(wrapper.emitted('reset-percent')).toEqual([[{ shopId: 'shop-b' }]])
  })

  it('sans données : fermé, aucune ligne', () => {
    const wrapper = mountDrawer({ data: null })
    expect(wrapper.find('.shell-stub').attributes('data-open')).toBe('false')
    expect(wrapper.findAll('[data-test="shop-row"]')).toHaveLength(0)
  })

  it('relaie la fermeture de la coquille', async () => {
    const wrapper = mountDrawer()
    wrapper.findComponent(EventDrawerShellStub).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
