import { ref, effectScope } from 'vue'
import { useComparisonDrawer } from '@/composables/useComparisonDrawer'
import { setMainDeltas, useComparisonSession } from '@/composables/useComparisonSession'

function make(left = true, summary = true) {
  const leftOpen = ref(left)
  const summaryOpen = ref(summary)
  return { leftOpen, summaryOpen, c: useComparisonDrawer({ leftOpen, summaryOpen }) }
}

describe('useComparisonDrawer', () => {
  afterEach(() => setMainDeltas(null))

  it('est fermé en split par défaut, sans classe de grille', () => {
    const { c } = make()
    expect(c.open.value).toBe(false)
    expect(c.layout.value).toBe('split')
    expect(c.view.value).toBe('form')
    expect(c.gridClasses.value).toEqual([])
  })

  it('ouvre : replie les deux panneaux et pose les classes', () => {
    const { c, leftOpen, summaryOpen } = make(true, true)
    c.openDrawer()
    expect(c.open.value).toBe(true)
    expect(leftOpen.value).toBe(false)
    expect(summaryOpen.value).toBe(false)
    expect(c.gridClasses.value).toEqual(['has-d', 'lay-split'])
  })

  it('restaure l état mémorisé à la fermeture, panneau par panneau', () => {
    const a = make(true, false)
    a.c.openDrawer()
    a.c.closeDrawer()
    expect(a.leftOpen.value).toBe(true)
    expect(a.summaryOpen.value).toBe(false)

    const b = make(false, true)
    b.c.openDrawer()
    b.c.closeDrawer()
    expect(b.leftOpen.value).toBe(false)
    expect(b.summaryOpen.value).toBe(true)
  })

  it('restaure l état d avant même si l utilisateur a rouvert un panneau entre-temps', () => {
    const { c, leftOpen, summaryOpen } = make(true, true)
    c.openDrawer()
    leftOpen.value = true
    summaryOpen.value = true
    c.closeDrawer()
    expect(leftOpen.value).toBe(true)
    expect(summaryOpen.value).toBe(true)

    const b = make(false, false)
    b.c.openDrawer()
    b.leftOpen.value = true
    b.c.closeDrawer()
    expect(b.leftOpen.value).toBe(false)
    expect(b.summaryOpen.value).toBe(false)
  })

  it('une double ouverture ne mémorise pas l état déjà replié', () => {
    const { c, leftOpen } = make(true, true)
    c.openDrawer()
    c.openDrawer()
    c.closeDrawer()
    expect(leftOpen.value).toBe(true)
  })

  it('fermer sans avoir ouvert ne touche à rien', () => {
    const { c, leftOpen } = make(true, true)
    c.closeDrawer()
    expect(leftOpen.value).toBe(true)
  })

  it('bascule les largeurs split <-> drawer et split <-> main', () => {
    const { c } = make()
    c.openDrawer()
    c.toggleExpandDrawer()
    expect(c.layout.value).toBe('drawer')
    expect(c.gridClasses.value).toEqual(['has-d', 'lay-drawer'])
    c.toggleExpandDrawer()
    expect(c.layout.value).toBe('split')
    c.toggleExpandMain()
    expect(c.layout.value).toBe('main')
    expect(c.gridClasses.value).toEqual(['has-d', 'lay-main'])
    c.toggleExpandMain()
    expect(c.layout.value).toBe('split')
  })

  it('passer de drawer à main puis revenir passe par le mode demandé', () => {
    const { c } = make()
    c.openDrawer()
    c.toggleExpandDrawer()
    c.toggleExpandMain()
    expect(c.layout.value).toBe('main')
  })

  it('la fermeture remet layout à split et vide la session de comparaison', () => {
    const { c } = make()
    c.openDrawer()
    c.toggleExpandMain()
    setMainDeltas({ chips: {}, widgets: {} })
    expect(useComparisonSession().isActive.value).toBe(true)
    c.closeDrawer()
    expect(c.open.value).toBe(false)
    expect(c.layout.value).toBe('split')
    expect(c.gridClasses.value).toEqual([])
    expect(useComparisonSession().isActive.value).toBe(false)
  })

  it('gère la vue du drawer et ignore les valeurs inconnues', () => {
    const { c } = make()
    c.showLoading()
    expect(c.view.value).toBe('loading')
    c.showReady()
    expect(c.view.value).toBe('ready')
    c.showError()
    expect(c.view.value).toBe('error')
    c.setView('nimporte')
    expect(c.view.value).toBe('error')
    c.showForm()
    expect(c.view.value).toBe('form')
  })

  it('un chargement interrompu par la fermeture revient au formulaire', () => {
    const { c } = make()
    c.openDrawer()
    c.showLoading()
    c.closeDrawer()
    expect(c.view.value).toBe('form')
  })

  it('un rapport prêt est conservé à la fermeture', () => {
    const { c } = make()
    c.openDrawer()
    c.showReady()
    c.closeDrawer()
    expect(c.view.value).toBe('ready')
  })

  it('transitionend : redimensionne seulement pour grid-template-columns sur la grille', () => {
    const { c } = make()
    const spy = jest.fn()
    window.addEventListener('resize', spy)
    const grid = {}
    c.onGridTransitionEnd({ target: grid, currentTarget: grid, propertyName: 'opacity' })
    c.onGridTransitionEnd({ target: {}, currentTarget: grid, propertyName: 'grid-template-columns' })
    expect(spy).not.toHaveBeenCalled()
    c.onGridTransitionEnd({ target: grid, currentTarget: grid, propertyName: 'grid-template-columns' })
    expect(spy).toHaveBeenCalledTimes(1)
    window.removeEventListener('resize', spy)
  })

  it('vide la session quand la portée est détruite', () => {
    const scope = effectScope()
    scope.run(() => make().c.openDrawer())
    setMainDeltas({ chips: {}, widgets: {} })
    scope.stop()
    expect(useComparisonSession().isActive.value).toBe(false)
  })
  it('run : copie profonde du modèle dans applied et passe en chargement', () => {
    const { c } = make()
    c.openDrawer()
    expect(c.applied.value).toBeNull()
    const model = { kind: 'event', eventIds: ['e1'], temperatureRange: [-10, 45] }
    c.run(model)
    expect(c.view.value).toBe('loading')
    expect(c.applied.value).toEqual(model)
    expect(c.applied.value).not.toBe(model)
    model.eventIds.push('e2')
    expect(c.applied.value.eventIds).toEqual(['e1'])
  })

  it('run ignore une valeur invalide', () => {
    const { c } = make()
    c.run(null)
    c.run('x')
    expect(c.view.value).toBe('form')
    expect(c.applied.value).toBeNull()
  })

  it('backToReport : sans comparaison appliquée ne change rien, sinon repasse en ready', () => {
    const { c } = make()
    c.backToReport()
    expect(c.view.value).toBe('form')
    c.run({ kind: 'period', period: 'prev' })
    c.showForm()
    c.backToReport()
    expect(c.view.value).toBe('ready')
  })

  it('applied survit à la fermeture (le formulaire peut y revenir)', () => {
    const { c } = make()
    c.openDrawer()
    c.run({ kind: 'predict' })
    c.showReady()
    c.closeDrawer()
    expect(c.applied.value).toEqual({ kind: 'predict' })
  })
})

describe('useComparisonDrawer : écran mobile', () => {
  it('ouvrir met cmp, fermer remet main', () => {
    const { c } = make()
    expect(c.mobileView.value).toBe('main')
    c.openDrawer()
    expect(c.mobileView.value).toBe('cmp')
    c.setMobileView('main')
    expect(c.mobileView.value).toBe('main')
    c.setMobileView('cmp')
    c.closeDrawer()
    expect(c.mobileView.value).toBe('main')
  })
  it('setMobileView ignore une valeur inconnue et le drawer fermé', () => {
    const { c } = make()
    c.setMobileView('cmp')
    expect(c.mobileView.value).toBe('main')
    c.openDrawer()
    c.setMobileView('nimporte')
    expect(c.mobileView.value).toBe('cmp')
  })
  it('rouvrir après un passage en main revient sur cmp', () => {
    const { c } = make()
    c.openDrawer()
    c.setMobileView('main')
    c.closeDrawer()
    c.openDrawer()
    expect(c.mobileView.value).toBe('cmp')
  })
})
