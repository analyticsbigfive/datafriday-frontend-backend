-- BUG-145-01 / fiche 146-01 — Correction des dates de SFP-Montauban (Stade Jean Bouin).
-- APPLICATION MANUELLE UNIQUEMENT (ADR-0002). Ne rien exécuter d'autre que ce fichier.
--
-- Constat (vérifié en base le 24/08/2026) : l'event 9b9a2ee3-5a66… « SFP-Montauban » porte
-- eventDate 2025-09-20 alors que le match a réellement eu lieu le 2025-09-06
-- (eventStartDate/eventEndDate sont déjà au 06/09). Une date de FIN antérieure à la date
-- de DÉBUT rendait sa fenêtre Analyse invalide : l'event affichait 0 EUR dans l'Analyse
-- alors que ses agrégats (89 182,24 EUR) existent.
--
-- CE QUE CA MODIFIE : 1 ligne de la table "Event" (colonne eventDate uniquement).
-- Effet visible : SFP-Montauban cesse d'afficher 0 EUR dans l'Analyse.
--
-- CONTRÔLE AVANT (attendu : eventDate = 2025-09-20, start/end = 2025-09-06) :
--   SELECT id, name, "eventDate", "eventStartDate", "eventEndDate", "eventEndTime"
--   FROM "Event" WHERE id = '9b9a2ee3-c087-4d35-a812-b73fcc148a72';

UPDATE "Event"
SET "eventDate" = '2025-09-06 00:00:00'
WHERE id = '9b9a2ee3-c087-4d35-a812-b73fcc148a72'
  AND "tenantId" = 'cmrpf3ukw0001bdu2h6rz0vbz'
  AND "eventDate" = '2025-09-20 00:00:00';

-- CONTRÔLE APRÈS (attendu : 1 ligne, les 3 dates au 2025-09-06) :
--   SELECT id, name, "eventDate", "eventStartDate", "eventEndDate"
--   FROM "Event" WHERE id = '9b9a2ee3-c087-4d35-a812-b73fcc148a72';
--
-- RETOUR ARRIÈRE :
--   UPDATE "Event" SET "eventDate" = '2025-09-20 00:00:00'
--   WHERE id = '9b9a2ee3-c087-4d35-a812-b73fcc148a72';
