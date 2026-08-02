-- BUG-021 : jointure Event <-> WeezeventEvent aujourd'hui par égalité de DATE seule (RPC
-- get_space_shop_details), sans discriminant si 2 events Weezevent tombent le même jour sur le
-- même espace. Ajoute une liaison explicite ; le rapprochement automatique (1 Event + 1
-- WeezeventEvent partageant tenant+date, sans ambiguïté) est fait applicativement
-- (EventWeezeventLinkService), pas par cette migration — colonne nullable, aucun backfill ici.
--
-- Vérifié en base le 2026-07-21 (lecture seule, DATABASE_URL) : des cas ambigus existent déjà
-- aujourd'hui (ex. tenant cmpya1n280009wpbc00u2bikp a 2 WeezeventEvent le même jour calendaire à
-- 2 reprises ; plusieurs tenants ont aussi >1 Event le même jour) — confirme que la
-- désambiguïsation manuelle n'est pas un cas purement théorique.
ALTER TABLE "Event" ADD COLUMN "weezeventEventId" TEXT;

CREATE INDEX "Event_weezeventEventId_idx" ON "Event"("weezeventEventId");

ALTER TABLE "Event" ADD CONSTRAINT "Event_weezeventEventId_fkey"
  FOREIGN KEY ("weezeventEventId") REFERENCES "WeezeventEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- BUG-106 : secret de signature webhook Weezevent aujourd'hui unique par tenant
-- (Tenant.weezeventWebhookSecret), pas par intégration, contrairement aux credentials OAuth
-- (WeezeventIntegrationConfig.clientId/clientSecret, corrigés en BUG-025). Colonnes nullables :
-- WebhookController.receiveWebhook se replie sur Tenant.weezeventWebhookSecret /
-- weezeventWebhookEnabled tant qu'aucun secret par-intégration n'est configuré (rétrocompatible,
-- zéro action requise pour les tenants existants).
ALTER TABLE "WeezeventIntegrationConfig" ADD COLUMN "webhookSecret" TEXT;
ALTER TABLE "WeezeventIntegrationConfig" ADD COLUMN "webhookEnabled" BOOLEAN;
