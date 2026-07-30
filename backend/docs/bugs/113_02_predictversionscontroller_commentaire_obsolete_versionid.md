# BUG-113-02 — `predict-versions.controller.ts` : commentaire obsolète référençant une route `:versionId` inexistante

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements / Prévision
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 (audit ciblé du module backend Events)
- **Fichiers** : `src/features/events/predict-versions.controller.ts:66`

## Symptôme

Le commentaire au-dessus de `PUT .../predict-versions/default` dit : "Doit être déclaré AVANT
`:versionId` pour que NestJS le matche en premier". Or `PredictVersionsController` ne déclare
aucune route `:versionId` — `patch`/`remove` par ID de version vivent dans un contrôleur différent
(`PredictVersionsStandaloneController`, `@Controller('predict-versions')`). Le commentaire
référence donc une route qui n'existe pas dans ce contrôleur.

## Cause racine

Vestige d'un refactoring antérieur qui a déplacé `patch`/`remove` vers le contrôleur standalone
sans mettre à jour ce commentaire.

## Correction

Commentaire réécrit pour refléter la réalité : `'default'` est un segment de path statique (pas un
paramètre dynamique), donc aucun risque de collision d'ordre de route ; `patch`/`remove` par ID
vivent dans `PredictVersionsStandaloneController`, un contrôleur distinct.

## Risque de régression / à surveiller

- Changement de commentaire uniquement, aucun impact fonctionnel. `npx tsc --noEmit` propre,
  suite `jest src/features/events` (67 tests) verte après ce changement (groupé avec les autres
  fixes de cette session).

## Références

- Aucune.
