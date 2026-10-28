/**
 * useReportJ1Placement : orchestration du « + Ajouter au rapport J+1 » dans Analyse.
 * AnalyseView l'appelle UNE fois (`provideReportJ1Placement`) et monte le drawer ; les boutons
 * « + » des composants enfants retrouvent l'instance par `injectReportJ1Placement`.
 * Au clic sur « + » : snapshot des filtres du moment, ouverture du drawer, rechargement du layout.
 * Au clic sur une case libre : placeSlot, sauvegarde, notification.
 */
import { ref, computed, provide, inject } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useReportJ1Layout } from '@/composables/useReportJ1Layout'
import { placeSlot, removeSlot, cellStates } from '@/utils/reportJ1Grid'
import { buildFilterSnapshot, describeFilters } from '@/utils/reportJ1FilterSnapshot'
import { sizeOf } from '@/utils/reportJ1Page2Catalog'

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

  const size = computed(() => (pending.value ? sizeOf(pending.value.kind) : null))
  const cells = computed(() => (pending.value ? cellStates(layoutApi.layout.value, pending.value.kind) : []))
  const filtersSummary = computed(() => (pending.value ? describeFilters(pending.value.filters, t) : ''))

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
  }

  function close() {
    open.value = false
    pending.value = null
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
      next = placeSlot(layoutApi.layout.value, slot)
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

  async function remove(slotId) {
    if (layoutApi.saving.value) return
    const res = await layoutApi.save(removeSlot(layoutApi.layout.value, slotId))
    if (res.ok) notify(t('rj1RemovedOk'), 'success')
    else if (res.conflict) notify(t('rj1Conflict'), 'warning')
    else notify(t('rj1SaveError'), 'error')
  }

  return {
    open, pending, size, cells, filtersSummary,
    layout: layoutApi.layout, loading: layoutApi.loading, saving: layoutApi.saving, loadError: layoutApi.error,
    request, close, place, remove,
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
