-- Téléphone de contact par utilisateur (optionnel). Idempotent.
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;
