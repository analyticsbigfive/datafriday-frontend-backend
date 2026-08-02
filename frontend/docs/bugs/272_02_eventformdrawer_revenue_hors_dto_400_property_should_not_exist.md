# BUG-272-02 — Sauvegarder un événement mappé échoue : "property revenue should not exist"

- **Statut** : 🟢 Corrigé (2026-08-02)
- **Sévérité** : 🟠 Majeur (bloque totalement la sauvegarde de tout événement rapproché de
  Weezevent dès qu'il a un `revenue` calculé)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend, seul repo touché)
- **Découvert le** : 2026-08-02 (signalé par l'utilisateur)
- **Fichiers** : `src/features/events/dto/create-event.dto.ts`, `src/features/events/events.service.ts`
  (`create()`, `update()`)

## Symptôme

Éditer un événement déjà rapproché de Weezevent (`revenue`/`transactionCount` non-null en base,
peuplés par le pipeline d'agrégation) et cliquer Sauvegarder renvoie une 400 :
`"property revenue should not exist"`.

## Cause racine

`EventFormDrawer.vue` expose 4 champs numériques éditables (`revenue`, `transactionCount`,
`avgSpendPerTx`, `perCapita` — `NumberField`, lignes 430-442) et les envoie dans le payload
`PATCH`/`POST` (`:940-943`) — fonctionnalité présente depuis l'origine du formulaire. Mais
`CreateEventDto`/`UpdateEventDto` (backend) ne déclaraient **aucun** de ces 4 champs, et
`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` (`main.ts`, global) rejette toute
propriété non déclarée du DTO — donc rejette tout le body dès qu'une de ces clés est présente.

**Pourquoi seulement les événements "mappés"** : le payload convertit chaque champ en `undefined`
s'il est `null` (`this.newEvent.revenue != null ? Number(...) : undefined`) — et `JSON.stringify`
(Axios) supprime silencieusement les clés `undefined`. Un événement jamais rapproché a
`revenue = null` en base (ces champs ne sont écrits que par `aggregation.service.ts`, uniquement
pour les événements avec un `weezeventEventId`) → la clé disparaît du payload → pas d'erreur. Un
événement mappé a un `revenue` numérique réel → la clé survit → 400 systématique.

## Correction

Ajout des 4 champs au DTO (`create-event.dto.ts`, hérités par `UpdateEventDto` via
`PartialType`) : `revenue`/`avgSpendPerTx`/`perCapita` (`@IsNumber() @Min(0)`, cohérents avec les
colonnes `Decimal` du schéma) et `transactionCount` (`@IsInt() @Min(0)`), tous `@IsOptional()`.
Câblés dans `events.service.ts` `create()`/`update()` avec le même patron que les autres champs
optionnels (`...(dto.revenue !== undefined && { revenue: dto.revenue })`, etc.) — écriture
seulement si la clé est explicitement envoyée, comportement inchangé pour tout le reste du DTO.

Choix délibéré : **autoriser l'écriture manuelle** plutôt que retirer les 4 champs du formulaire.
Le commentaire du schéma Prisma les qualifie de "calculés", mais aucun code de ce backend ne les a
jamais écrits automatiquement (confirmé par grep exhaustif, cf.
[`docs/modules/07_EVENEMENTS.md`](../modules/07_EVENEMENTS.md), tableau "bugs actifs", entrée #2) —
la saisie manuelle exposée par `EventFormDrawer.vue` était donc, en pratique, le seul moyen prévu
de renseigner ces champs pour un événement non rapproché de Weezevent. Les retirer aurait supprimé
une fonctionnalité UI existante sans que ce soit demandé ; les accepter au contraire la débloque.

## Risque de régression / à surveiller

- L'écriture manuelle peut désormais écraser une valeur posée automatiquement par le pipeline
  d'agrégation (`aggregation.service.ts`) si un utilisateur édite puis sauvegarde un événement
  mappé sans changer ces champs — comportement voulu (le formulaire les affichait déjà en édition
  avant ce fix, donc round-trip sans erreur = pas de nouvelle sémantique, juste "sauver marche
  enfin"), mais à garder en tête si un futur audit compare `revenue` affiché vs recalculé par le
  pipeline.
- `calculatedAt` n'est **pas** mis à jour par une écriture manuelle (pas de champ formulaire dédié,
  hors périmètre de ce fix) — reste la date du dernier passage du pipeline d'agrégation, ou `null`,
  même après une saisie manuelle. À clarifier séparément si cette distinction doit être visible en
  UI.
- Tests `events.service.spec.ts` (67/68, l'échec restant est préexistant et sans rapport, cf.
  commit de vérification) et `events.validation.spec.ts` repassent inchangés.

## Références

- [`docs/modules/07_EVENEMENTS.md`](../modules/07_EVENEMENTS.md) — domaine Événements, tableau
  "bugs actifs", entrée #2 (à nuancer : ces champs sont désormais écrivables manuellement, toujours
  pas de calcul automatique côté backend hors pipeline d'agrégation Weezevent).
