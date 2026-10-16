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
/**
 * Un watermark PAR SOURCE (ADR_MULTI_SOURCE 4.4) : sans `sourceIntegrationId` (source historique
 * dérivée ou `auto`), la clé est celle d'avant le multi-source ; une source déclarée reçoit un
 * suffixe, pour qu'un job ne fasse jamais avancer la référence d'une autre source.
 */
export const liveWatermarkKey = (eventId: string, sourceIntegrationId?: string | null) =>
  sourceIntegrationId ? `live:agg:watermark:${eventId}:${sourceIntegrationId}` : `live:agg:watermark:${eventId}`;
export const livePendingKey = (spaceId: string, integrationId: string | null | undefined) =>
  `live:agg:pending:${spaceId}:${integrationId ?? ''}`;
export const liveFullRebuildKey = (eventId: string, sourceIntegrationId?: string | null) =>
  sourceIntegrationId ? `live:agg:full:${eventId}:${sourceIntegrationId}` : `live:agg:full:${eventId}`;
export const webhookLastOkKey = (integrationId: string) => `live:webhook:last-ok:${integrationId}`;
export const liveHeartbeatKey = (name: string) => `live:heartbeat:${name}`;
export const liveSyncStateKey = (integrationId: string) => `live:sync:state:${integrationId}`;

export const LIVE_PENDING_TTL_SEC = 15 * 60;
/** Au-delà, le webhook est considéré muet et le polling repasse en cadence live. */
export const WEBHOOK_HEALTHY_WINDOW_MS = 2 * 60 * 1000;
