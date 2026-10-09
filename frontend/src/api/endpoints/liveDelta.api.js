// Écran Live : dernières minutes seulement de la chronologie et des paniers d'un event
// (paramètre `since` du backend, cf. utils/liveDelta.js). Volontairement hors des caches de
// session de space.api.js : une réponse partielle ne doit jamais y être écrite.
import api from '../client'

export async function getLiveDelta(spaceId, eventId, since) {
  const params = { eventIds: eventId, since }
  const [timeline, baskets] = await Promise.all([
    api.get(`/spaces/${spaceId}/event-timeline`, { params: { ...params, granularity: 'minute' } }),
    api.get(`/spaces/${spaceId}/transaction-baskets`, { params }),
  ])
  return {
    timelineRows: timeline.data?.[eventId] || [],
    basketRows: baskets.data?.[eventId] || [],
  }
}
