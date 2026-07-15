import { ref } from 'vue'
import { synchronize, getJobProgress } from '@/api/endpoints/aggregation.api'

export function useSynchronization() {
  const phase = ref(0) // 0=idle, 1=cleanup, 2=processing, 3=aggregating, 4=summaries
  const phaseLabel = ref('')
  const progress = ref(0)
  const result = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const jobId = ref(null)

  const phases = [
    { id: 0, label: 'En attente' },
    { id: 1, label: 'Nettoyage des anciennes données' },
    { id: 2, label: 'Calcul par événement' },
    { id: 3, label: 'Agrégation des données' },
    { id: 4, label: 'Calcul des résumés' },
  ]

  async function startSync(spaceId, integrationId) {
    loading.value = true
    error.value = null
    result.value = null
    phase.value = 1
    phaseLabel.value = phases[1].label
    progress.value = 0

    try {
      // Phase 1-4 done server-side in one call
      phase.value = 2
      phaseLabel.value = phases[2].label

      const syncResult = await synchronize(spaceId, integrationId)

      // Done
      phase.value = 4
      phaseLabel.value = 'Terminé'
      progress.value = 100
      result.value = syncResult
      jobId.value = syncResult.jobId

      return syncResult
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function checkProgress() {
    if (!jobId.value) return null
    try {
      return await getJobProgress(jobId.value)
    } catch (err) {
      console.error('[useSynchronization] checkProgress error:', err)
      return null
    }
  }

  function reset() {
    phase.value = 0
    phaseLabel.value = ''
    progress.value = 0
    result.value = null
    error.value = null
    jobId.value = null
    loading.value = false
  }

  return {
    phase,
    phaseLabel,
    phases,
    progress,
    result,
    loading,
    error,
    jobId,
    startSync,
    checkProgress,
    reset,
  }
}
