-- Migration: looseUnits Int → Float sur InventoryCount
--
-- L'UI de comptage permet des valeurs décimales pour les unités en vrac
-- (ex: 0.5 kg, 1.5 L). Le backend rejetait ces valeurs avec @IsInt() + INTEGER.
-- On passe looseUnits en DOUBLE PRECISION pour accepter les décimaux.
-- packedUnits reste INTEGER (cartons entiers uniquement).

ALTER TABLE "InventoryCount"
  ALTER COLUMN "looseUnits" TYPE DOUBLE PRECISION
  USING "looseUnits"::DOUBLE PRECISION;
