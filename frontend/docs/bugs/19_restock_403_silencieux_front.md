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

**Volet front corrigé (2026-07-18)** : `persistRestockState` (`SpaceRestockView.vue`) alerte
désormais explicitement sur 401/403 — snackbar erreur (clé i18n `srSnackSaveForbidden`), une fois
par session (le PUT part à chaque frappe débouncée, pas de spam). L'utilisateur sait que ses
modifications ne sont conservées que sur son navigateur.

**Bonus même zone** : `putRestockState` (`restock.api.js`) envoie désormais aussi
`stockExcluded`/`currentStep` (le backend actuel stocke un blob jsonb opaque — champs tolérés),
avec retry défensif sur le noyau 9-champs si le backend déployé est une version antérieure encore
en whitelist stricte.

**Le fond (permissions backend, rôles restockBoard) reste à trancher** — voir fiche backend BUG-31
(mise à jour 2026-07-18) et `QUESTIONS_A_BERTRAND.md`.

## Risque de régression / à surveiller

Ce comportement de gestion d'erreur masque tout futur problème de permission similaire sur cet
écran — corriger la gestion d'erreur, pas seulement le cas précis des deux rôles actuels.

## Références

- `api-datafriday-staging/docs/bugs/31_restock_403_silencieux_roles_board.md`
