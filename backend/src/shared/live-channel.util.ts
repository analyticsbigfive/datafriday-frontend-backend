// Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — noms de canaux
// Redis Pub/Sub partagés entre le publisher (AggregationProcessor, à la fin d'un job
// process-events) et les subscribers :
//  - liveSpaceChannel : un espace précis (SpacesController::liveStream, écran Live d'un espace).
//  - liveTenantSpacePattern : tous les espaces d'un tenant (GlobalLiveController::liveStream,
//    indicateur global "un event est live quelque part", monté une fois par session dans
//    App.vue). `tenantId` fait partie du nom du canal précisément pour permettre ce pattern
//    subscribe scopé par tenant SANS lookup supplémentaire (pas de requête "quel tenant
//    possède ce spaceId" à chaque message).
// Fonctions plutôt que constantes en dur des deux côtés : un seul endroit à faire évoluer si
// le format change.
export function liveSpaceChannel(tenantId: string, spaceId: string): string {
  return `live:tenant:${tenantId}:space:${spaceId}`;
}

export function liveTenantSpacePattern(tenantId: string): string {
  return `live:tenant:${tenantId}:space:*`;
}
