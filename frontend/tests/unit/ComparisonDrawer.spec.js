/**
 * ComparisonDrawer et ComparisonDrawerHead : montage réel.
 */
jest.mock('@/store', () => ({ __esModule: true, default: { state: {}, getters: {} } }))
import { mount } from '@vue/test-utils'
import { globalMountOptions, fakeRuntime } from './helpers/comparisonFixtures'
import ComparisonDrawer from '@/components/space-workspace/analyse/comparison/ComparisonDrawer.vue'
import ComparisonDrawerHead from '@/components/space-workspace/analyse/comparison/ComparisonDrawerHead.vue'

const global = globalMountOptions()

describe('ComparisonDrawer', () => {
  it('rend le titre, le contenu par défaut et ferme par bouton', async () => {
    const w = mount(ComparisonDrawer, { global, attachTo: document.body })
    expect(w.attributes('role')).toBe('complementary')
    expect(w.find('h2').exists()).toBe(true)
    expect(w.find('.cmp-drawer__placeholder').exists()).toBe(true)
    await w.find('.cmp-drawer__btn--close').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    await w.find('.cmp-drawer__btn--edge').trigger('click')
    expect(w.emitted('toggle-expand')).toHaveLength(1)
    w.unmount()
  })

  it('ferme avec Échap et prend le focus', async () => {
    const w = mount(ComparisonDrawer, { global, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.activeElement).toBe(w.element)
    await w.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })

  it('rend le focus à l\'élément précédent au démontage', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    btn.focus()
    const w = mount(ComparisonDrawer, { global, attachTo: document.body })
    w.unmount()
    expect(document.activeElement).toBe(btn)
    btn.remove()
  })

  it('reportMode : slot head affiché, titre et extension masqués', () => {
    const w = mount(ComparisonDrawer, {
      props: { reportMode: true },
      slots: { head: '<div class="my-head">puces</div>', default: '<p class="body">contenu</p>' },
      global,
    })
    expect(w.find('.my-head').exists()).toBe(true)
    expect(w.find('h2').exists()).toBe(false)
    expect(w.find('.cmp-drawer__btn--edge').exists()).toBe(false)
    expect(w.find('.cmp-drawer__btn--close').exists()).toBe(true)
    expect(w.find('.body').text()).toBe('contenu')
  })

  it('icône d\'extension selon la disposition', () => {
    const split = mount(ComparisonDrawer, { props: { layout: 'split' }, global })
    const drawer = mount(ComparisonDrawer, { props: { layout: 'drawer' }, global })
    expect(split.find('.cmp-drawer__btn--edge').attributes('aria-pressed')).toBe('false')
    expect(drawer.find('.cmp-drawer__btn--edge').attributes('aria-pressed')).toBe('true')
  })
})

describe('ComparisonDrawerHead', () => {
  it('affiche les 8 puces quand le rapport est prêt', () => {
    const w = mount(ComparisonDrawerHead, { props: { runtime: fakeRuntime() }, global })
    expect(w.findAll('.cks__chip')).toHaveLength(8)
    expect(w.findAll('.delta-pill')).toHaveLength(8)
    expect(w.text()).not.toContain('undefined')
    expect(w.text()).not.toContain('NaN')
  })
  it('affiche le squelette hors état ready', () => {
    const rt = fakeRuntime()
    rt.state.value = 'loading'
    const w = mount(ComparisonDrawerHead, { props: { runtime: rt }, global })
    expect(w.find('.cks__skel').exists()).toBe(true)
  })
})
