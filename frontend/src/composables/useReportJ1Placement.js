/**
 * useReportJ1Placement : orchestration du « + Ajouter au rapport J+1 » dans Analyse.
 * AnalyseView l'appelle UNE fois (`provideReportJ1Placement`) et monte le drawer ; les boutons
 * « + » des composants enfants retrouvent l'instance par `injectReportJ1Placement`.
 * Au clic sur « + » : snapshot des filtres du moment, ouverture du drawer, rechargement du layout.
 * Au clic sur une case libre : placement dans la page affichée, sauvegarde, notification.
 * Pages : jusqu'à 4 pages de sélection (page 2 du rapport + 3), ajout / suppression / renommage ici.
 */
import { ref, computed, provide, inject } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useReportJ1Layout } from '@/composables/useReportJ1Layout'
import { cellStates } from '@/utils/reportJ1Grid'
import {
  pageAt, placeInPage, removeSlotEverywhere, renameSlot, addPage, removePageAt, pageCount,
} from '@/utils/reportJ1Pages'
import { buildFilterSnapshot, describeFilters } from '@/utils/reportJ1FilterSnapshot'
import { sizeOf } from '@/utils/reportJ1Page2Catalog'
import { describeChips } from '@/utils/reportJ1Chips'

const KEY = Symbol('reportJ1Placement')

function newId() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {{ spaceId: import('vue').Ref<string|null>, notify?: (text: string, color?: string) => void }} opts
 */
export function useReportJ1Placement({ spaceId, notify = () => {} }) {
  const store = useStore()
  const { t } = useI18n()
  const layoutApi = useReportJ1Layout(spaceId)

  const open = ref(false)
  const pending = ref(null) // { kind, variant, label, options, filters }
  const pageIndex = ref(0) // page de sélection affichée dans le drawer (0 = page 2 du rapport)

  const page = computed(() => pageAt(layoutApi.layout.value, pageIndex.value))
  const pageTotal = computed(() => pageCount(layoutApi.layout.value))
  const size = computed(() => (pending.value ? sizeOf(pending.value.kind) : null))
  const cells = computed(() => (pending.value ? cellStates(pageAt(layoutApi.layout.value, pageIndex.value), pending.value.kind) : []))
  const filtersSummary = computed(() => (pending.value ? describeFilters(pending.value.filters, t) : ''))

  // Pastilles choisies d'une barre KPI, en clair ; vide pour les autres éléments.
  const chipsSummary = computed(() => (pending.value ? describeChips(pending.value.kind, pending.value.options?.items, t) : ''))

  /** Titre personnalisé de l'élément à ajouter (vide = titre par défaut). */
  function setPendingLabel(label) {
    if (pending.value) pending.value = { ...pending.value, label: String(label ?? '').trim().slice(0, 120) }
  }

  async function request(intent) {
    pending.value = {
      kind: intent.kind,
      variant: intent.variant || null,
      label: intent.label || '',
      options: intent.options || null,
      filters: buildFilterSnapshot(store.state.analyse.filters),
    }
    open.value = true
    await layoutApi.load()
    pageIndex.value = Math.min(pageIndex.value, pageCount(layoutApi.layout.value) - 1)
  }

  function close() {
    open.value = false
    pending.value = null
    pageIndex.value = 0
  }

  async function place(col, row) {
    const p = pending.value
    if (!p || layoutApi.saving.value) return
    const slot = {
      id: newId(),
      kind: p.kind,
      variant: p.variant,
      col,
      row,
      filters: p.filters,
      options: p.options || {},
      label: p.label,
      addedAt: new Date().toISOString(),
      addedBy: store.getters['auth/userId'] || null,
    }
    let next
    try {
      next = placeInPage(layoutApi.layout.value, pageIndex.value, slot)
    } catch (e) {
      notify(t('rj1PlaceUnavailable'), 'warning')
      return
    }
    const res = await layoutApi.save(next)
    if (res.ok) {
      notify(t('rj1PlacedOk'), 'success')
      close()
    } else if (res.conflict) {
      notify(t('rj1Conflict'), 'warning')
    } else {
      notify(t('rj1SaveError'), 'error')
    }
  }

  /** Sauvegarde un layout modifié et notifie ; `okKey` = message de succès (aucun si null). */
  async function commit(next, okKey) {
    if (layoutApi.saving.value) return false
    const res = await layoutApi.save(next)
    if (res.ok) {
      if (okKey) notify(t(okKey), 'success')
    } else if (res.conflict) notify(t('rj1Conflict'), 'warning')
    else notify(t('rj1SaveError'), 'error')
    return res.ok
  }

  const remove = (slotId) => commit(removeSlotEverywhere(layoutApi.layout.value, slotId), 'rj1RemovedOk')
  const rename = (slotId, label) => commit(renameSlot(layoutApi.layout.value, slotId, label), null)

  async function createPage() {
    const next = addPage(layoutApi.layout.value)
    if (next.pages.length === pageCount(layoutApi.layout.value)) return
    if (await commit(next, null)) pageIndex.value = next.pages.length - 1
  }

  async function deletePage(index) {
    const ok = await commit(removePageAt(layoutApi.layout.value, index), 'rj1PageRemovedOk')
    if (ok) pageIndex.value = Math.min(pageIndex.value, pageCount(layoutApi.layout.value) - 1)
  }

  function selectPage(index) {
    if (index >= 0 && index < pageCount(layoutApi.layout.value)) pageIndex.value = index
  }

  return {
    open, pending, size, cells, filtersSummary, chipsSummary, pageIndex, page, pageTotal,
    layout: layoutApi.layout, loading: layoutApi.loading, saving: layoutApi.saving, loadError: layoutApi.error,
    request, close, setPendingLabel, place, remove, rename, createPage, deletePage, selectPage,
  }
}

/** À appeler une fois dans AnalyseView : crée l'instance et la fournit aux boutons « + ». */
export function provideReportJ1Placement(opts) {
  const instance = useReportJ1Placement(opts)
  provide(KEY, instance)
  return instance
}

/** Dans un bouton « + » : null hors AnalyseView (le bouton se masque alors). */
export function injectReportJ1Placement() {
  return inject(KEY, null)
}
