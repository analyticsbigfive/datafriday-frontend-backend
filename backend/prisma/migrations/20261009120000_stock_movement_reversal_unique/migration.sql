-- Un dépôt ne s'annule qu'une fois, même sous deux requêtes simultanées : l'index sur
-- reversesMovementId devient unique (les NULL restent multiples en PostgreSQL).
DROP INDEX IF EXISTS "StockMovement_reversesMovementId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_reversesMovementId_key" ON "StockMovement"("reversesMovementId");
