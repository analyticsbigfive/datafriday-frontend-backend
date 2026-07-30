# BUG-116-02 — `CreateEventDto` : `@Type(() => Number)` manquant sur les champs numériques

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 (audit ciblé du module backend Events)
- **Fichiers** : `src/features/events/dto/create-event.dto.ts` (`numberOfSessions`,
  `ticketsSold`, `ticketsScanned`)

## Symptôme

`numberOfSessions`/`ticketsSold`/`ticketsScanned` de `CreateEventDto` n'avaient que
`@IsOptional() @IsInt() @Min(0)`, sans `@Type(() => Number)` (`class-transformer`) — alors que tous
les champs numériques équivalents de `predict-version.dto.ts` (`totalRevenue`, `perCapita`, etc.)
l'ont systématiquement. Sans ce décorateur, une valeur numérique arrivant en string (ex. paramètre
de query, ou certains clients HTTP qui sérialisent tout en texte) échouerait la validation
`@IsInt()` au lieu d'être coercée.

## Cause racine

Incohérence de style entre les DTO du module, sans qu'aucun cas de régression concret n'ait été
signalé — les payloads JSON habituels arrivent déjà typés en nombre côté client.

## Correction

Ajout de `@Type(() => Number)` (avant `@IsInt()`, ordre cohérent avec `predict-version.dto.ts`) sur
les 3 champs. `UpdateEventDto` hérite automatiquement via `PartialType`.

## Risque de régression / à surveiller

- Additif et non-breaking : coercition supplémentaire d'une string numérique vers un nombre, ne
  change rien pour les payloads déjà numériques.
- `npx tsc --noEmit` propre, suite `jest src/features/events` (67 tests) verte.

## Références

- Aucune.
