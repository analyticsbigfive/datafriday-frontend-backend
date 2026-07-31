-- ⚠️ SUPERSEDED — NE PAS EXÉCUTER (correction du 2026-07-31, post-review) ⚠️
--
-- Le diagnostic ci-dessous ("dérive DDL hors-bande") est probablement erroné. La conversion
-- ElementType → text sur cette colonne a été faite DÉLIBÉRÉMENT le même jour par la branche
-- `rh-consolidation-backend` (CFG-2 Étape 2, migration locale gitignorée
-- `20260731010500_spaceelement_type_enum_to_string`, commit 4fcb81a, 15:35) — vérifiée sur les
-- mêmes 804 lignes avec la même répartition exacte (shop:777, storage:7, fnb_beverages:5,
-- hospitality:3, entrance:3, merchshop:3, kitchen:3, fnb_food:1, entertainment:1, access:1) que
-- celles citées plus bas. Ce n'est pas une coïncidence : les deux fiches décrivent la même base,
-- vue à 27 minutes d'écart par deux personnes qui ne pouvaient pas se voir (ADR 0002 : les
-- migrations Prisma ne sont jamais versionnées).
--
-- Exécuter cet ALTER reviendrait sur le travail CFG-2 (départements custom au-delà des 19 valeurs
-- historiques, désormais impossibles à représenter dans un enum figé) et réintroduirait la même
-- famille d'erreur Prisma, inversée, dès que le code `rh-consolidation-backend` (qui type déjà
-- `SpaceElement.type` en `String`) sera déployé.
--
-- Le vrai correctif pour les 500 sur event-timeline/transaction-baskets/live-status est de
-- déployer ce code (déjà adapté au `String`), pas de reconvertir la colonne. Voir la fiche
-- `backend/docs/bugs/124_01_spaceelement_type_text_vs_enum_prod.md` (section "Correction du
-- 2026-07-31") avant toute action. Fichier conservé tel quel ci-dessous pour trace historique
-- du diagnostic initial (JLH) — ne pas l'appliquer sans revalidation explicite.

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
