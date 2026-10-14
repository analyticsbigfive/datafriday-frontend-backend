/**
 * Version mobile du drawer Comparaison : sélecteur Principal | Comparaison, ComparisonDrawer en
 * mode mobile (dialog, hors écran sans démontage, piège de focus), entrée du menu ⋮.
 */
jest.mock('@/store', () => ({ __esModule: true, default: { state: {}, getters: {} } }))
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { globalMountOptions } from './helpers/comparisonFixtures'
import ComparisonMobileSwitch from '@/components/space-workspace/analyse/comparison/ComparisonMobileSwitch.vue'
import ComparisonMenuItem from '@/components/space-workspace/analyse/comparison/ComparisonMenuItem.vue'
import ComparisonDrawer from '@/components/space-workspace/analyse/comparison/ComparisonDrawer.vue'

const global = globalMountOptions()

describe('ComparisonMobileSwitch', () => {
  it('rend un groupe de deux boutons avec aria-pressed', () => {
    const w = mount(ComparisonMobileSwitch, { props: { modelValue: 'cmp' }, global })
    expect(w.attributes('role')).toBe('group')
    expect(w.attributes('aria-label')).toBeTruthy()
    const btns = w.findAll('button')
    expect(btns).toHaveLength(2)
    expect(btns[0].attributes('aria-pressed')).toBe('false')
    expect(btns[1].attributes('aria-pressed')).toBe('true')
    expect(btns[0].text()).toBe('Principal')
    expect(btns[1].text()).toBe('Comparaison')
  })
  it('émet update:modelValue seulement au changement', async () => {
    const w = mount(ComparisonMobileSwitch, { props: { modelValue: 'cmp' }, global })
    await w.findAll('button')[1].trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    await w.findAll('button')[0].trigger('click')
    expect(w.emitted('update:modelValue')[0]).toEqual(['main'])
  })
  it('met le focus sur le bouton actif quand il devient visible', async () => {
    const w = mount(ComparisonMobileSwitch, { props: { modelValue: 'main', shown: false }, global, attachTo: document.body })
    await w.setProps({ shown: true })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(w.findAll('button')[0].element)
    w.unmount()
  })
})

describe('ComparisonMenuItem', () => {
  it('affiche le libellé avec l\'icône et émet open au clic', async () => {
    const w = mount(ComparisonMenuItem, { global })
    expect(w.text()).toContain('Comparaison')
    expect(w.html()).toContain('mdi-compare')
    expect(w.attributes('aria-label')).toBeTruthy()
    await w.trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
  })
})

describe('ComparisonDrawer mobile', () => {
  const mountMobile = (props = {}, opts = {}) =>
    mount(ComparisonDrawer, {
      props: { mobile: true, mobileView: 'cmp', ...props },
      slots: { default: '<button class="a">a</button><button class="b">b</button>' },
      global,
      attachTo: document.body,
      ...opts,
    })

  it('est un dialog modal avec sélecteur, sans bouton d\'extension ni titre', () => {
    const w = mountMobile()
    expect(w.attributes('role')).toBe('dialog')
    expect(w.attributes('aria-modal')).toBe('true')
    expect(w.classes()).toContain('cmp-drawer--mobile')
    expect(w.findComponent(ComparisonMobileSwitch).exists()).toBe(true)
    expect(w.find('.cmp-drawer__btn--edge').exists()).toBe(false)
    expect(w.find('h2').exists()).toBe(false)
    expect(w.find('.cmp-drawer__btn--close').exists()).toBe(true)
    w.unmount()
  })
  it('bureau : inchangé (complementary, pas de sélecteur, extension présente)', () => {
    const w = mount(ComparisonDrawer, { global })
    expect(w.attributes('role')).toBe('complementary')
    expect(w.attributes('aria-modal')).toBeUndefined()
    expect(w.findComponent(ComparisonMobileSwitch).exists()).toBe(false)
    expect(w.find('.cmp-drawer__btn--edge').exists()).toBe(true)
    expect(w.classes()).not.toContain('cmp-drawer--mobile')
  })
  it('en vue main : hors écran, inerte, contenu conservé dans le DOM', async () => {
    const w = mountMobile()
    expect(w.classes()).not.toContain('cmp-drawer--away')
    await w.setProps({ mobileView: 'main' })
    expect(w.classes()).toContain('cmp-drawer--away')
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.attributes('inert')).toBeDefined()
    expect(w.find('.a').exists()).toBe(true)
    await w.setProps({ mobileView: 'cmp' })
    expect(w.classes()).not.toContain('cmp-drawer--away')
    expect(w.attributes('inert')).toBeUndefined()
    w.unmount()
  })
  it('relaie le choix du sélecteur et ferme par Échap', async () => {
    const w = mountMobile()
    await w.findAll('.cms__btn')[0].trigger('click')
    expect(w.emitted('update:mobileView')[0]).toEqual(['main'])
    await w.trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
  it('en reportMode : la bande head passe sous le sélecteur, hors du header', () => {
    const w = mountMobile({ reportMode: true }, { slots: { head: '<div class="my-head">puces</div>' } })
    expect(w.find('.cmp-drawer__head .my-head').exists()).toBe(false)
    expect(w.find('.cmp-drawer__headrow .my-head').exists()).toBe(true)
    w.unmount()
  })
  it('piège de focus : Tab sur le dernier élément revient au premier, Maj+Tab inverse', async () => {
    const w = mountMobile()
    await new Promise((r) => setTimeout(r, 0)) // le focus initial du drawer est pris au tick suivant
    const first = w.find('.cmp-drawer__btn--close').element
    const last = w.find('.b').element
    last.focus()
    await w.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    first.focus()
    await w.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    w.unmount()
  })
  it('rend le focus à l\'élément d\'ouverture au démontage', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    btn.focus()
    const w = mountMobile()
    w.unmount()
    expect(document.activeElement).toBe(btn)
    btn.remove()
  })
})
