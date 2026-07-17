# BUG-72 — `CreateEventDto.name`/`CreateTeamDto.name` : chaîne vide acceptée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/dto/create-event.dto.ts:5`,
  `src/features/events/dto/create-team.dto.ts:5`

## Symptôme

`POST /events` et `POST /teams` avec `name: ""` sont acceptés et créent une ligne avec un nom vide.
`CreateEventTypeDto`/`CreateEventCategoryDto`/`CreateEventSubcategoryDto` ont tous trois
`@IsNotEmpty()` (+ `@MaxLength(100)`) sur `name` ; `CreateEventDto`/`CreateTeamDto` n'ont que
`@IsString()`.

## Cause racine

Incohérence entre les DTO de taxonomie (corrects) et ceux d'`Event`/`Team` (incomplets) — oubli,
pas un choix.

## Correction

Ajout de `@IsNotEmpty()` sur `CreateEventDto.name` et `CreateTeamDto.name`.

## Risque de régression / à surveiller

Vérifier qu'aucun appelant existant (front, scripts) n'envoie `name: ""` intentionnellement (aucun
trouvé côté frontend lors de l'audit).

## Références

- `docs/modules/07_EVENEMENTS.md`
