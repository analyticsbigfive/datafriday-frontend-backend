-- Live : courbe prédite par minute figée dans la version Event Predict, affichée en fond de
-- la timeline de l'événement en cours. Additif, nullable, sans valeur par défaut : aucune
-- réécriture de table, les versions existantes restent à NULL (pas de fond prédit).
ALTER TABLE "EventPredictVersion" ADD COLUMN IF NOT EXISTS "predictedTimeline" JSONB;
