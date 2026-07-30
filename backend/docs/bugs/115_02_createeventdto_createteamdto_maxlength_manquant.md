# BUG-115-02 — `CreateEventDto`/`CreateTeamDto.name` sans `@MaxLength(100)`, contrairement à Type/Catégorie/Sous-catégorie

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 (audit ciblé du module backend Events)
- **Fichiers** : `src/features/events/dto/create-event.dto.ts:5`, `dto/create-team.dto.ts:5`

## Symptôme

`CreateEventTypeDto`/`CreateEventCategoryDto`/`CreateEventSubcategoryDto.name` ont tous les trois
`@IsNotEmpty()` + `@MaxLength(100)`. `CreateEventDto.name`/`CreateTeamDto.name` n'avaient que
`@IsString() @IsNotEmpty()`, sans limite de longueur — résidu non fermé de **BUG-72** (backend),
qui avait ajouté `@IsNotEmpty()` aux 5 entités du module mais pas `@MaxLength(100)` à ces deux-là.
Vérifié sur le code actuel avant correction : `@MaxLength` toujours absent.

## Cause racine

BUG-72 a corrigé l'absence de `@IsNotEmpty()` (le symptôme alors observé) sans étendre la
comparaison à `@MaxLength`, qui n'était pas dans son périmètre de constat initial.

## Correction

Ajout de `@MaxLength(100)` sur `CreateEventDto.name` et `CreateTeamDto.name`, alignés sur les 3
autres entités du module. `UpdateEventDto`/`UpdateTeamDto` héritent automatiquement via
`PartialType`, aucun changement nécessaire de leur côté.

## Risque de régression / à surveiller

- Toute donnée existante avec un `name` de plus de 100 caractères continuera de se lire
  normalement (validation appliquée uniquement en écriture) mais ne pourra plus être re-sauvegardée
  telle quelle — aucun cas de ce type identifié en base au moment du fix (non vérifié par requête
  SQL directe, à surveiller si un event/team avec un nom très long existe déjà).
- `npx tsc --noEmit` propre, suite `jest src/features/events` (67 tests) verte.

## Références

- BUG-72 (`docs/bugs/00_INDEX.md` côté `datafriday-web`, fiche miroir non créée ici — constat
  purement backend).
