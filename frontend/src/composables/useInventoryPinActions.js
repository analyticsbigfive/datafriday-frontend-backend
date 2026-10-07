// src/composables/useInventoryPinActions.js
//
// Arrêt (■) et Démarrage / Reprise (▶) de l'accès par QR code + PIN de TOUS les PDV
// d'une phase. Partagé par le bandeau (InventoryPinBand) et le menu mobile « Options
// inventaire » (design mobile Bertrand 2026-10-07) via InventoryPinActionButtons.
// Lit le store `guestPinAdmin` ; le chargement et la relecture périodique restent au
// bandeau (une seule source de requêtes).

import { computed, ref, unref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useInventoryPinAccess } from '@/composables/useInventoryPinAccess'
import { isAnyAccessOpen, isFullyOpen } from '@/utils/guestPinAccessState'

/** Actions ■ / ▶ en cours, toutes instances confondues (bandeau et menu mobile) :
 *  la relecture périodique du bandeau attend, sinon une réponse partie avant le clic
 *  remettait l'ancien état dans le store. */
export const pinActionsPending = ref(0)

/**
 * @param {{ spaceId: import('vue').Ref<string>|string, eventId: import('vue').Ref<string>|string, phase: import('vue').Ref<string>|string }} target
 */
export function useInventoryPinActions(target) {
  const store = useStore()
  const { t } = useI18n()
  const phase = computed(() => unref(target.phase))
  const { window, periodOpen, periodState } = useInventoryPinAccess(phase)
  const working = ref(false)
  const error = ref('')

  const anyOpen = computed(() => isAnyAccessOpen(window.value))
  const fullyOpen = computed(() => isFullyOpen(window.value))
  const stopDisabled = computed(() => working.value || !periodOpen.value || !anyOpen.value)
  const startDisabled = computed(() => working.value || !periodOpen.value || fullyOpen.value)

  async function run(action) {
    working.value = true
    pinActionsPending.value += 1
    error.value = ''
    try {
      await store.dispatch(action, {
        spaceId: unref(target.spaceId),
        eventId: unref(target.eventId),
        phase: phase.value,
      })
    } catch (e) {
      // Jamais silencieux : un refus serveur (hors période) doit se lire.
      error.value = e?.response?.data?.message || t('invPinAccessError')
    } finally {
      working.value = false
      pinActionsPending.value -= 1
    }
  }

  return {
    window,
    periodState,
    working,
    error,
    stopDisabled,
    startDisabled,
    stopAll: () => run('guestPinAdmin/stopWindow'),
    startAll: () => run('guestPinAdmin/startWindow'),
  }
}
