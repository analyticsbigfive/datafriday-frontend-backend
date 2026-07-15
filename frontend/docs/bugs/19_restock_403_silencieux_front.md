# BUG-019 — Restock 403 : le front avale l'erreur sans jamais prévenir l'utilisateur

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Bloquant — perte silencieuse de travail
- **Domaine** : Stock (Réarmement)
- **Repo(s) concerné(s)** : les deux — cause racine côté backend, voir `api-datafriday-staging/docs/bugs/31_restock_403_silencieux_roles_board.md`
- **Découvert le** : 2026-07-15
- **Fichiers** : `SpaceRestockView.vue:2154-2165` (`persistRestockState`), `restock.api.js:18-22` (`onRestockApiError`)

## Symptôme

Voir la fiche backend liée : les rôles "Technicien Logistic"/"PDV Superviseur" reçoivent un 403
permanent sur `PUT /restock-state`, mais aucun toast ni bandeau d'erreur n'apparaît côté front —
l'état semble sauvegardé (persisté en `localStorage`) alors qu'il ne traverse jamais vers l'API.

## Cause racine

`persistRestockState()` avale l'erreur du `PUT` silencieusement (`.catch((err) => onRestockApiError(err))`,
pas de toast), et `onRestockApiError` ne bascule le flag "API down" que sur une erreur **non-4xx**
— un 403 reste donc considéré comme "API joignable" et le code retente à chaque frappe,
indéfiniment, sans jamais prévenir l'utilisateur.

## Correction

Aucune à ce jour — indépendamment du fix côté permissions backend, le front doit aussi remonter une
alerte explicite sur un 403 plutôt que le traiter comme "API joignable, retenter en silence".

## Risque de régression / à surveiller

Ce comportement de gestion d'erreur masque tout futur problème de permission similaire sur cet
écran — corriger la gestion d'erreur, pas seulement le cas précis des deux rôles actuels.

## Références

- `api-datafriday-staging/docs/bugs/31_restock_403_silencieux_roles_board.md`
