// src/composables/useVentilationAccess.js
//
// Accès PIN des logisticiens pour la combinaison de matchs du bandeau Logistique
// (décision Ulrich du 2026-10-09 : un PIN par combinaison, qui n'affiche que ses
// matchs). PIN affiché dans le bandeau en mode Ventilation et dans la fenêtre QR,
// qui lisent le même état.

import { ref, computed } from 'vue'
import {
  ensureVentilationAccess,
  startVentilationAccess,
  stopVentilationAccess,
  resetVentilationPin,
} from '@/api/endpoints/ventilationAccess.api'

export function useVentilationAccess() {
  // `{ slug, window: { id, eventId, linkedEventIds, status, pin, ... } | null }`
  const status = ref(null)
  const loading = ref(false)
  const busy = ref(null)
  const error = ref(null)
  // Dernière sélection demandée : une réponse lente d'une ancienne sélection est ignorée.
  let requestKey = ''

  const isOpen = computed(() => status.value?.window?.status === 'open')
  const pin = computed(() => (isOpen.value ? status.value?.window?.pin || null : null))
  const slug = computed(() => status.value?.slug || null)
  /** Accès de la combinaison affichée. */
  const windowId = computed(() => status.value?.window?.id || null)

  /** Crée au besoin l'accès de la combinaison et lit son PIN. */
  async function ensure(spaceId, eventIds) {
    const ids = (eventIds || []).map(String)
    const key = `${spaceId}::${ids.join(',')}`
    requestKey = key
    if (!spaceId || !ids.length) {
      status.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const next = await ensureVentilationAccess(spaceId, ids)
      if (requestKey === key) status.value = next
    } catch (e) {
      if (requestKey === key) error.value = e?.response?.data?.message || e?.message || null
    } finally {
      if (requestKey === key) loading.value = false
    }
  }

  /** Arrêter, reprendre ou changer le PIN de l'accès affiché. */
  async function run(action, spaceId) {
    const id = windowId.value
    if (!spaceId || !id) return
    busy.value = action
    error.value = null
    try {
      const call = { start: startVentilationAccess, stop: stopVentilationAccess, reset: resetVentilationPin }[action]
      status.value = await call(spaceId, id)
    } catch (e) {
      error.value = e?.response?.data?.message || e?.message || null
    } finally {
      busy.value = null
    }
  }

  return { status, loading, busy, error, isOpen, pin, slug, windowId, ensure, run }
}
