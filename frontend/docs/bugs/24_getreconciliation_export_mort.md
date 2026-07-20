# BUG-024 — getReconciliation (singulier, logistics.api.js) : export mort

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟢 Faible (code mort)
- **Domaine** : Stock (Logistics)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `logistics.api.js:80`

## Symptôme

Aucun — zéro importeur nulle part.

## Cause racine

Fonction exportée mais jamais utilisée, probablement remplacée par une version pluriel/batch
ailleurs.

## Correction

2026-07-18 : export supprimé de `logistics.api.js` (grep exhaustif reconfirmé : zéro importeur).
La route backend `GET /logistics/reconciliations/:id` existe toujours ; `getReconciliations`
(pluriel) et `downloadReconciliationCsv` restent les chemins vivants.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #7
