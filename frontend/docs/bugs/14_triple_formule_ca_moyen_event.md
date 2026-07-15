# BUG-014 — Triple formule "CA moyen par event", définitions incohérentes d'"event valide"

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur (métriques affichées incohérentes entre elles)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `useMetricsCalculator.js:39-80`, `analyse.js:71-107`, `AnalyseView.vue:695-727`

## Symptôme

Sélectionner une période avec un event à CA nul parmi d'autres à CA positif fait apparaître des
valeurs de "CA moyen par event" incohérentes entre plusieurs endroits de l'écran.

## Cause racine

Trois implémentations distinctes de la formule "CA moyen par event" coexistent, avec deux
définitions différentes de ce qu'est un "event valide" affichées côte à côte (valeur vs variation).

## Correction

Aucune à ce jour — factoriser en une seule fonction partagée avec une définition unique d'"event
valide".

## Risque de régression / à surveiller

—

## Références

- `docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #9
