-- =============================================================================
-- Nettoyage InventoryCount orphelins — PHASE B : suppression gardée (JLH)
-- =============================================================================
-- Pré-requis : la PHASE A (..._A_backup.sql) a été exécutée, la table de backup
-- « _backup_InventoryCount_orphans_20260724 » existe et `to_delete` a été relu.
--
-- Le bloc DO avorte si :
--   - la table de backup est vide (phase A non exécutée) ;
--   - le volume d'orphelins dépasse le seuil de sécurité (ré-import massif accidentel).
-- Ajuster le seuil (5000) au `to_delete` observé en phase A si nécessaire.
--
-- ⚠️ Suppression IRRÉVERSIBLE de quantités comptées (déjà inexploitables : aucune
--    identité catalogue). Rollback manuel possible depuis la table de backup.
-- =============================================================================

DO $$
DECLARE
  n_backup  bigint;
  n_orphans bigint;
BEGIN
  SELECT count(*) INTO n_backup FROM "_backup_InventoryCount_orphans_20260724";

  SELECT count(*) INTO n_orphans
  FROM "InventoryCount" ic
  WHERE NOT EXISTS (SELECT 1 FROM "MenuItem" mi WHERE mi.id = ic."itemId")
     OR (ic."shopId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "SpaceElement" se WHERE se.id = ic."shopId"));

  IF n_backup = 0 THEN
    RAISE EXCEPTION 'Backup vide — phase A non exécutée, abandon';
  END IF;

  IF n_orphans > 5000 THEN
    RAISE EXCEPTION 'Volume orphelins inattendu (%), abandon', n_orphans;
  END IF;

  DELETE FROM "InventoryCount" ic
  WHERE NOT EXISTS (SELECT 1 FROM "MenuItem" mi WHERE mi.id = ic."itemId")
     OR (ic."shopId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "SpaceElement" se WHERE se.id = ic."shopId"));

  RAISE NOTICE 'Supprimé % ligne(s) orpheline(s)', n_orphans;
END $$;

-- Contrôle post-suppression (attendu : 0)
SELECT count(*) AS remaining_orphans
FROM "InventoryCount" ic
WHERE NOT EXISTS (SELECT 1 FROM "MenuItem" mi WHERE mi.id = ic."itemId")
   OR (ic."shopId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "SpaceElement" se WHERE se.id = ic."shopId"));
