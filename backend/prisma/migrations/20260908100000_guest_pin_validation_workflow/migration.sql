-- Workflow de validation invité PIN — le manager "termine" (submittedAt) mais ne se
-- verrouille plus lui-même : c'est le DIRECTEUR qui valide (validatedAt/validatedBy),
-- verrou réel. Décision produit 2026-09-08, revenue sur le gel immédiat initial
-- ("tout est verrouillé alors que c'est le directeur qui doit vérifier et valider").

ALTER TABLE "GuestPinAccess" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);
ALTER TABLE "GuestPinAccess" ADD COLUMN IF NOT EXISTS "validatedBy" TEXT;
