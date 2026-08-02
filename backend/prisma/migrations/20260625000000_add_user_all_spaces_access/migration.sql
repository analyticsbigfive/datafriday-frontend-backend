-- Accès à TOUS les espaces (présents et futurs), par utilisateur, découplé du rôle.
-- Idempotent.
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "allSpacesAccess" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "User_allSpacesAccess_idx"
  ON public."User"("allSpacesAccess")
  WHERE "allSpacesAccess" = true;
