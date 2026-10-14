-- Météo à l'heure du show stockée sur l'event (filtres Analyse « Météo » et « Température »).
-- Colonnes nullables sans défaut : aucun event existant n'est modifié, le rattrapage les remplit.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "weatherCode" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "temperatureC" DOUBLE PRECISION;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "weatherFetchedAt" TIMESTAMP(3);
