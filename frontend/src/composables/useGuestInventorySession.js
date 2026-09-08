// src/composables/useGuestInventorySession.js
//
// Mode invité de SpaceInventoryView.vue (manager PDV sans compte, accès par PIN).
// Un SEUL point d'entrée pour toute la logique spécifique au mode invité : la vue ne
// fait qu'un `if (guestSession.isGuestMode.value)` avant son chargement staff normal,
// et lit les refs/computed exposés ici — aucune branche invité éparpillée ailleurs
// dans le fichier.
//
// Le mode est déterminé par `route.meta.guestMode` (posé sur les 2 routes dédiées
// `/guest/pre-inventory` et `/guest/inventory`, cf. router/index.js), jamais par la
// présence d'une session guestPin seule : un manager qui resterait connecté ne doit
// jamais faire basculer par erreur l'écran STAFF en mode invité.

import { computed } from 'vue'
import { useStore } from 'vuex'
import { useRoute } from 'vue-router'
import {
  getGuestInventory,
  getGuestBaseline,
  saveGuestCount,
  submitGuestCount,
} from '@/api/endpoints/guestPin.api'

export function useGuestInventorySession() {
  const store = useStore()
  const route = useRoute()

  const isGuestMode = computed(() => !!route.meta?.guestMode)
  const session = computed(() => store.getters['guestPin/session'])
  const submittedAt = computed(() => session.value?.submittedAt ?? null)
  // Gelé (a cliqué "J'ai terminé") OU fenêtre plus active (session révoquée pendant
  // que l'onglet était ouvert — se manifeste par un 403 intercepté ailleurs, ce flag
  // ne couvre que le cas "je sais déjà que c'est gelé").
  const isReadonly = computed(() => !!submittedAt.value)

  const guestSpaceId = computed(() => session.value?.spaceId ?? null)
  const guestElementId = computed(() => session.value?.elementId ?? null)
  const guestElementName = computed(() => session.value?.elementName ?? null)
  const guestEventId = computed(() => session.value?.eventId ?? null)
  const guestShowExpected = computed(() => session.value?.showExpected ?? false)

  /**
   * Charge le catalogue + comptages du PDV de l'invité (et les quantités attendues
   * si autorisées) — équivalent invité de `loadForSpace`, mais sans AUCUN des
   * chargements staff (analyse/loadSpace, events, logistics, market prices...) qui
   * partiraient en 401 sous JWT invité.
   * @returns {{ items: Array, expected: Object }}
   */
  async function loadGuestInventory() {
    const [inventory, baseline] = await Promise.all([
      getGuestInventory(),
      guestShowExpected.value ? getGuestBaseline() : Promise.resolve({ expected: {} }),
    ])
    return { items: inventory?.items ?? [], expected: baseline?.expected ?? {} }
  }

  /** Sauvegarde un comptage — même forme de payload que `inventory/upsertCount` côté staff. */
  async function saveGuestLine(payload) {
    return saveGuestCount(payload)
  }

  /** "J'ai terminé" : gèle ce PDV, revalide la session pour refléter `submittedAt`. */
  async function submitGuestInventory() {
    await submitGuestCount()
    await store.dispatch('guestPin/refreshSession')
  }

  return {
    isGuestMode,
    isReadonly,
    submittedAt,
    guestSpaceId,
    guestElementId,
    guestElementName,
    guestEventId,
    guestShowExpected,
    loadGuestInventory,
    saveGuestLine,
    submitGuestInventory,
  }
}
