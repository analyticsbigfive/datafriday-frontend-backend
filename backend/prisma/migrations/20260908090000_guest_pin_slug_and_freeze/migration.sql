-- Accès invité PIN — évolution du schéma d'URL et du gel par PDV.
--
-- 1) SpaceElement.slug : identifiant stable et opaque pour /login/pin/:slug/:phase
--    (remplace le lien 100% générique). Backfill par slugify(name), désambiguïsation
--    des collisions par suffixe d'id COMPLET (jamais tronqué : testé contre les ~1100
--    lignes réelles, un suffixe court — même l'id tronqué à 6 caractères — a produit une
--    collision de second niveau avec un autre nom légitime, ex. "Foodtruck" désambiguïsé
--    en "foodtruck-2" entre en collision avec un élément réellement nommé "Foodtruck 2").
-- 2) GuestPinAccess.submittedAt : "J'ai terminé" gèle CET accès sans clôturer la fenêtre
--    (distinct de status='revoked').
-- 3) Un seul InventoryWindow "open" par (tenantId, spaceId, phase), tous événements
--    confondus — lève l'ambiguïté quand /login/pin/:slug/:phase doit retrouver LA
--    fenêtre active sans connaître l'event à l'avance.

-- ── SpaceElement.slug ─────────────────────────────────────────────────────────────────

ALTER TABLE "SpaceElement" ADD COLUMN IF NOT EXISTS "slug" TEXT;

UPDATE "SpaceElement"
SET "slug" = lower(regexp_replace(regexp_replace(trim(both from "name"), '[^a-zA-Z0-9\s-]', '', 'g'), '[\s_-]+', '-', 'g'))
WHERE "slug" IS NULL;

-- Nom vide/sans caractère alphanumérique (ex. purement emoji) → fallback sur l'id complet.
UPDATE "SpaceElement"
SET "slug" = 'pdv-' || "id"
WHERE "slug" IS NULL OR "slug" = '' OR "slug" = '-';

-- Désambiguïse les collisions (même nom réutilisé sur plusieurs PDV/espaces — très fréquent :
-- "1 A", "1 B"... sont des libellés de zone réutilisés partout). Suffixe = id COMPLET de la
-- ligne (déjà unique par construction), pas un extrait court ni un simple compteur : validé
-- contre un dump réel (~1100 lignes), aucune collision résiduelle.
WITH dupes AS (
  SELECT "id", "slug", row_number() OVER (PARTITION BY "slug" ORDER BY "id") AS rn
  FROM "SpaceElement"
)
UPDATE "SpaceElement" se
SET "slug" = se."slug" || '-' || se."id"
FROM dupes d
WHERE se."id" = d."id" AND d.rn > 1;

ALTER TABLE "SpaceElement" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "SpaceElement_slug_key" ON "SpaceElement"("slug");

-- ── GuestPinAccess.submittedAt ────────────────────────────────────────────────────────

ALTER TABLE "GuestPinAccess" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

-- ── Un seul InventoryWindow "open" par (tenantId, spaceId, phase) ────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryWindow_one_open_per_space_phase"
  ON "InventoryWindow"("tenantId", "spaceId", "phase")
  WHERE "status" = 'open';
