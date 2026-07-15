# BUG-030 — margin-analysis gonfle la marge affichée quand des produits ne sont pas mappés

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Modéré — métrique trompeuse sans avertissement fort
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `weezevent-analytics.controller.ts:208-247`

## Symptôme

La marge affichée par `margin-analysis` est artificiellement élevée quand des produits vendus ne
sont pas mappés à un MenuItem.

## Cause racine

La vente est comptée dans le chiffre d'affaires, mais le coût du produit non mappé (sans MenuItem
associé, donc sans coût connu) est exclu du calcul — la marge s'en trouve mécaniquement gonflée.
Seul `mappingRate` signale indirectement le problème, sans avertissement explicite sur la fiabilité
de la marge elle-même.

## Correction

Aucune à ce jour — au minimum, exposer un avertissement explicite quand `mappingRate` est bas sur
l'endpoint de marge.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #6
