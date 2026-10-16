// État réseau de la caisse et relance de la file d'envoi (posOutbox) : écoute online/offline,
// renvoie les ventes en attente dès le retour du réseau et périodiquement, et prévient avant
// de fermer l'onglet tant que des ventes n'ont pas été envoyées.

import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'

/** Cadence de relance de la file tant qu'il reste des ventes à envoyer. */
const FLUSH_INTERVAL_MS = 15 * 1000

export function useGuestPosNetwork() {
  const store = useStore()
  const { t } = useI18n()

  const state = computed(() => store.getters['guestPos/syncState']) // 'live' | 'pending' | 'offline'
  const pendingCount = computed(() => store.getters['guestPos/pendingCount'])
  const rejectedCount = computed(() => store.getters['guestPos/rejectedEntries'].length)

  const label = computed(() => {
    if (state.value === 'offline') return t('guestPosSyncOffline').replace('{count}', pendingCount.value)
    if (state.value === 'pending') return t('guestPosSyncPending').replace('{count}', pendingCount.value)
    return t('guestPosSyncLive')
  })

  const flush = () => store.dispatch('guestPos/flushOutbox')

  const onOnline = () => {
    store.dispatch('guestPos/setOnline', true)
    flush()
  }
  const onOffline = () => store.dispatch('guestPos/setOnline', false)
  const onBeforeUnload = (event) => {
    if (pendingCount.value > 0) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  let timer = null
  onMounted(() => {
    store.dispatch('guestPos/hydrateOutbox')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) store.dispatch('guestPos/setOnline', false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeunload', onBeforeUnload)
    timer = setInterval(() => {
      if (pendingCount.value > 0) flush()
    }, FLUSH_INTERVAL_MS)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return { state, label, pendingCount, rejectedCount, flush }
}
