-- numberOfUnitsRecipe passe de Int à Float : ~40% des lignes du CSV historique Components
-- (2026-07-30) ont un rendement de recette fractionnaire (ex. 0.750 kg), rejeté par le Int actuel.
ALTER TABLE "MenuComponent" ALTER COLUMN "numberOfUnitsRecipe" TYPE DOUBLE PRECISION USING "numberOfUnitsRecipe"::DOUBLE PRECISION;
