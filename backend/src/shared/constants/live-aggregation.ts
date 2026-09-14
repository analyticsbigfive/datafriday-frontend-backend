/**
 * BUG-379-02 : clés Redis du pipeline live (partagées worker / web).
 *  - watermark : dernier `WeezeventTransaction.updatedAt` agrégé par le job minute d'un event ;
 *    remis à "maintenant" par un rebuild complet.
 *  - pending : un job minute est déjà en file pour ce (space, intégration) ; posé à l'enqueue,
 *    levé au démarrage du job (coalescence : les ventes arrivées entre-temps sont couvertes
 *    par ce job, qui lit les minutes touchées au moment où il tourne).
 *  - webhook last ok : dernier webhook Weezevent traité sans erreur pour une intégration.
 *  - heartbeat : dernier passage réussi de chaque boucle du worker.
 */
export const liveWatermarkKey = (eventId: string) => `live:agg:watermark:${eventId}`;
export const livePendingKey = (spaceId: string, integrationId: string | null | undefined) =>
  `live:agg:pending:${spaceId}:${integrationId ?? ''}`;
export const liveFullRebuildKey = (eventId: string) => `live:agg:full:${eventId}`;
export const webhookLastOkKey = (integrationId: string) => `live:webhook:last-ok:${integrationId}`;
export const liveHeartbeatKey = (name: string) => `live:heartbeat:${name}`;
export const liveSyncStateKey = (integrationId: string) => `live:sync:state:${integrationId}`;

export const LIVE_PENDING_TTL_SEC = 15 * 60;
/** Au-delà, le webhook est considéré muet et le polling repasse en cadence live. */
export const WEBHOOK_HEALTHY_WINDOW_MS = 2 * 60 * 1000;
