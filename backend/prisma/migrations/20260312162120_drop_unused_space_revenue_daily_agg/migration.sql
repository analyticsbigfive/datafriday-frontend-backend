-- Reconstruction 2026-09-07 : "SpaceRevenueDailyAgg" (créée juste avant, dans
-- 20260312162119_add_space_dashboard_unified_api) n'existe plus en base réelle et n'est
-- référencée par aucune autre migration ni par schema.prisma — supersédée par
-- SpaceRevenueMinuteAgg (agrégat minute, plus fin). Sa suppression a dû être faite hors
-- migration ; on la rejoue ici pour que l'historique local corresponde à la réalité.

DROP TABLE IF EXISTS "SpaceRevenueDailyAgg";
