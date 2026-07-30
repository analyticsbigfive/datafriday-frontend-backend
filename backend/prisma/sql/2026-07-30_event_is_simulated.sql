-- Event.isSimulated — discriminant « événement de simulation » (2026-07-30)
--
-- Pourquoi : l'outil QA « simuler une vente » (POST /logistics/:spaceId/simulate-sale,
-- LogisticsService.ensureTodaySalesEvent) crée automatiquement un Event du jour pour
-- ancrer la vente simulée sur « aujourd'hui ». Cet Event n'a ni configuration ni type
-- et polluait EventPredict et l'écran Live, où il apparaissait comme un événement à
-- venir / en cours normal. Jusqu'ici le SEUL signe distinctif était le préfixe de nom
-- `[Simulé] ` — non fiable (renommable, non indexable, non filtrable proprement).
--
-- Sémantique :
--   false (défaut) = événement réel, saisi par un utilisateur, importé, ou « ad hoc »
--                    (créé automatiquement quand des transactions arrivent sans
--                    événement — comportement VOULU, ne pas confondre)
--   true           = événement créé par la simulation de vente (QA)
--
-- Conséquences côté API : GET /events?excludeSimulated=true exclut ces lignes. Ce
-- paramètre est passé par le front sur le chargement d'un espace (useSpaceData →
-- Analyse / Live / EventPredict). La liste Events (GET /events sans paramètre) les
-- garde volontairement visibles, pour pouvoir les supprimer à la main.
--
-- ⚠️ Le backfill est HEURISTIQUE : il rattrape l'historique via le seul signal
-- disponible, le préfixe de nom `[Simulé] ` posé par ensureTodaySalesEvent. Un
-- événement réel qu'un utilisateur aurait nommé « [Simulé] … » serait faussement
-- flagué (aucun cas connu). Les événements simulés antérieurs qui auraient été
-- renommés restent, eux, à false et devront être marqués/supprimés à la main.
--
-- Idempotent (IF NOT EXISTS + UPDATE convergent) — exécutable plusieurs fois.

ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "isSimulated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Event"
   SET "isSimulated" = true
 WHERE "isSimulated" = false
   AND "name" LIKE '[Simulé]%';
