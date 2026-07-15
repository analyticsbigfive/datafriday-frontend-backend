# BUG-006 — Perte de TVA lors du bulk auto-map

- **Statut** : 🟡 Corrigé partiellement (backfill fait) — doublons orphelins résiduels ouverts
- **Sévérité** : 🟠 Majeur (TVA)
- **Domaine** : Intégrations & ventes / Menu & recettes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-06-30

## Symptôme

Après un `bulkCreateAndMap`, le `vatRate` du menu item créé restait vide/0.

## Cause racine

`bulkCreateAndMap` n'envoyait pas `vatRate` à la création du menu item.

## Correction

Fix appliqué + backfill des 1408 items affectés (2026-06-30).

## Risque de régression / à surveiller

Des **doublons orphelins** créés pendant la période du bug restent en base, non nettoyés — à
traiter dans un chantier séparé (identifier et purger/fusionner ces doublons).

## Références

- `08_tva_defaut_20_incorrecte.md`
- `07_prix_fnb_weezevent_absent.md`
