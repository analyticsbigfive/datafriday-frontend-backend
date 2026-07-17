# BUG-73 — `CreateEventDto` : `ticketsSold`/`ticketsScanned`/`numberOfSessions` sans borne minimale

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/dto/create-event.dto.ts:15,22,23`

## Symptôme

`ticketsSold`/`ticketsScanned`/`numberOfSessions` sont `@IsInt()` uniquement — un
`ticketsSold: -100` est accepté et persisté tel quel, sans erreur de validation.

## Cause racine

Décorateur `@Min(0)` manquant sur ces trois champs (aucun champ numérique du DTO n'en a).

## Correction

Ajout de `@Min(0)` sur `ticketsSold`, `ticketsScanned`, `numberOfSessions` dans `CreateEventDto`
(et `UpdateEventDto`, qui étend les mêmes champs en optionnel).

## Risque de régression / à surveiller

Vérifier qu'aucun flux existant n'envoie de valeurs négatives comme convention interne (aucun trouvé
côté frontend — validation JS déjà en place mais insuffisante, voir fiche frontend correspondante).

## Références

- `docs/modules/07_EVENEMENTS.md`
