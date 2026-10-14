/**
 * useComparisonDrawer : état et disposition du drawer Comparaison (desktop).
 *
 * Logique PURE (aucun accès au DOM hors `onGridTransitionEnd`), aucun stockage navigateur.
 * - `open` : drawer ouvert ou non.
 * - `layout` : 'split' (50/50), 'drawer' (drawer élargi) ou 'main' (principal élargi).
 * - `view` : contenu du drawer, 'form' | 'loading' | 'ready' | 'error' (les étapes suivantes
 *   pilotent ces valeurs via les setters).
 * - `mobileView` : écran affiché sur mobile, 'main' | 'cmp'. Ouvrir le drawer met 'cmp', le fermer
 *   remet 'main'. Sur bureau la valeur n'est pas lue (elle reste 'cmp' tant que le drawer est
 *   ouvert, ce qui fait que le passage bureau -> mobile arrive directement sur la comparaison).
 * - `applied` : modèle de comparaison appliqué (copie profonde), `run(model)` l'enregistre et
 *   passe en 'loading', `backToReport()` repasse en 'ready' si `applied` existe.
 *
 * À l'ouverture, les panneaux gauche (filtres) et droit (résumé) sont mémorisés puis repliés ;
 * à la fermeture, l'état MÉMORISÉ est restauré (quoi qu'ait fait l'utilisateur entre-temps)
 * et la session de comparaison est vidée (le principal retrouve Précédent / N-1).
 */
import { ref, shallowRef, computed, getCurrentScope, onScopeDispose } from 'vue'
import { clearComparisonSession } from '@/composables/useComparisonSession'

export const COMPARISON_LAYOUTS = ['split', 'drawer', 'main']
export const COMPARISON_VIEWS = ['form', 'loading', 'ready', 'error']
// Mobile : jamais les deux écrans ensemble, 'main' (rapport principal) ou 'cmp' (drawer).
export const COMPARISON_MOBILE_VIEWS = ['main', 'cmp']

/**
 * @param {{ leftOpen: import('vue').Ref<boolean>, summaryOpen: import('vue').Ref<boolean> }} panels
 *   refs des deux panneaux latéraux d'AnalyseView (`drawer` et `summaryDrawer`).
 */
export function useComparisonDrawer({ leftOpen, summaryOpen } = {}) {
  const open = ref(false)
  const layout = ref('split')
  const view = ref('form')
  const mobileView = ref('main')
  // Modèle de comparaison appliqué (copie profonde du formulaire au clic sur « Comparer »).
  // null tant qu'aucune comparaison n'a été lancée. Source de la saisie de useComparisonReport.
  const applied = shallowRef(null)

  // Valeurs d'avant l'ouverture (null = rien à restaurer).
  let remembered = null

  function openDrawer() {
    if (open.value) return
    remembered = {
      left: leftOpen ? !!leftOpen.value : false,
      summary: summaryOpen ? !!summaryOpen.value : false,
    }
    if (leftOpen) leftOpen.value = false
    if (summaryOpen) summaryOpen.value = false
    layout.value = 'split'
    mobileView.value = 'cmp'
    open.value = true
  }

  function closeDrawer() {
    if (!open.value) return
    open.value = false
    layout.value = 'split'
    mobileView.value = 'main'
    // Un chargement interrompu ne doit pas rester affiché à la prochaine ouverture.
    if (view.value === 'loading') view.value = 'form'
    if (remembered) {
      if (leftOpen) leftOpen.value = remembered.left
      if (summaryOpen) summaryOpen.value = remembered.summary
      remembered = null
    }
    clearComparisonSession()
  }

  function toggleExpandDrawer() {
    layout.value = layout.value === 'drawer' ? 'split' : 'drawer'
  }

  function toggleExpandMain() {
    layout.value = layout.value === 'main' ? 'split' : 'main'
  }

  function setView(next) {
    if (COMPARISON_VIEWS.includes(next)) view.value = next
  }
  /** Écran mobile affiché ('main' | 'cmp'). Sans effet drawer fermé ou valeur inconnue. */
  function setMobileView(next) {
    if (!open.value) return
    if (COMPARISON_MOBILE_VIEWS.includes(next)) mobileView.value = next
  }
  /** Lance la comparaison : copie le modèle (jamais partagé avec le brouillon) et passe en chargement. */
  function run(model) {
    if (!model || typeof model !== 'object') return
    applied.value = JSON.parse(JSON.stringify(model))
    view.value = 'loading'
  }

  /** « Retour au rapport » : revient au rapport s'il existe (sinon ne fait rien). */
  function backToReport() {
    if (applied.value) view.value = 'ready'
  }

  const showForm = () => setView('form')
  const showLoading = () => setView('loading')
  const showReady = () => setView('ready')
  const showError = () => setView('error')

  // Classes à poser sur la grille .an-body : vides quand le drawer est fermé.
  const gridClasses = computed(() => (open.value ? ['has-d', `lay-${layout.value}`] : []))

  /**
   * À brancher sur @transitionend de la grille. En fin de transition de grid-template-columns,
   * demande aux graphiques de se redimensionner. Chart.js 4 observe déjà son conteneur
   * (ResizeObserver) ; l'évènement window `resize` est un filet de sécurité sans effet de bord.
   */
  function onGridTransitionEnd(event) {
    if (event && event.target !== event.currentTarget) return
    if (event && event.propertyName !== 'grid-template-columns') return
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'))
  }

  // Si la page est démontée drawer ouvert, la session ne doit pas rester verrouillée.
  if (getCurrentScope()) onScopeDispose(() => clearComparisonSession())

  return {
    open,
    layout,
    view,
    mobileView,
    setMobileView,
    applied,
    run,
    backToReport,
    gridClasses,
    openDrawer,
    closeDrawer,
    toggleExpandDrawer,
    toggleExpandMain,
    setView,
    showForm,
    showLoading,
    showReady,
    showError,
    onGridTransitionEnd,
  }
}
