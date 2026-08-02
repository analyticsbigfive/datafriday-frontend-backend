-- BUG-107 : "WeezeventIntegration".clientId/clientSecret sont des colonnes legacy, gelées par la
-- migration 20260710120000_digifood_integration_provider ("drop différé") lors de l'introduction
-- de WeezeventIntegrationConfig (détail 1-1 par intégration). Le modèle Prisma `Integration`
-- (mappé sur cette table) ne déclare plus ces champs depuis ce refactor — tout INSERT généré par
-- Prisma (WeezeventIntegrationService.createInstance(), DigifoodIntegrationService.createInstance())
-- omet donc ces colonnes, alors qu'elles sont restées NOT NULL en base : toute création de
-- nouvelle instance Weezevent OU Digifood échoue avec P2011 (Null constraint violation).
--
-- Vérifié avant fix (lecture seule, 2026-07-21) : aucun code ne lit/écrit plus
-- "WeezeventIntegration".clientId/clientSecret directement (grep sur src/ — seuls
-- WeezeventIntegrationConfig.clientId/clientSecret et DigifoodIntegrationConfig.webhookSecret
-- sont utilisés aujourd'hui) — rendre ces colonnes nullable ne casse rien de lu actuellement.
--
-- Ne complète le "drop différé" que jusqu'à DROP NOT NULL, pas DROP COLUMN : les valeurs
-- historiques (backfillées lors de la migration précédente) restent en place par prudence, un
-- vrai DROP COLUMN pourra suivre dans une migration séparée une fois confirmé qu'aucun outil de
-- backfill/audit externe n'en dépend.
ALTER TABLE "WeezeventIntegration" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "WeezeventIntegration" ALTER COLUMN "clientSecret" DROP NOT NULL;
