# BUG-253-02 — Import CSV : Home/Visiting Team jamais reliés au catalogue `Team` (texte libre uniquement)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web` (frontend, simplifié) + `api-datafriday-staging`
  (backend, résolution réelle — voir [[120_02_eventsservice_resolveorcreateteambyname]])
- **Découvert le** : 2026-07-28, signalé par l'utilisateur (champs "Home Team"/"Visiting Team"
  vides dans `EventFormDrawer.vue` après import CSV). Confirmé en base : table `Team` du tenant à
  0 ligne malgré des dizaines de noms d'équipes distincts importés (`homeTeamName` correctement
  rempli en texte, `visitingTeamId`/`visitingTeamName` toujours `null`).
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`buildImportRow`)

## Symptôme

Après un import CSV contenant des noms d'équipes ("Paris Basket Ball", "AJ Auxerre", "OGC Nice"…),
les champs "Home Team"/"Visiting Team" du formulaire d'édition restent vides, alors que le texte
brut est bien présent en base sur l'event (`homeTeamName`).

## Cause racine

Contrairement à Type/Catégorie/Sous-catégorie (qui ont chacun une étape dédiée dans l'assistant
d'import), les colonnes "Home Team Name"/"Visiting Team" étaient mappées comme du **texte brut**
passé tel quel dans `homeTeamName`/`visitingTeamName`, sans jamais chercher ni créer d'entrée dans
la table `Team`. `EventFormDrawer.vue` attend pourtant une correspondance dans ce catalogue pour
afficher les deux champs (reverse-lookup par nom pour Home, FK directe `visitingTeamId` pour
Visiting) — catalogue vide = jamais de correspondance possible.

## Correction

**Décision produit (2026-07-28)** : création automatique et silencieuse, sans étape de mapping
visible dans l'assistant.

**Historique du correctif** : une première version résolvait/créait les équipes **côté frontend**
(`resolveTeamsForImport()` dans ce fichier, un `GET /teams` + jusqu'à N `POST /teams` avant la
création des events). Question légitime de l'utilisateur : ce n'était pas la solution la plus
rapide (allers-retours réseau évitables depuis le navigateur) ni la plus propre (Type/Catégorie/
Sous-catégorie exigent au contraire que le client ait déjà résolu un ID, jamais une auto-création
serveur par nom — Team se serait retrouvé à part). **Déplacé côté backend le jour même** : voir
[[120_02_eventsservice_resolveorcreateteambyname]] pour l'implémentation réelle
(`EventsService.resolveOrCreateTeamByName`, appelée depuis `resolveEventTeamFields`).

`CsvImportDrawer.vue` envoie désormais `homeTeamName`/`visitingTeamName` en texte brut, comme
avant le tout premier correctif — c'est `EventsService.create()`/`update()` qui résout-ou-crée
l'équipe dans le catalogue `Team`, en une seule requête, sans round-trip supplémentaire depuis le
navigateur.

## Risque de régression / à surveiller

- Le serveur backend local tourne via `pnpm start` (sans `--watch`, cf.
  [[119_02_createeventdto_sessions_array_objets_reduit_a_vide_class_transformer]]) — un nouveau
  redémarrage manuel est nécessaire pour que le correctif backend prenne effet avant de tester.
- `@vue/compiler-sfc` + `@babel/core` propres, suite `pnpm test:unit` ciblée (94 tests) verte.
- Non exécuté en navigateur — à confirmer par un import réel après redémarrage du backend.

## Références

- [[120_02_eventsservice_resolveorcreateteambyname]] — implémentation réelle, côté backend.
- [[252_02_csvimportdrawer_rate_limit_429_import_masse_echec_definitif]]
