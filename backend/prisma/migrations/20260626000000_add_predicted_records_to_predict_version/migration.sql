-- Quantités prédites par item (shop × menuItemId) agrégées sur la timeline, requises
-- par le réarmement cross-device (étape Stock). Sans elles, ouvrir le réarmement sur
-- un autre navigateur/session (localStorage vidé) ne donne aucune quantité par item.
-- Tableau JSON, défaut '[]'. Le front n'envoie la clé que NON-VIDE (cf. versionToPayload)
-- → un PATCH sans la clé ne réinitialise PAS la colonne (patch() = champ absent → no-op).
-- NOT NULL DEFAULT '[]' + IF NOT EXISTS : sûr et idempotent sur table peuplée
-- (les lignes existantes héritent de []).
ALTER TABLE public."EventPredictVersion"
  ADD COLUMN IF NOT EXISTS "predictedRecords" jsonb NOT NULL DEFAULT '[]'::jsonb;
