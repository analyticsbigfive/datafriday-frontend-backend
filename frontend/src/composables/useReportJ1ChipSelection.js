/**
 * useReportJ1ChipSelection : mode « choisir les pastilles » du « + » des barres KPI (barre du haut
 * et barre de widgets) du rapport J+1. Au clic sur le « + », les pastilles de la barre vibrent ;
 * un clic sur une pastille la sélectionne (elle cesse de vibrer). La validation ouvre le drawer de
 * placement avec les pastilles choisies (option `items`).
 * AnalyseView l'appelle UNE fois (`provideReportJ1ChipSelection`) ; les pastilles et le bouton
 * « + » la retrouvent par `injectReportJ1ChipSelection`.
 */
import { ref, computed, provide, inject, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { serializeChipKeys, parseChipKeys } from '@/utils/reportJ1Chips'
import '@/styles/reportJ1Selection.css'

const KEY = Symbol('reportJ1ChipSelection')

/** @param {{ placement: { request: Function }, notify?: (text: string, color?: string) => void }} opts */
export function useReportJ1ChipSelection({ placement, notify = () => {} }) {
  const { t } = useI18n()
  const store = useStore()
  const activeKind = ref(null)
  const picked = ref([])

  const isActive = (kind) => activeKind.value === kind
  const isPicked = (kind, key) => isActive(kind) && picked.value.includes(key)
  const canConfirm = computed(() => !!activeKind.value && picked.value.length > 0)

  function start(kind, hint = true) {
    activeKind.value = kind
    picked.value = []
    if (hint) notify(t('rj1SelectHint'), 'info')
  }

  function cancel() {
    activeKind.value = null
    picked.value = []
  }

  function toggle(kind, key) {
    // Une pastille d'une autre barre (ex. MARGE dans la bande mobile fusionnée) est ignorée.
    if (!isActive(kind) || !parseChipKeys(kind, key).length) return
    picked.value = picked.value.includes(key) ? picked.value.filter((k) => k !== key) : [...picked.value, key]
  }

  /** Ouvre le drawer de placement avec la sélection, puis quitte le mode. */
  function confirm(label) {
    if (!canConfirm.value) return
    const kind = activeKind.value
    const items = serializeChipKeys(kind, picked.value)
    cancel()
    placement.request({ kind, label, options: { items } })
  }

  // Le « + » disparaît en Comparaison et en Predict : on quitte alors le mode, sinon les pastilles
  // continueraient de vibrer sans moyen de valider.
  watch(
    () => [store.state.analyse?.filters?.comparisonMode, store.state.analyse?.selectedToolbox],
    ([comparison, toolbox]) => { if (comparison || toolbox === 'predict') cancel() },
  )

  const onKey = (e) => { if (e.key === 'Escape' && activeKind.value) cancel() }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

  return { activeKind, picked, canConfirm, isActive, isPicked, start, cancel, toggle, confirm }
}

export function provideReportJ1ChipSelection(opts) {
  const instance = useReportJ1ChipSelection(opts)
  provide(KEY, instance)
  return instance
}

/** Null hors AnalyseView : les pastilles gardent alors leur comportement normal. */
export function injectReportJ1ChipSelection() {
  return inject(KEY, null)
}
