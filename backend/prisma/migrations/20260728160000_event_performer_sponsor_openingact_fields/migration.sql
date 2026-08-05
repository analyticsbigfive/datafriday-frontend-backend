-- BUG-238/239 : l'import CSV d'événements proposait "Nom du performer"/"Sponsor"/"Nom de
-- l'opening act" au mapping alors qu'aucune colonne Event ne les stockait (ValidationPipe
-- forbidNonWhitelisted rejetait toute ligne les renseignant tant qu'ils n'étaient pas retirés du
-- payload, cf. docs/bugs/136_*.md) — décision produit tranchée le 2026-07-28 : leur donner un vrai
-- foyer plutôt que de les retirer définitivement du mapping. Texte libre, pas de FK catalogue
-- (contrairement à homeTeamName/visitingTeam, ces trois champs n'ont pas de référentiel dédié
-- aujourd'hui) — colonnes nullables, aucun backfill nécessaire.
ALTER TABLE "Event" ADD COLUMN "performerName" TEXT;
ALTER TABLE "Event" ADD COLUMN "sponsor" TEXT;
ALTER TABLE "Event" ADD COLUMN "openingActName" TEXT;
