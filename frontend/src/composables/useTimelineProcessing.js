import { ref } from 'vue'
import { getStep4Context, processEvents, getWeezeventEvents } from '@/api/endpoints/aggregation.api'
import store from '@/store'

export function useTimelineProcessing() {
  const events = ref([])
  const unregisteredDates = ref([])
  const weezeventEvents = ref([])
  const transactionStats = ref(null)
  const summary = ref({ total: 0, processed: 0, pending: 0, failed: 0 })
  const loading = ref(false)
  const processing = ref(false)
  const processedCount = ref(0)
  const totalCount = ref(0)
  const error = ref(null)
  // §9 — flag d'annulation propre
  const cancelled = ref(false)

  async function loadTimeline(spaceId, integrationId) {
    loading.value = true
    error.value = null
    try {
      // #10 — un seul appel bundle (timeline + weezeventEvents + hasMappings)
      const [contextResult] = await Promise.allSettled([
        getStep4Context(spaceId, integrationId),
      ])
      // Charger les events CRUD (avec cache TTL) — indépendant de spaceId
      await store.dispatch('events/fetchEvents').catch(() => {})

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

      // Récupérer les events CRUD filtrés par spaceId (events créés par l'utilisateur)
      const allCrudEvents = store.getters['events/events'] || []
      const spaceEvents = allCrudEvents.filter(
        e => e.spaceId != null && String(e.spaceId) === String(spaceId)
      )

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

  async function processAllEvents(spaceId, integrationId) {
    processing.value = true
    error.value = null
    processedCount.value = 0
    const pendingIds = events.value
      .filter(e => e.aggregationStatus !== 'completed')
      .map(e => e.id)
    totalCount.value = pendingIds.length

    try {
      // Process in chunks of 50 to avoid payload limits and give real-time progress
      const CHUNK_SIZE = 50
      for (let i = 0; i < pendingIds.length; i += CHUNK_SIZE) {
        if (cancelled.value) break // §9 — annulation via flag dédié
        const chunk = pendingIds.slice(i, i + CHUNK_SIZE)
        const result = await processEvents(spaceId, chunk, integrationId)
        processedCount.value = Math.min(i + chunk.length, pendingIds.length)
        // Update local event statuses
        if (result.results) {
          for (const r of result.results) {
            const idx = events.value.findIndex(e => e.id === r.eventId)
            if (idx >= 0) {
              events.value[idx] = {
                ...events.value[idx],
                aggregationStatus: r.status === 'success' ? 'completed' : 'failed',
                transactionsProcessed: r.transactions || 0,
              }
            }
          }
        }
      }

      await loadTimeline(spaceId, integrationId)
      return { processed: processedCount.value }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      processing.value = false
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

  function getProgressPercent() {
    if (totalCount.value === 0) return 0
    return Math.round((processedCount.value / totalCount.value) * 100)
  }

  const hasMappings = ref(null)

  // §9 — annulation correcte de la boucle de traitement
  function cancelProcessing() {
    cancelled.value = true
    processing.value = false
  }

  return {
    events,
    unregisteredDates,
    weezeventEvents,
    transactionStats,
    hasMappings,
    summary,
    loading,
    processing,
    processedCount,
    totalCount,
    error,
    loadTimeline,
    processAllEvents,
    processSingleEvent,
    getProgressPercent,
    cancelProcessing,
  }
}
