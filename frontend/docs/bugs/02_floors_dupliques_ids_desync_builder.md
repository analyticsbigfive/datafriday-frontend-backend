# BUG-002 — Floors dupliqués / IDs désynchronisés dans le builder

- **Statut** : 🟢 Corrigé (auto-réparation)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-06-27

## Symptôme

Des étages (floors) apparaissaient dupliqués, ou leurs ids se désynchronisaient entre deux
sauvegardes du builder.

## Cause racine

`getConfiguration` ne fusionnait pas les floors par `level` de façon stable ; `saveConfiguration`
ne retournait pas les ids réellement persistés côté backend.

## Correction

`getConfiguration` fusionne désormais par `level`, `saveConfiguration` retourne les ids réels — le
front s'auto-répare au chargement suivant.

## Risque de régression / à surveiller

—

## Références

- —
