# BUG-003 — Badge étage réinitialisé dans StepMapShops (wizard d'intégration)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur/UX
- **Domaine** : Intégrations & ventes (wizard)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-06-29

## Symptôme

Le badge d'étage affiché dans `StepMapShops` (wizard d'intégration) se réinitialisait de façon
inattendue en cours de parcours.

## Cause racine

Le front reconstruisait mal la `floorMap` ; le backend ne renvoyait pas `externalMerch` de façon
directement exploitable pour cette reconstruction.

## Correction

Front : reconstruction correcte de la `floorMap`. Backend : requête `externalMerch` adaptée.

## Risque de régression / à surveiller

—

## Références

- —
