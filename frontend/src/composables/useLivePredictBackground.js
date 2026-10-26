// Fond prédit du Live : charge la version Event Predict PAR DÉFAUT de l'événement en cours
// et expose sa courbe par minute pour EventTimelineChart (backgroundTimelineData).
//
// Discret par conception : sans droit CA, sans version par défaut, sans courbe (versions
// sauvegardées avant la colonne predictedTimeline) ou sur erreur, `rows` reste vide et le
// graphique se comporte exactement comme avant. Aucune erreur n'est remontée à l'écran.

import { ref, watch, computed } from 'vue'
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import { hasPredictedTimeline, snapshotToBackgroundRows } from '@/utils/predictedTimelineSnapshot'

/**
 * @param {import('vue').Ref<string>} eventId  événement live courant
 * @param {import('vue').Ref<boolean>} enabled droit stats.financial.view
 */
export function useLivePredictBackground(eventId, enabled) {
  const version = ref(null)
  let token = 0

  async function load(id) {
    const mine = ++token
    version.value = null
    if (!id || !enabled.value) return
    try {
      const list = await listEventPredictVersions(id)
      if (mine !== token) return
      const def = Array.isArray(list) ? list.find((v) => v.isDefault) : null
      version.value = def && hasPredictedTimeline(def.predictedTimeline) ? def : null
    } catch (_) {
      if (mine === token) version.value = null
    }
  }

  watch([eventId, enabled], () => load(eventId.value), { immediate: true })

  const rows = computed(() => snapshotToBackgroundRows(version.value?.predictedTimeline))
  const label = computed(() => version.value?.name || '')
  // Snapshot brut : le Live l'utilise aussi pour la cadence de vente (colonne Prévu restant).
  const timeline = computed(() => version.value?.predictedTimeline || null)
  return { rows, label, timeline }
}
