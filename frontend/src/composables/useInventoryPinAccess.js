// src/composables/useInventoryPinAccess.js
//
// Accès par PIN d'une phase (pre / post-event) : la fenêtre du tableau de statut et
// l'autorisation des boutons Démarrage / Reprise et Arrêt. Document Bertrand « Pre et
// Post event Inventory cycle » (2026-10-06, pages 3 et 4) : boutons activables
// seulement dans la période de la phase (pre : ouverture des portes à venir ; post :
// ouverture des portes passée). Le serveur reste l'arbitre au clic.
//
// Lit le store `guestPinAdmin` peuplé par le bandeau (InventoryPinBand) : les lignes
// PDV (PdvAccessToggle) n'émettent aucune requête de lecture.

import { computed, onBeforeUnmount, ref, unref } from 'vue'
import { useStore } from 'vuex'
import { windowPeriodState } from '@/utils/eventLifecycle'

const CLOCK_MS = 30 * 1000

/** @param {import('vue').Ref<string>|string} phase 'pre-event' | 'post-event' */
export function useInventoryPinAccess(phase) {
  const store = useStore()
  // Horloge : la période bascule (ouverture des portes) sans nouvelle requête.
  const now = ref(new Date())
  const timer = setInterval(() => { now.value = new Date() }, CLOCK_MS)
  onBeforeUnmount(() => clearInterval(timer))

  const window = computed(() => store.getters['guestPinAdmin/windowByPhase'](unref(phase)))
  const period = computed(() => store.getters['guestPinAdmin/periodByPhase'](unref(phase)))
  const periodState = computed(() => windowPeriodState(period.value, now.value))
  // Période inconnue (pas encore chargée) : on laisse cliquer, le serveur tranche.
  const periodOpen = computed(() => periodState.value === 'open' || periodState.value === 'unknown')

  return { window, period, periodState, periodOpen }
}
