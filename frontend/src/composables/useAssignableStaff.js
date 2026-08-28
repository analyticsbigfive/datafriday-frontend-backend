// src/composables/useAssignableStaff.js
// Logisticiens assignables à une tâche pour un espace donné (dropdown "Attribuer à"
// du drawer Restocker) — déjà triés côté serveur par nombre croissant de tâches en
// cours (backend/src/features/logistic-tasks/logistic-tasks.service.ts::listAssignableStaff).

import { ref } from 'vue'
import { getAssignableStaff } from '@/api/endpoints/logistic-tasks.api'

export function useAssignableStaff() {
  const staff = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchStaff(spaceId) {
    if (!spaceId) return
    loading.value = true
    error.value = null
    try {
      staff.value = (await getAssignableStaff(spaceId)) || []
    } catch (e) {
      error.value = e?.userMessage || e?.message || 'Impossible de charger les logisticiens.'
      staff.value = []
    } finally {
      loading.value = false
    }
  }

  return { staff, loading, error, fetchStaff }
}
