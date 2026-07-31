-- BUG-124 : "SpaceElement"."type" était en `text` en prod alors que le schéma Prisma la déclare
-- enum "ElementType" — le client Prisma type ses paramètres en "ElementType"[], d'où
-- « operator does not exist: text = "ElementType" … You might need to add explicit type casts »
-- (500 sur GET /spaces/:id/event-timeline, /transaction-baskets et /live-status, pour TOUS les
-- espaces, via resolveShopIdsForSpace — spaces.service.ts).
--
-- L'enum "ElementType" existe déjà en prod avec les 19 valeurs attendues (dont merchshop et
-- fnb_icecream) ; seule la colonne n'a jamais été convertie (dérive DDL hors-bande, cf. ADR 0002).
-- Vérifié le 2026-07-31 sur datafriday-dev (base prod de datafriday-api.onrender.com) :
--   - 804 lignes, 0 valeur de la colonne hors labels de l'enum ;
--   - pas de DEFAULT, colonne NOT NULL, aucun index référençant "type" ;
--   - la RPC get_space_shop_details compare "type" à des littéraux chaîne et via ::text →
--     compatible enum, aucun impact.
--
-- Application : psql "$DIRECT_URL" -f backend/prisma/sql/2026-07-31_spaceelement_type_text_vers_enum.sql
-- (connexion directe port 5432, jamais le pooler — cf. backend/prisma/sql/README.md).

-- Garde-fou : échoue proprement si une valeur non castable est apparue depuis la vérification.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "SpaceElement"
    WHERE "type" NOT IN (
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ElementType'
    )
  ) THEN
    RAISE EXCEPTION 'BUG-124 : valeurs "SpaceElement"."type" hors enum "ElementType" — migration abandonnée, corriger les données avant de relancer';
  END IF;
END
$$;

ALTER TABLE "SpaceElement"
  ALTER COLUMN "type" TYPE "ElementType" USING "type"::"ElementType";
