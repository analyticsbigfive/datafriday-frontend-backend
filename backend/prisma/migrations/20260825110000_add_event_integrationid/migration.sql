-- Écrite à la main (migrations manuelles, cf. ADR-0002 — jamais `prisma migrate dev` sur cette
-- base, échoue en P3006, cf. BUG-70).
-- BUG-368-02 (docs/bugs/, 2026-08-25) : source de vérité EXPLICITE de l'intégration/data-source
-- à laquelle un Event DataFriday appartient. Remplace, pour les events qui l'utilisent, la
-- déduction implicite via `Event.weezeventEventId` pointant un conteneur de saison Weezevent
-- (BUG-146-01, "container-range" — le conteneur sert de proxy pour identifier le club) : cette
-- déduction dépendait d'un backfill manuel par tenant (cf. migration 20260825100001) et de la
-- détection fragile de "conteneur de saison" (span observé/déclaré, cold-start — BUG-338/358/
-- 361/363-02) qui a coûté plusieurs heures de debug le jour même de cette migration.
--
-- Colonne nullable, AUCUNE contrainte modifiée. Un Event sans `integrationId` continue de
-- fonctionner exactement comme avant (mode `exact`/`container-range`/`range`, legacy) —
-- `weezeventEventId` reste lisible et utilisé pour ces events-là. La coexistence des deux
-- mécanismes est volontaire (décision utilisateur 2026-08-25) : `integrationId`, quand posé,
-- devient prioritaire et bypass entièrement `t.eventId`/la détection de conteneur pour cet event.

ALTER TABLE "Event" ADD COLUMN "integrationId" TEXT;

CREATE INDEX "Event_integrationId_idx" ON "Event"("integrationId");
CREATE INDEX "Event_spaceId_integrationId_idx" ON "Event"("spaceId", "integrationId");

-- Backfill best-effort : pour les events déjà liés à un conteneur de saison (mode legacy
-- `container-range`, ex. les 77 events Jean Bouin de la migration 20260825100001), on connaît
-- déjà leur intégration réelle via ce conteneur — les migrer directement sur le mécanisme
-- robuste plutôt que de les laisser sur le legacy. Sans effet sur les events déjà liés à un vrai
-- match précis (mode `exact`, weezeventEventId ne pointe pas un conteneur) : on ne touche QUE
-- les liens vers un SalesEvent dont les transactions réellement observées s'étalent sur plus de
-- 2 jours (même critère que resolveSeasonContainerEventIds, aggregation.service.ts) — un lien
-- vers un match précis doit rester en mode exact, jamais migré vers integration-range.
WITH season_containers AS (
  SELECT t."eventId"
  FROM "WeezeventTransaction" t
  WHERE t."eventId" IS NOT NULL AND t."deletedAt" IS NULL
  GROUP BY t."eventId"
  HAVING MAX(t."transactionDate") - MIN(t."transactionDate") > INTERVAL '2 days'
)
UPDATE "Event" e
SET "integrationId" = se."integrationId"
-- NB : le modèle Prisma s'appelle SalesEvent, mais la table physique reste WeezeventEvent
-- (@@map historique) — corrigé ici après une 1ʳᵉ tentative qui utilisait le nom du modèle.
FROM "WeezeventEvent" se
WHERE e."weezeventEventId" = se.id
  AND e."integrationId" IS NULL
  AND e."weezeventEventId" IN (SELECT "eventId" FROM season_containers);
