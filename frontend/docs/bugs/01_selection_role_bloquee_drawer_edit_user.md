# BUG-001 — Sélection de rôle impossible dans le drawer Edit user

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (impossible de changer le rôle d'un utilisateur)
- **Domaine** : RBAC / Users
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-06-27

## Symptôme

Impossible de sélectionner un rôle dans le drawer "Edit user" — le menu déroulant (`v-select`)
restait invisible ou inaccessible au clic.

## Cause racine

Conflit de `z-index` entre le drawer et le menu déroulant du `v-select` : le menu s'ouvrait
derrière le drawer.

## Correction

`:menu-props` avec `zIndex: 10000` forcé sur le `v-select`.

## Risque de régression / à surveiller

Vérifier ce pattern (z-index menu vs drawer) sur tout nouveau `v-select` ajouté à l'intérieur d'un
drawer ou d'un dialog.

## Références

- —
