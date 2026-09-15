import { mount } from '@vue/test-utils'
import InventoryReconciliationView from '@/components/space-workspace/inventory/InventoryReconciliationView.vue'

/**
 * Critère Doors Open (BUG-383-02) : dans le document de réconciliation pre-event, les
 * valeurs reprises automatiquement de la Logistique sont suivies de « (L) ».
 */
const line = (overrides) => ({
  elementId: 'shop-1',
  elementName: 'Buvette D',
  itemKey: 'mi-1',
  itemName: 'Bière',
  unitsPerPack: 6,
  expectedPacked: 3,
  expectedLoose: 1,
  expectedUnits: 19,
  countedPacked: 3,
  countedLoose: 1,
  countedUnits: 19,
  countedSource: 'count',
  deltaPacked: 0,
  deltaLoose: 0,
  deltaUnits: 0,
  ...overrides,
})

function mountView(lines) {
  return mount(InventoryReconciliationView, {
    props: {
      reconciliation: { id: 'reco-1', kind: 'pre-event', eventName: 'Match A', createdAt: '2026-09-15T17:00:00Z', lines, meta: {} },
    },
    global: { stubs: { VIcon: true, VBtn: true, VTextField: true, VBtnToggle: true, VChip: true } },
  })
}

describe('InventoryReconciliationView, document pre-event : marqueur « (L) »', () => {
  it('affiche « (L) » et la légende quand une ligne vient de la Logistique, rien sinon', async () => {
    const wrapper = mountView([
      line({ itemKey: 'mi-1', itemName: 'Bière', countedSource: 'count' }),
      line({ itemKey: 'mi-2', itemName: 'Chips', countedSource: 'logistic' }),
    ])
    const text = wrapper.text()
    expect(text).toContain('(L)')
    expect(text).toContain('(L) = non compté')
    const rows = wrapper.findAll('tr.irv-row')
    const chips = rows.find((r) => r.text().includes('Chips'))
    const beer = rows.find((r) => r.text().includes('Bière'))
    expect(chips.text()).toContain('(L)')
    expect(beer.text()).not.toContain('(L)')
  })

  it("n'affiche ni marqueur ni légende quand tout a été compté", () => {
    const wrapper = mountView([line({ countedSource: 'count' })])
    expect(wrapper.text()).not.toContain('(L)')
  })

  it('en mode PdV, le total du groupe porte « (L) » dès qu\'un article du PdV vient de la Logistique', async () => {
    const wrapper = mountView([
      line({ itemKey: 'mi-1', itemName: 'Bière', countedSource: 'count' }),
      line({ itemKey: 'mi-2', itemName: 'Chips', countedSource: 'logistic' }),
    ])
    wrapper.vm.mode = 'pos'
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('tr.irv-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('Buvette D')
    expect(rows[0].text()).toContain('(L)')
  })
})
