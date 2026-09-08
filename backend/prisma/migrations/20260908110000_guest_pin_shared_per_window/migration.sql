-- Un PIN par PDV → UN SEUL PIN partagé par TOUS les PDV d'une fenêtre (décision produit
-- 2026-09-08). Le secret (pinLookupHash) migre de GuestPinAccess vers InventoryWindow.
-- GuestPinAccess perd son rôle de porteur de secret : elle ne sert plus qu'au suivi
-- par PDV (vu/soumis/validé/révoqué), auto-créée au premier login réussi.
--
-- Aucune donnée à préserver : les PIN existants (un par PDV) n'ont plus de sens dans le
-- nouveau modèle (partagé par fenêtre) — chaque directeur devra régénérer UN PIN par
-- fenêtre après cette migration. Feature encore en test, pas de manager réel en
-- production sur l'ancien schéma à ce jour.

-- ── InventoryWindow : nouveau porteur du secret ──────────────────────────────────────

ALTER TABLE "InventoryWindow" ADD COLUMN IF NOT EXISTS "pinLookupHash" TEXT;
ALTER TABLE "InventoryWindow" ADD COLUMN IF NOT EXISTS "pinSetAt" TIMESTAMP(3);
ALTER TABLE "InventoryWindow" ADD COLUMN IF NOT EXISTS "pinSetBy" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryWindow_pinLookupHash_key" ON "InventoryWindow"("pinLookupHash");

-- ── GuestPinAccess : retrait du secret, createdBy devient optionnel (auto-création) ──

DROP INDEX IF EXISTS "GuestPinAccess_pinLookupHash_key";
ALTER TABLE "GuestPinAccess" DROP COLUMN IF EXISTS "pinLookupHash";
ALTER TABLE "GuestPinAccess" ALTER COLUMN "createdBy" DROP NOT NULL;
