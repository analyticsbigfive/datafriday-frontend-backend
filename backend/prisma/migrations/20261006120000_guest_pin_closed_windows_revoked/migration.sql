-- Document Bertrand « Pre et Post event Inventory cycle » (2026-10-06) : l'accès invité
-- ne dépend plus que de la ligne GuestPinAccess du PDV (un PDV peut être rouvert seul
-- alors que sa fenêtre est arrêtée), et toute clôture de fenêtre révoque désormais ses
-- lignes (src/features/inventory/inventory-window-closure.ts).
--
-- Les fenêtres clôturées AVANT ce changement ont gardé des lignes 'active' : sans cette
-- reprise, un jeton invité encore valide sur une fenêtre fermée redeviendrait accepté.
-- Données seulement, idempotent.

UPDATE "GuestPinAccess" AS a
SET "status" = 'revoked',
    "revokedAt" = COALESCE(w."closedAt", NOW()),
    "revokedBy" = 'migration-2026-10-06'
FROM "InventoryWindow" AS w
WHERE a."windowId" = w."id"
  AND w."status" = 'closed'
  AND a."status" = 'active';
