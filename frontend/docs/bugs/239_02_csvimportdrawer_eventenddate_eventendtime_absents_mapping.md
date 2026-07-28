# BUG-239-02 — `CsvImportDrawer.vue` : `eventEndDate`/`eventEndTime` absents du mapping CSV malgré usage backend réel (multi-jours, fenêtre live)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, en validant un fichier d'exemple réel (`docs/example/events_2026-07-28.csv`, colonnes "Event End Date"/"Event End Time")
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`eventFields`, `doImport`)

## Symptôme

Un fichier CSV avec des colonnes "Event End Date"/"Event End Time" (renseignées pour les
événements multi-jours ou dont la fin diffère de la date de début) voit ces deux colonnes
totalement ignorées par l'import : elles ne sont même pas proposées au mapping à l'étape 2, donc
aucune valeur choisie ne peut leur être associée.

## Cause racine

`eventFields` (`CsvImportDrawer.vue:471+`) ne liste pas `eventEndDate`/`eventEndTime`, alors que ce
sont des champs réels et actifs de `CreateEventDto` (`backend/src/features/events/dto/
create-event.dto.ts:20-21`, `@IsDateString()`/`@IsString()`) et du modèle `Event`
(`schema.prisma:2215-2216`) — utilisés notamment pour l'agrégation des événements multi-jours
(`aggregation.service.ts:249-250`) et le calcul de la fenêtre "live" d'un espace
(`spaces.service.ts:1188/1347`). Un décalage classique entre l'UI de mapping et le contrat API réel
(même famille de cause que BUG-136), découvert cette fois par la data plutôt que par le code.

## Correction

- Ajout de `eventEndDate` (alias `event end date`) et `eventEndTime` (alias `event end time`) à
  `eventFields`, juste après `eventDate`.
- `doImport()` lit ces deux colonnes (`parseDate`/`parseTime`, même traitement que
  `eventDate`/`doorsOpen`) et les ajoute au payload.

## Risque de régression / à surveiller

- Non vérifié en navigateur (cf. BUG-236/237/238-02). Tester un import avec une ligne où "Event End
  Date" diffère de "Event Date" (ex. événement multi-jours) et vérifier sur la fiche événement que
  `eventEndDate` est bien posé.
- **Qualité de données à surveiller, non corrigée ici (hors périmètre code)** : certaines lignes de
  fichiers réels contiennent un `eventEndDate` **antérieur** à `eventDate` (ex. lignes "(Prévision)"
  visiblement des gabarits de prévision avec dates placeholder). `resolveEvent*`/`aggregation.service.ts`
  ne valident pas cet ordre — un import de telles lignes créera un événement avec une fenêtre
  [eventDate, eventEndDate] inversée, dont l'effet sur l'agrégation multi-jours n'a pas été vérifié.
  À trancher : nettoyer la donnée source, ou ajouter une validation explicite (front ou DTO) si ce
  cas doit être bloqué plutôt que silencieusement accepté.

## Références

- [BUG-238-02](238_02_csvimportdrawer_champs_taxonomie_perdus_silencieusement.md) — même famille de
  cause (mapping UI ↔ contrat API désynchronisés)
- `backend/src/features/aggregation/aggregation.service.ts:249-250`,
  `backend/src/features/spaces/spaces.service.ts:1188,1347` (usages réels de `eventEndDate`)
