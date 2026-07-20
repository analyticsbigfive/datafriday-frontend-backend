# BUG-102 — QA `simulateSale` visible dans les analytics réels ; fenêtre de course du `reset`

- **Statut** : ⚪ Diagnostiqué (comportements connus et commentés dans le code — pas de fix cette session)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Stock (Logistique)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18 (formalisation ; les deux comportements sont déjà annotés en code)
- **Fichiers** : `src/features/logistics/logistics.service.ts:1499` (warning simulateSale), `:1256-1259` (race reset)

## Symptôme

1. `POST /logistics/:spaceId/simulate-sale` (outil QA) écrit de **vraies** lignes `SalesTransaction`/items : elles apparaissent dans le CA et les dashboards tant que `purgeSimulatedSales` n'a pas tourné.
2. `reset` calcule le stock attendu AVANT sa transaction : un mouvement/vente concurrent tombe dans l'intervalle et n'est absorbé qu'au prochain inventaire (course documentée).

## Cause racine

1. Simulation en table réelle (pas de flag d'exclusion analytics au moment de l'agrégation).
2. Lecture pré-transactionnelle assumée (verrouiller tout le périmètre serait disproportionné).

## Correction

Aucune — arbitrages existants assumés, formalisés ici pour le tracker. Si la pollution analytics devient un problème réel : exclure `metadata.simulated` des agrégats (cf. warning en code).

## Risque de régression / à surveiller

Tout nouveau consommateur d'agrégats ventes doit connaître l'existence des lignes simulées.

## Références

- Fiche 95 (reset — perf, corrigée)
