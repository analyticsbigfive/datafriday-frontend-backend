-- BUG-34 : Event.spaceId/configurationId n'avaient aucune FK Prisma vers Space/Config, malgré
-- des ownership checks désormais en place côté service (2026-07-24). Sans contrainte, un Space ou
-- un Config supprimé pouvait laisser des Event orphelins en silence.
--
-- Nettoyage préalable effectué le 2026-07-24 (lecture puis écriture directes sur la base pointée
-- par DATABASE_URL, sur autorisation explicite de l'utilisateur) : 20 lignes Event.spaceId et 5
-- lignes Event.configurationId pointaient vers un id inexistant (Space/Config supprimé depuis).
-- Ce sont de VRAIS events historiques (ex. séries "STADE FRANÇAIS" 2019-2026, "Paris SG vs OL
-- Lyonnais", etc.), pas des données de test — décision : SET NULL sur la référence cassée plutôt
-- que de deviner un rattachement à un espace/config actuel, l'Event et son historique (CA,
-- ventes, KPIs) restent intacts. Vérifié après coup : 0 orphelin restant sur les deux colonnes.
--
-- Sémantique de la FK, en cohérence avec ce nettoyage : ON DELETE SET NULL (pas CASCADE) — la
-- suppression d'un Space/Config ne doit jamais supprimer l'historique d'un Event, seulement
-- détacher la référence.
ALTER TABLE "Event" ADD CONSTRAINT "Event_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_configurationId_fkey"
  FOREIGN KEY ("configurationId") REFERENCES "Config"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- configurationId n'avait pas d'index (contrairement à spaceId) alors qu'il est maintenant une
-- FK activement utilisée par l'ownership check ajouté à events.service.ts.
CREATE INDEX "Event_configurationId_idx" ON "Event"("configurationId");
