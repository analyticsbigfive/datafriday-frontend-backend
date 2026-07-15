# BUG-024 — getReconciliation (singulier, logistics.api.js) : export mort

- **Statut** : 🔴 Ouvert
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

Aucune à ce jour — à supprimer si confirmé définitivement mort.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #7
