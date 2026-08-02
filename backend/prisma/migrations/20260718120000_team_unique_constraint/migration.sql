-- BUG-70 : backstop DB contre la race TOCTOU du check applicatif de createTeam (findFirst avant
-- create(), deux requêtes concurrentes peuvent toutes deux passer le check en base avant que
-- l'une des deux ne commit).
--
-- Vérifié le 2026-07-18 (lecture seule sur la base de dev/staging pointée par DATABASE_URL) :
-- 11 lignes Team au total, aucun doublon existant (comparaison insensible à la casse, même scope
-- tenantId/eventCategoryId/eventSubcategoryId) — la contrainte peut être ajoutée sans backfill/
-- dédoublonnage préalable.
--
-- Limites connues (voir commentaire du modèle Team dans schema.prisma) :
--   - Postgres traite NULL comme distinct de NULL : deux équipes "génériques" (les deux scopes
--     eventCategoryId/eventSubcategoryId null) au même nom ne sont PAS bloquées par cette
--     contrainte, uniquement le cas scopé catégorie/sous-catégorie.
--   - Contrainte sensible à la casse, contrairement au check applicatif (`mode: 'insensitive'`) —
--     un doublon "France"/"france" passerait encore la contrainte DB. Le check applicatif reste
--     la défense principale pour ce cas ; ceci n'est qu'un filet de sécurité pour la race
--     exact-match.
ALTER TABLE "Team" ADD CONSTRAINT "Team_tenantId_eventCategoryId_eventSubcategoryId_name_key"
  UNIQUE ("tenantId", "eventCategoryId", "eventSubcategoryId", "name");
