// Session du vendeur dans la caisse : identité affichée (PdV, évènement, vendeur) et sortie.
// On ne peut pas quitter tant que des ventes attendent leur envoi : la file V1 vit en mémoire,
// les perdre serait perdre du chiffre d'affaires.

import { computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { guestPinLandingRoute } from '@/utils/guestPinLanding'
import { exitPosFullscreen } from '@/utils/posFullscreen'

export function useGuestPosSession() {
  const store = useStore()
  const router = useRouter()

  const pdvName = computed(() => store.getters['guestPos/pdv']?.name || store.getters['guestPin/session']?.elementName || '')
  const eventName = computed(() => store.getters['guestPos/event']?.name || '')
  const vendorName = computed(() => store.getters['guestPos/vendorName'] || store.getters['guestPin/session']?.vendorName || '')
  const canLeave = computed(() => store.getters['guestPos/pendingCount'] === 0)

  /** Ferme la session invité (jeton oublié) et revient sur la page du PdV scanné. */
  async function leave() {
    if (!canLeave.value) return false
    await exitPosFullscreen()
    const slug = store.getters['guestPin/slug']
    await store.dispatch('guestPos/reset')
    await store.dispatch('guestPin/clear')
    router.replace(guestPinLandingRoute(slug || undefined))
    return true
  }

  return { pdvName, eventName, vendorName, canLeave, leave }
}
