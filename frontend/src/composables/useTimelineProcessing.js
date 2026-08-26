import { ref } from 'vue'
import { getStep4Context, processEvents, getWeezeventEvents } from '@/api/endpoints/aggregation.api'
import { getEvents } from '@/api/endpoints/event.api'

// BUG-373-02 (2026-08-25) : le step 4 du wizard n'a besoin que des events DE CET ESPACE — avant
// ce fix, `loadTimeline` passait par le cache Vuex `events/fetchEvents`, pensé pour la page
// globale "Events" (TOUT le tenant, paginé en boucle côté store), puis filtrait côté client sur
// spaceId. Sur un tenant à plusieurs centaines d'events, ça déclenchait 3-4 requêtes /events
// inutiles à chaque ouverture du wizard. `GET /events` accepte déjà `spaceId` côté backend —
// on l'utilise directement, sans passer par le cache tenant-wide.
async function fetchSpaceEvents(spaceId) {
  const limit = 200
  let page = 1
  let list = []
  while (true) {
    const result = await getEvents({ spaceId, page, limit })
    const pageRows = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.data?.data)
          ? result.data.data
          : []
    list = list.concat(pageRows)
    const total = result?.meta?.total ?? result?.data?.meta?.total
    if (!total || pageRows.length < limit || list.length >= total) break
    page += 1
  }
  return list
}

export function useTimelineProcessing() {
  const events = ref([])
  const unregisteredDates = ref([])
  const weezeventEvents = ref([])
  const transactionStats = ref(null)
  const summary = ref({ total: 0, processed: 0, pending: 0, failed: 0 })
  const loading = ref(false)
  const processing = ref(false)
  const error = ref(null)

  async function loadTimeline(spaceId, integrationId) {
    loading.value = true
    error.value = null
    try {
      // #10 — un seul appel bundle (timeline + weezeventEvents + hasMappings)
      // BUG-373-02 : events CRUD chargés scopés à CET espace (fetchSpaceEvents), plus via le
      // cache Vuex tenant-wide — en parallèle du contexte, les deux étant indépendants.
      const [contextResult, eventsResult] = await Promise.allSettled([
        getStep4Context(spaceId, integrationId),
        fetchSpaceEvents(spaceId),
      ])

      // Construire la map timeline par eventId pour enrichissement du statut
      const timelineMap = new Map()
      if (contextResult.status === 'fulfilled') {
        const result = contextResult.value
        const rawList = Array.isArray(result)
          ? result
          : Array.isArray(result?.events)
            ? result.events
            : Array.isArray(result?.registeredEvents)
              ? result.registeredEvents
              : []

        for (const item of rawList) {
          const id = item.eventId ?? item.id
          if (id != null) timelineMap.set(String(id), item)
        }

        unregisteredDates.value = result?.unregisteredDates ?? result?.unregistered_dates ?? []
        transactionStats.value = result?.transactionStats ?? null
        // weezeventEvents et hasMappings exposés depuis le contexte
        if (result?.weezeventEvents?.length) {
          weezeventEvents.value = result.weezeventEvents
        }
        if (result?.hasMappings !== undefined) {
          hasMappings.value = result.hasMappings
        }
      } else {
        error.value = contextResult.reason?.message
      }

      // Events CRUD de cet espace (déjà scopés par fetchSpaceEvents, plus de filtre client requis)
      const spaceEvents = eventsResult.status === 'fulfilled' ? eventsResult.value : []

      // Fusionner : chaque event CRUD enrichi du statut de la timeline
      const merged = spaceEvents.map(e => {
        const tlItem = timelineMap.get(String(e.id))
        const aggregationStatus = tlItem
          ? (tlItem.aggregationStatus
              ? tlItem.aggregationStatus
              : tlItem.status === 'done' ? 'completed' : (tlItem.status ?? 'pending'))
          : 'pending'
        return {
          id: e.id,
          name: e.name || e.eventName,
          startDate: e.eventStartDate ?? e.eventDate ?? e.startDate ?? null,
          endDate: e.eventEndDate ?? e.endDate ?? null,
          aggregationStatus,
          dataPoints: tlItem?.dataPoints ?? tlItem?.data_points ?? null,
          _raw: e,
        }
      })

      // Ajouter les events présents dans la timeline mais pas dans les CRUD (sécurité)
      const crudIds = new Set(spaceEvents.map(e => String(e.id)))
      for (const [id, item] of timelineMap.entries()) {
        if (!crudIds.has(id)) {
          merged.push({
            id: item.eventId ?? item.id,
            name: item.eventName ?? item.name,
            startDate: item.startDate ?? item.start_date ?? item.eventDate ?? item.event_date ?? null,
            endDate: item.endDate ?? item.end_date ?? item.eventDate ?? item.event_date ?? null,
            aggregationStatus: item.aggregationStatus
              ? item.aggregationStatus
              : item.status === 'done' ? 'completed' : (item.status ?? 'pending'),
            dataPoints: item.dataPoints ?? item.data_points ?? null,
            _raw: item,
          })
        }
      }

      events.value = merged
      summary.value = {
        total: merged.length,
        processed: merged.filter(e => e.aggregationStatus === 'completed').length,
        pending: merged.filter(e => e.aggregationStatus === 'pending').length,
        failed: merged.filter(e => e.aggregationStatus === 'failed' || e.aggregationStatus === 'error').length,
      }
    } finally {
      loading.value = false
    }
  }

  async function processSingleEvent(spaceId, eventId, integrationId) {
    processing.value = true
    error.value = null
    try {
      const result = await processEvents(spaceId, [eventId], integrationId)

      // Update event status locally
      const idx = events.value.findIndex(e => e.id === eventId)
      if (idx >= 0 && result.results?.length) {
        events.value[idx] = {
          ...events.value[idx],
          aggregationStatus: result.results[0].status === 'success' ? 'completed' : 'failed',
          transactionsProcessed: result.results[0].transactions || 0,
        }
      }

      summary.value.processed = events.value.filter(e => e.aggregationStatus === 'completed').length
      summary.value.pending = events.value.filter(e => e.aggregationStatus === 'pending').length

      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      processing.value = false
    }
  }

  async function processMultipleEvents(spaceId, eventIds, integrationId) {
    processing.value = true
    error.value = null
    try {
      return await processEvents(spaceId, eventIds, integrationId)
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      processing.value = false
    }
  }

  const hasMappings = ref(null)

  return {
    events,
    unregisteredDates,
    weezeventEvents,
    transactionStats,
    hasMappings,
    summary,
    loading,
    processing,
    error,
    loadTimeline,
    processSingleEvent,
    processMultipleEvents,
  }
}
