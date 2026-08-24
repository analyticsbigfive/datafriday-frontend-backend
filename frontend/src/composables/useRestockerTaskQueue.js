// src/composables/useRestockerTaskQueue.js
// File d'attente locale "Tâches : N" du drawer Restocker (Live inventory) : accumule
// des lignes de transfert avant l'envoi groupé — un seul appel POST .../logistic-tasks/batch
// au clic sur "Confirmer" plutôt qu'un appel par tâche. Instanciée UNE fois par le parent
// (LiveInventoryPanel) et passée en prop au drawer, pour survivre à sa fermeture/réouverture
// entre deux items (mockup : "cliquer sur un autre bouton transfert dans un Item").

import { ref } from 'vue'
import { createLogisticTaskBatch } from '@/api/endpoints/logistic-tasks.api'

let _localId = 0

export function useRestockerTaskQueue() {
  const queue = ref([])
  const confirming = ref(false)
  const error = ref(null)

  /** @param {{itemKey, menuItemId?, itemLabel, sourceElementId, sourceElementName,
   *   destinationElementId, destinationElementName, packed, loose, assignedToUserId,
   *   assignedToName, priority}} task */
  function addTask(task) {
    queue.value = [...queue.value, { ...task, _localId: ++_localId }]
  }

  function removeTask(id) {
    queue.value = queue.value.filter((t) => t._localId !== id)
  }

  function clear() {
    queue.value = []
  }

  async function confirm(spaceId) {
    if (!queue.value.length) return null
    confirming.value = true
    error.value = null
    try {
      const tasks = queue.value.map((t) => ({
        itemKey: t.itemKey,
        menuItemId: t.menuItemId || undefined,
        sourceElementId: t.sourceElementId,
        destinationElementId: t.destinationElementId,
        packed: t.packed,
        loose: t.loose,
        assignedToUserId: t.assignedToUserId,
        priority: t.priority,
      }))
      const res = await createLogisticTaskBatch(spaceId, tasks)
      clear()
      return res
    } catch (e) {
      error.value = e?.userMessage || e?.message || 'Impossible de confirmer les tâches.'
      throw e
    } finally {
      confirming.value = false
    }
  }

  return { queue, confirming, error, addTask, removeTask, clear, confirm }
}
