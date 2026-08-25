-- BUG-145-01 — Purge des agrégats orphelins (espaces supprimés).
-- APPLICATION MANUELLE UNIQUEMENT (ADR-0002), EN DERNIER : après le déploiement du code
-- (mode container-range) ET la ré-agrégation de Jean Bouin — l'ordre est décrit dans
-- backend/docs/INSTRUCTIONS_BACKEND_2026-08-25.md.
--
-- Constat (vérifié en base le 24/08/2026) : SpaceRevenueMinuteAgg / SpaceRevenueMinuteItemAgg
-- contiennent des lignes dont le spaceId ne correspond plus à AUCUNE ligne de "Space"
-- (restes d'anciens espaces par club supprimés, ex. cms80amew00x35mw24lny3w74 et
-- cms80zfzx000nkgsmbwf2p115 — un quasi-doublon complet de la table pour Jean Bouin).
-- Ces lignes sont filtrées par spaceId partout : AUCUN impact utilisateur, le gain est
-- la taille des tables et la clarté des audits.
--
-- CE QUE CA MODIFIE : suppression des lignes d'agrégats pointant un espace inexistant.
-- Effet visible : aucun. Irréversible (mais reconstructible : une ré-agrégation réécrit
-- les agrégats des espaces EXISTANTS ; les orphelins, eux, n'appartiennent à rien).
--
-- CONTRÔLE AVANT — compter ce qui va partir (conserver le résultat) :
--   SELECT 'SpaceRevenueMinuteAgg' AS tbl, COUNT(*) AS lignes, ROUND(SUM("revenueHt")::numeric,2) AS ht
--   FROM "SpaceRevenueMinuteAgg" a
--   WHERE NOT EXISTS (SELECT 1 FROM "Space" s WHERE s.id = a."spaceId")
--   UNION ALL
--   SELECT 'SpaceRevenueMinuteItemAgg', COUNT(*), ROUND(SUM("revenueHt")::numeric,2)
--   FROM "SpaceRevenueMinuteItemAgg" a
--   WHERE NOT EXISTS (SELECT 1 FROM "Space" s WHERE s.id = a."spaceId");

DELETE FROM "SpaceRevenueMinuteItemAgg" a
WHERE NOT EXISTS (SELECT 1 FROM "Space" s WHERE s.id = a."spaceId");

DELETE FROM "SpaceRevenueMinuteAgg" a
WHERE NOT EXISTS (SELECT 1 FROM "Space" s WHERE s.id = a."spaceId");

-- CONTRÔLE APRÈS (attendu : 0 et 0) :
--   SELECT
--     (SELECT COUNT(*) FROM "SpaceRevenueMinuteAgg" a
--       WHERE NOT EXISTS (SELECT 1 FROM "Space" s WHERE s.id = a."spaceId")) AS agg_orphelins,
--     (SELECT COUNT(*) FROM "SpaceRevenueMinuteItemAgg" a
--       WHERE NOT EXISTS (SELECT 1 FROM "Space" s WHERE s.id = a."spaceId")) AS item_orphelins;
