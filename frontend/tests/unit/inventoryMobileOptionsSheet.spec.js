/**
 * Design mobile Bertrand 2026-10-07 : menu « Options inventaire » ouvert par le ☰.
 */
import { shallowMount, config } from '@vue/test-utils'
import InventoryMobileOptionsSheet from '@/components/space-workspace/inventory/InventoryMobileOptionsSheet.vue'

const VBtnStub = { template: '<button class="vbtn" @click="$emit(\'click\')"><slot /></button>', emits: ['click'] }

function mountSheet(props = {}) {
  config.global.renderStubDefaultSlot = true
  return shallowMount(InventoryMobileOptionsSheet, {
    props: { modelValue: true, toolItems: [], currentTool: 'space-inventory', ...props },
    global: { stubs: { 'v-btn': VBtnStub, VBtn: VBtnStub } },
  })
}

const buttons = (w) => w.findAll('.imo-actions .vbtn')

describe('InventoryMobileOptionsSheet', () => {
  afterEach(() => { config.global.renderStubDefaultSlot = false })

  it('ordre de la maquette : Filtres, Résumé, Imprimer, Exporter, Voir tout', () => {
    const labels = buttons(mountSheet({ canToggleFullInventory: true })).map((b) => b.text().replace(/^mdi-[a-z-]+ /, ''))
    expect(labels).toEqual(['Filtres', 'Résumé inventaire', "Imprimer l'inventaire", expect.stringMatching(/CSV|Export/i), "Voir tout l'inventaire"])
  })

  it('pas de « Vérifier Stock Menu » ni de recherche sur mobile', () => {
    const w = mountSheet()
    expect(w.text()).not.toMatch(/Vérifier|couverture/i)
    expect(w.find('input[type="text"]').exists()).toBe(false)
  })

  it('chaque action ferme le menu puis émet son évènement', async () => {
    const w = mountSheet()
    await buttons(w)[1].trigger('click')
    expect(w.emitted('update:modelValue')[0]).toEqual([false])
    expect(w.emitted('summary')).toHaveLength(1)
  })

  it('■ ▶ en tête seulement quand l\'accès PIN s\'applique', () => {
    expect(mountSheet().findComponent({ name: 'InventoryPinActionButtons' }).exists()).toBe(false)
    const w = mountSheet({ pinAccess: { spaceId: 's', eventId: 'e', phase: 'post-event' } })
    const pin = w.findComponent({ name: 'InventoryPinActionButtons' })
    expect(pin.exists()).toBe(true)
    expect(pin.props('large')).toBe(true)
  })
})

describe('InventoryMobileOptionsSheet : Résumé selon l\'onglet', () => {
  afterEach(() => { config.global.renderStubDefaultSlot = false })

  it('onglet Merch (pas de résumé desktop) : bouton Résumé masqué', () => {
    const labels = buttons(mountSheet({ canShowSummary: false })).map((b) => b.text())
    expect(labels.some((l) => /Résumé/.test(l))).toBe(false)
  })
})
