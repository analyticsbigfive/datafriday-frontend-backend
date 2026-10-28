/**
 * useReportJ1Layout : chargement et sauvegarde de la mise en page de la page 2 du rapport J+1
 * (une par espace, partagée). Verrou optimiste : `save` envoie la version lue ; sur 409 le
 * layout est rechargé et le résultat porte `conflict: true` (l'appelant notifie).
 */
import { ref } from 'vue'
import { getJ1Page2Layout, putJ1Page2Layout } from '@/api/endpoints/report-layout.api'
import { EMPTY_LAYOUT } from '@/utils/reportJ1Grid'

function normalize(payload) {
  const layout = payload?.layout && Array.isArray(payload.layout.slots) ? payload.layout : { ...EMPTY_LAYOUT, slots: [] }
  return { layout, version: Number(payload?.version) || 0 }
}

/** @param {import('vue').Ref<string|null>} spaceId */
export function useReportJ1Layout(spaceId) {
  const layout = ref({ ...EMPTY_LAYOUT, slots: [] })
  const version = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)

  function apply(payload) {
    const n = normalize(payload)
    layout.value = n.layout
    version.value = n.version
  }

  async function load() {
    if (!spaceId.value) return false
    loading.value = true
    error.value = null
    try {
      apply(await getJ1Page2Layout(spaceId.value))
      return true
    } catch (e) {
      error.value = e
      return false
    } finally {
      loading.value = false
    }
  }

  /** @returns {Promise<{ ok: boolean, conflict: boolean }>} */
  async function save(nextLayout) {
    if (!spaceId.value) return { ok: false, conflict: false }
    saving.value = true
    error.value = null
    try {
      apply(await putJ1Page2Layout(spaceId.value, { layout: nextLayout, version: version.value }))
      return { ok: true, conflict: false }
    } catch (e) {
      error.value = e
      const conflict = e?.response?.status === 409
      if (conflict) await load()
      return { ok: false, conflict }
    } finally {
      saving.value = false
    }
  }

  return { layout, version, loading, saving, error, load, save }
}
