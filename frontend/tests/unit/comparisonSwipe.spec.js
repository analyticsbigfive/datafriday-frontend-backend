import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { resolveSwipe, isInHorizontalScroller, SWIPE_MIN_DISTANCE } from '@/utils/comparisonSwipe'
import { useComparisonSwipe } from '@/composables/useComparisonSwipe'

describe('resolveSwipe', () => {
  it('gauche = cmp, droite = main', () => {
    expect(resolveSwipe({ dx: -120, dy: 10, current: 'main' })).toBe('cmp')
    expect(resolveSwipe({ dx: 120, dy: -10, current: 'cmp' })).toBe('main')
  })
  it('ignore sous le seuil de 70 px (bornes comprises)', () => {
    expect(resolveSwipe({ dx: -69, dy: 0, current: 'main' })).toBeNull()
    expect(resolveSwipe({ dx: -SWIPE_MIN_DISTANCE, dy: 0, current: 'main' })).toBe('cmp')
    expect(resolveSwipe({ dx: 0, dy: 0 })).toBeNull()
  })
  it('exige un geste nettement horizontal (|dx| > 1,5 x |dy|)', () => {
    expect(resolveSwipe({ dx: -100, dy: 70, current: 'main' })).toBeNull()
    expect(resolveSwipe({ dx: -150, dy: 100, current: 'main' })).toBeNull()
    expect(resolveSwipe({ dx: -151, dy: 100, current: 'main' })).toBe('cmp')
  })
  it('ignore un geste démarré dans une zone qui défile', () => {
    expect(resolveSwipe({ dx: -200, dy: 0, startedInScrollable: true, current: 'main' })).toBeNull()
  })
  it('sans effet quand l écran cible est déjà affiché', () => {
    expect(resolveSwipe({ dx: -200, dy: 0, current: 'cmp' })).toBeNull()
    expect(resolveSwipe({ dx: 200, dy: 0, current: 'main' })).toBeNull()
  })
  it('refuse les valeurs invalides', () => {
    expect(resolveSwipe({ dx: NaN, dy: 0 })).toBeNull()
    expect(resolveSwipe({ dx: 'a', dy: 0 })).toBeNull()
    expect(resolveSwipe()).toBeNull()
  })
})

describe('isInHorizontalScroller', () => {
  function scroller(style, scrollWidth, clientWidth) {
    const el = document.createElement('div')
    el.style.overflowX = style
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
    return el
  }
  it('remonte le DOM et détecte un overflow-x qui défile', () => {
    const root = document.createElement('div')
    const strip = scroller('auto', 500, 200)
    const child = document.createElement('span')
    strip.appendChild(child)
    root.appendChild(strip)
    expect(isInHorizontalScroller(child, root)).toBe(true)
  })
  it('ignore un overflow-x sans contenu plus large', () => {
    const strip = scroller('auto', 200, 200)
    const child = document.createElement('span')
    strip.appendChild(child)
    expect(isInHorizontalScroller(child)).toBe(false)
  })
  it('ignore overflow hidden / visible', () => {
    const el = scroller('hidden', 500, 200)
    const child = document.createElement('span')
    el.appendChild(child)
    expect(isInHorizontalScroller(child)).toBe(false)
  })
  it('un canvas est toujours verrouillé', () => {
    const c = document.createElement('canvas')
    document.createElement('div').appendChild(c)
    expect(isInHorizontalScroller(c)).toBe(true)
  })
  it('data-swipe-lock verrouille la zone', () => {
    const el = document.createElement('div')
    el.setAttribute('data-swipe-lock', '')
    const child = document.createElement('i')
    el.appendChild(child)
    expect(isInHorizontalScroller(child)).toBe(true)
  })
  it('s arrête à la racine (racine exclue) et accepte null / un noeud texte', () => {
    const root = scroller('auto', 900, 100)
    const child = document.createElement('span')
    root.appendChild(child)
    expect(isInHorizontalScroller(child, root)).toBe(false)
    expect(isInHorizontalScroller(null)).toBe(false)
    const txt = document.createTextNode('x')
    root.appendChild(txt)
    expect(isInHorizontalScroller(txt)).toBe(true)
  })
})

describe('useComparisonSwipe', () => {
  function touch(el, type, x, y) {
    const ev = new Event(type, { bubbles: true })
    const pt = { clientX: x, clientY: y }
    ev.touches = type === 'touchend' ? [] : [pt]
    ev.changedTouches = [pt]
    el.dispatchEvent(ev)
  }
  function setup(over = {}) {
    const setMobileView = jest.fn()
    const open = ref(true)
    const isMobile = ref(true)
    const mobileView = ref('main')
    const Host = {
      template: '<div ref="root"><span class="in"></span></div>',
      setup() {
        const root = ref(null)
        useComparisonSwipe({ target: root, open, isMobile, mobileView, setMobileView })
        return { root }
      },
    }
    const w = mount(Host, { attachTo: document.body })
    return { w, setMobileView, open, isMobile, mobileView, ...over }
  }

  it('appelle setMobileView sur un swipe valide', async () => {
    const { w, setMobileView } = setup()
    await nextTick()
    const el = w.element.querySelector('.in')
    touch(el, 'touchstart', 300, 100)
    touch(el, 'touchend', 150, 110)
    expect(setMobileView).toHaveBeenCalledWith('cmp')
    w.unmount()
  })
  it('ne fait rien drawer fermé ou écran non mobile', async () => {
    const { w, setMobileView, open, isMobile } = setup()
    await nextTick()
    const el = w.element.querySelector('.in')
    open.value = false
    touch(el, 'touchstart', 300, 100)
    touch(el, 'touchend', 100, 100)
    open.value = true
    isMobile.value = false
    touch(el, 'touchstart', 300, 100)
    touch(el, 'touchend', 100, 100)
    expect(setMobileView).not.toHaveBeenCalled()
    w.unmount()
  })
  it('va vers main depuis cmp et ignore un toucher à deux doigts', async () => {
    const { w, setMobileView, mobileView } = setup()
    await nextTick()
    const el = w.element.querySelector('.in')
    mobileView.value = 'cmp'
    touch(el, 'touchstart', 100, 100)
    touch(el, 'touchend', 260, 100)
    expect(setMobileView).toHaveBeenCalledWith('main')
    setMobileView.mockClear()
    const ev = new Event('touchstart', { bubbles: true })
    ev.touches = [{ clientX: 1, clientY: 1 }, { clientX: 2, clientY: 2 }]
    el.dispatchEvent(ev)
    touch(el, 'touchend', 400, 1)
    expect(setMobileView).not.toHaveBeenCalled()
    w.unmount()
  })
  it('ignore un geste démarré sur un canvas', async () => {
    const { w, setMobileView } = setup()
    await nextTick()
    const cv = document.createElement('canvas')
    w.element.appendChild(cv)
    touch(cv, 'touchstart', 300, 100)
    touch(cv, 'touchend', 100, 100)
    expect(setMobileView).not.toHaveBeenCalled()
    w.unmount()
  })
  it('retire les écouteurs au démontage', async () => {
    const { w, setMobileView } = setup()
    await nextTick()
    const root = w.element
    w.unmount()
    touch(root, 'touchstart', 300, 100)
    touch(root, 'touchend', 100, 100)
    expect(setMobileView).not.toHaveBeenCalled()
  })
})
