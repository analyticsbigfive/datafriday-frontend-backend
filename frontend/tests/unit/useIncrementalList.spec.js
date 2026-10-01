// BUG-390-02 : rendu progressif de la vue « Par article » d'Event Predict.
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useIncrementalList, DEFAULT_PAGE_SIZE } from '@/composables/useIncrementalList'

function installFakeObserver() {
  const instances = []
  class FakeObserver {
    constructor(cb, opts) {
      this.cb = cb
      this.opts = opts
      this.targets = new Set()
      this.disconnected = false
      instances.push(this)
    }
    observe(el) { this.targets.add(el) }
    unobserve(el) { this.targets.delete(el) }
    disconnect() { this.targets.clear(); this.disconnected = true }
    fire(isIntersecting) {
      this.cb([...this.targets].map((target) => ({ target, isIntersecting })))
    }
  }
  window.IntersectionObserver = FakeObserver
  return instances
}

describe('useIncrementalList', () => {
  const original = window.IntersectionObserver
  afterEach(() => {
    if (original === undefined) delete window.IntersectionObserver
    else window.IntersectionObserver = original
  })

  it('démarre à 30 par défaut, +30 par lot, reset revient à 30', () => {
    const list = useIncrementalList()
    expect(DEFAULT_PAGE_SIZE).toBe(30)
    expect(list.visibleCount.value).toBe(30)
    list.showMore()
    expect(list.visibleCount.value).toBe(60)
    list.showMore()
    expect(list.visibleCount.value).toBe(90)
    list.reset()
    expect(list.visibleCount.value).toBe(30)
  })

  it('respecte une taille de lot personnalisée et rejette les valeurs invalides', () => {
    expect(useIncrementalList({ pageSize: 10 }).visibleCount.value).toBe(10)
    expect(useIncrementalList({ pageSize: 0 }).visibleCount.value).toBe(30)
    expect(useIncrementalList({ pageSize: 'x' }).visibleCount.value).toBe(30)
  })

  it('sans IntersectionObserver : aucun observer, la sentinelle sert de bouton', () => {
    delete window.IntersectionObserver
    const list = useIncrementalList()
    expect(list.observerSupported).toBe(false)
    const el = document.createElement('div')
    expect(() => list.setSentinel(el)).not.toThrow()
    // Rien ne charge tout seul : le compteur reste plafonné.
    expect(list.visibleCount.value).toBe(30)
    list.showMore()
    expect(list.visibleCount.value).toBe(60)
  })

  it('avec IntersectionObserver : sentinelle visible → lot suivant, puis ré-observation', async () => {
    const instances = installFakeObserver()
    const list = useIncrementalList({ pageSize: 30 })
    expect(list.observerSupported).toBe(true)
    const el = document.createElement('div')
    list.setSentinel(el)
    expect(instances).toHaveLength(1)
    const obs = instances[0]
    expect(obs.targets.has(el)).toBe(true)

    obs.fire(false)
    expect(list.visibleCount.value).toBe(30)
    obs.fire(true)
    expect(list.visibleCount.value).toBe(60)
    await nextTick()
    // Ré-observée pour obtenir une nouvelle mesure (sentinelle encore visible).
    expect(obs.targets.has(el)).toBe(true)

    // Démontage de la sentinelle (ref à null) → observer coupé.
    list.setSentinel(null)
    expect(obs.disconnected).toBe(true)
  })

  it('se déconnecte au démontage du composant hôte', async () => {
    const instances = installFakeObserver()
    const Host = defineComponent({
      setup() {
        const list = useIncrementalList()
        return () => h('div', [h('div', { ref: list.setSentinel, class: 'sentinel' })])
      },
    })
    const w = mount(Host)
    await nextTick()
    expect(instances).toHaveLength(1)
    w.unmount()
    expect(instances[0].disconnected).toBe(true)
  })
})
