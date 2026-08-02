-- Super-admin PLATEFORME (cross-tenant), distinct du rôle ADMIN d'organisation.
-- Idempotent : peut être rejoué sans risque (cf. convention make prod-migrate).

ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Index partiel : accélère le filtrage des (rares) super-admins.
CREATE INDEX IF NOT EXISTS "User_isSuperAdmin_idx"
  ON public."User"("isSuperAdmin")
  WHERE "isSuperAdmin" = true;
