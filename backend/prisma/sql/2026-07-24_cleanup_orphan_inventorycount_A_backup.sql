-- =============================================================================
-- Nettoyage InventoryCount orphelins — PHASE A : sauvegarde + décompte (JLH)
-- =============================================================================
-- Contexte : InventoryCount.itemId / shopId sont des chaînes libres SANS FK vers
-- MenuItem / SpaceElement. Un ré-import de catalogue (ids cuid -> UUID) supprime les
-- anciennes lignes catalogue ; les comptages qui les référençaient survivent en
-- orphelins, sans nom récupérable, et s'affichaient « — » dans la réconciliation.
--
-- Orphelin = itemId sans MenuItem correspondant, OU shopId non-null sans SpaceElement.
--
-- ⚠️ Exécuter cette phase SEULE. Lire `to_delete`, vérifier qu'il est plausible,
--    PUIS seulement lancer la phase B (fichier ..._B_delete.sql).
--    Dev d'abord (datafriday-dev), puis prod.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "_backup_InventoryCount_orphans_20260724" AS
SELECT ic.*
FROM "InventoryCount" ic
WHERE NOT EXISTS (SELECT 1 FROM "MenuItem" mi WHERE mi.id = ic."itemId")
   OR (ic."shopId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "SpaceElement" se WHERE se.id = ic."shopId"));

SELECT count(*) AS to_delete FROM "_backup_InventoryCount_orphans_20260724";
