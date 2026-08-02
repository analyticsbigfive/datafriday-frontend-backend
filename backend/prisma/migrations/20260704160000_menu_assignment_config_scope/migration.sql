-- Scope des MenuAssignment (elementId) par CONFIGURATION.
-- Cause : en builder v2 un élément est partagé entre configs (ConfigurationElement) ;
-- la clé unique (elementId, menuItemId) faisait fuir les menus cochés de la config A
-- vers la config B. Cf. docs/HANDOFF_SPACE_MENUS_CONFIG_SCOPING.md.
-- ⚠️ Le changement de clé unique casse l'ancien code (upsert sur elementId_menuItemId) :
-- déployer le backend immédiatement après application.

-- 1) Colonne + FK (Cascade : supprimer une config supprime ses assignations)
ALTER TABLE "MenuAssignment" ADD COLUMN "configId" TEXT;
ALTER TABLE "MenuAssignment" ADD CONSTRAINT "MenuAssignment_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "Config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) L'ancienne clé unique empêche 2 lignes par élément×item → drop AVANT le backfill.
ALTER TABLE "MenuAssignment" DROP CONSTRAINT IF EXISTS "MenuAssignment_elementId_menuItemId_key";
DROP INDEX IF EXISTS "MenuAssignment_elementId_menuItemId_key";

-- 3) Backfill par RÉPLICATION : chaque assignation existante est répliquée vers CHAQUE
--    config adhérente de son élément (v2 : ConfigurationElement ; v1 sans adhésion :
--    config du parent Floor/Forecourt/ExternalMerch). Préserve exactement le comportement
--    visible actuel (A et B identiques au lendemain), l'utilisateur différencie ensuite.
--    Un seul INSERT…SELECT (latence dev ~600 ms/requête — pas de boucle applicative).
INSERT INTO "MenuAssignment" ("id", "elementId", "menuItemId", "enabled", "configId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."elementId", t."menuItemId", t."enabled", t."configId", t."createdAt", t."updatedAt"
FROM (
  -- v2 : une réplique par adhésion ConfigurationElement
  SELECT ma."elementId", ma."menuItemId", ma."enabled", ma."createdAt", ma."updatedAt", ce."configId"
  FROM "MenuAssignment" ma
  JOIN "ConfigurationElement" ce ON ce."elementId" = ma."elementId"
  WHERE ma."elementId" IS NOT NULL AND ma."configId" IS NULL
  UNION
  -- v1 (aucune adhésion) : config du parent
  SELECT ma."elementId", ma."menuItemId", ma."enabled", ma."createdAt", ma."updatedAt",
         COALESCE(f."configId", fc."configId", em."configId") AS "configId"
  FROM "MenuAssignment" ma
  JOIN "SpaceElement" se ON se."id" = ma."elementId"
  LEFT JOIN "Floor" f ON f."id" = se."floorId"
  LEFT JOIN "Forecourt" fc ON fc."id" = se."forecourtId"
  LEFT JOIN "ExternalMerch" em ON em."id" = se."externalMerchId"
  WHERE ma."elementId" IS NOT NULL AND ma."configId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "ConfigurationElement" ce2 WHERE ce2."elementId" = ma."elementId")
    AND COALESCE(f."configId", fc."configId", em."configId") IS NOT NULL
) t;

-- 4) Supprimer les originaux (configId NULL) qui ont été répliqués. Les assignations
--    d'éléments SANS aucune config (orphelins) restent en NULL — invisibles dans toute
--    config, comme avant. Les assignations station (elementId NULL) ne sont pas touchées.
DELETE FROM "MenuAssignment" ma
WHERE ma."configId" IS NULL AND ma."elementId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "MenuAssignment" r
    WHERE r."elementId" = ma."elementId" AND r."menuItemId" = ma."menuItemId" AND r."configId" IS NOT NULL
  );

-- 5) Nouvelle clé unique 3 colonnes + index FK
CREATE UNIQUE INDEX "MenuAssignment_elementId_menuItemId_configId_key"
  ON "MenuAssignment"("elementId", "menuItemId", "configId");
CREATE INDEX "MenuAssignment_configId_idx" ON "MenuAssignment"("configId");
