# BUG-136 — `CsvImportDrawer.vue` : champs hors DTO → 400 garanti (`forbidNonWhitelisted`) sur toute ligne enrichie

- **Statut** : 🟢 Corrigé (partiel — voir décision en attente)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web` (root cause côté contrat, `api-datafriday-staging`)
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue:669-698` (avant correction) ;
  `api-datafriday-staging/src/main.ts:86-87` (`ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true })`)

## Symptôme

Le payload envoyé à `POST /events` par l'étape 8 (`doImport`) incluait des clés
`doorsOpen`/`showTime`/`performerName`/`visitingTeam`/`sponsor`/`allSessions`/`openingActName` — 7
des 19 champs proposés au mapping des colonnes CSV, prominents dans l'UI ("Ouverture des portes",
"Nom du performer", "Sponsor"…). Aucune de ces clés n'existe sur `CreateEventDto`. Le backend a
`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` globalement — toute clé inconnue
dans le body fait **rejeter la requête entière** en 400 (`property X should not exist`). Résultat :
n'importe quelle ligne CSV renseignant l'une de ces 7 colonnes échouait à 100% (visible comme
"erreur" par ligne dans le résumé d'import, mais silencieusement inévitable). `EventFormDrawer.vue`
contourne déjà ce même piège pour `homeTeamId` avec un commentaire explicite (`:874-877`) — la
contrainte était donc déjà connue de l'équipe, juste pas répercutée sur cet importeur.

## Cause racine

L'importeur CSV a été construit avec un jeu de champs plus riche que ce que `CreateEventDto`
expose réellement côté backend — dérive entre l'UI de mapping et le contrat API réel, jamais
détectée faute de test avec des colonnes renseignées sur ces champs précis.

## Correction

- `doorsOpen`/`showTime` → packés dans `sessions: [{ doorsOpening, showTime }]`, le format array
  d'objets réellement attendu par `CreateEventDto.sessions` (`@IsArray()`) — vérifié compatible
  avec le lecteur `parseEventSessions` (utilitaire partagé, idempotent objets/strings,
  `tests/unit/eventSessions.spec.js`).
- `visitingTeam` (texte libre) → renommé `visitingTeamName`, champ réel du DTO.
- `performerName`/`sponsor`/`openingActName`/`allSessions` → **retirés du payload envoyé** (aucun
  champ `Event` ne les stocke, cf. décision ci-dessous) pour que l'import cesse de rejeter
  systématiquement les lignes qui les renseignent.

## Risque de régression / à surveiller

Le mapping CSV propose toujours ces 4 colonnes à l'utilisateur alors qu'elles sont maintenant
silencieusement ignorées à l'import (plus de crash, mais toujours une perte de données sans
avertissement) — voir décision produit en attente ci-dessous, à trancher avant d'aller plus loin.
Tester un import avec toutes les colonnes renseignées : succès garanti désormais, mais vérifier que
`sessions`/`visitingTeamName` sont bien lisibles ensuite sur la fiche event.

## Décision produit en attente

Deux options, à trancher (voir message de fin d'audit) :
1. Ajouter les colonnes `performerName`/`sponsor`/`openingActName` (+ un vrai format pour
   `allSessions`) au modèle `Event`/DTO/service, pour que ces données CSV aient un vrai foyer.
2. Retirer ces 4 champs du mapping CSV (`eventFields`) pour ne plus promettre une capacité qui
   n'existe pas.

## Références

- `docs/modules/07_EVENEMENTS.md` (champ `sessions`, format `{doorsOpening, showTime}`)
- `EventFormDrawer.vue:874-877` (commentaire déjà existant sur le même piège `forbidNonWhitelisted`)
