-- BUG-146-01 — Backfill du lien « match -> conteneur Weezevent du club » (Stade Jean Bouin).
-- APPLICATION MANUELLE UNIQUEMENT (ADR-0002), APRÈS validation de la liste par JLH
-- (contrôle avant, ci-dessous) et AVANT la ré-agrégation de l'espace.
--
-- Règle Bertrand (25/08) : une vente compte pour un match si elle vient de la data
-- integration du club ET tombe dans la fenêtre portes -> fin. Le code (mode
-- container-range, aggregation.service.ts) exploite Event."weezeventEventId" pointant le
-- conteneur du club. Ce backfill pose ce lien sur les events Jean Bouin qui ne l'ont pas.
--
-- Conteneurs (vérifiés en base, chacun porte l'integrationId de son club) :
--   cms9haqpo00byqdrocemoc3y0 = « STADE FRANÇAIS 25-26 » (rugby, intégration SFP)
--   cms82djru8tdqkgsm874gpcsz = « PARIS FOOTBALL CLUB »  (foot, intégration PFC)
--
-- Affectation par motif de nom :
--   PFC%                     -> conteneur PARIS FC
--   SFP% / 1/4 SFP%          -> conteneur STADE FRANÇAIS
--   STREAM FOR HUMANITY      -> STADE FRANÇAIS (vérifié : 4 625 tx du 16/11/25, toutes
--                               sous le conteneur STADE FRANÇAIS 25-26)
--   Dragons catalans%        -> STADE FRANÇAIS (vérifié : 7 688 tx du 06/06/26, idem)
--
-- CE QUE CA MODIFIE : colonne "weezeventEventId" des lignes "Event" de l'espace Jean
-- Bouin dont le lien est vide (~76 lignes). Aucun changement de schéma. Aucun effet
-- visible AVANT le déploiement du code + la ré-agrégation.
--
-- CONTRÔLE AVANT — la liste complète des affectations proposées, à faire valider :
--   SELECT e.name, e."eventDate"::date,
--     CASE
--       WHEN e.name ILIKE 'PFC%' THEN 'PARIS FC'
--       WHEN e.name ILIKE 'SFP%' OR e.name ILIKE '1/4 SFP%'
--         OR e.name = 'STREAM FOR HUMANITY' OR e.name ILIKE 'Dragons catalans%' THEN 'STADE FRANCAIS'
--       ELSE '?? A ARBITRER'
--     END AS club_propose,
--     e."weezeventEventId" AS lien_actuel
--   FROM "Event" e
--   WHERE e."spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo' AND e."tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz'
--   ORDER BY club_propose, e."eventDate";
-- Attendu : zéro ligne « ?? A ARBITRER ». S'il y en a, STOP — arbitrage JLH d'abord.
--
-- SAUVEGARDE AVANT (à conserver) :
--   SELECT id, name, "weezeventEventId" FROM "Event"
--   WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo' AND "tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz';

UPDATE "Event"
SET "weezeventEventId" = 'cms82djru8tdqkgsm874gpcsz'
WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo'
  AND "tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz'
  AND "weezeventEventId" IS NULL
  AND name ILIKE 'PFC%';

UPDATE "Event"
SET "weezeventEventId" = 'cms9haqpo00byqdrocemoc3y0'
WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo'
  AND "tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz'
  AND "weezeventEventId" IS NULL
  AND (name ILIKE 'SFP%' OR name ILIKE '1/4 SFP%'
       OR name = 'STREAM FOR HUMANITY' OR name ILIKE 'Dragons catalans%');

-- CONTRÔLE APRÈS (attendu : 0 ligne sans lien) :
--   SELECT COUNT(*) FROM "Event"
--   WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo' AND "tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz'
--     AND "weezeventEventId" IS NULL;
--
-- RETOUR ARRIÈRE (remet à vide les liens posés par CE fichier — le seul event qui avait
-- déjà un lien avant n'est pas touché puisque filtré par IS NULL ci-dessus) :
--   UPDATE "Event" SET "weezeventEventId" = NULL
--   WHERE "spaceId" = 'cmsufah9p0c08gpkz2wsg5pzo'
--     AND "weezeventEventId" IN ('cms82djru8tdqkgsm874gpcsz', 'cms9haqpo00byqdrocemoc3y0');
-- (ou restauration depuis la sauvegarde AVANT.)
