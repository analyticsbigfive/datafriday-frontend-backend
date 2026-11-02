import { ref } from 'vue'
import { getEventSalesOutsideWindow } from '@/api/endpoints/event.api'

const TIME_ZONE = 'Europe/Paris'

function clock(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE })
}

/**
 * Ventes reçues après l'heure de fin d'un événement : la fenêtre de ventes les ignore, l'alerte
 * le dit à l'utilisateur au moment où il édite l'événement. Jamais bloquant : une erreur réseau
 * n'affiche simplement rien.
 */
export function useEventSalesOutsideWindow() {
  const outside = ref(null)

  async function load(eventId) {
    outside.value = null
    if (!eventId) return
    try {
      const res = await getEventSalesOutsideWindow(eventId)
      const data = res?.data ?? res
      outside.value = data?.count > 0
        ? { count: data.count, first: clock(data.firstAt), last: clock(data.lastAt), end: clock(data.windowEnd) }
        : null
    } catch {
      outside.value = null
    }
  }

  return { outside, load }
}
