// Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — nom du canal
// Redis Pub/Sub partagé entre le publisher (AggregationProcessor, à la fin d'un job
// process-events) et le(s) subscriber(s) (SpacesController::liveStream, un par connexion SSE
// ouverte). Fonction plutôt que constante en dur des deux côtés : un seul endroit à faire
// évoluer si le format change.
export function liveSpaceChannel(spaceId: string): string {
  return `live:space:${spaceId}`;
}
