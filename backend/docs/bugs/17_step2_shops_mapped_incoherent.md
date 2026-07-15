# BUG-017 — step2_shops_mapped calculé différemment entre route unitaire et route bulk

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation (wizard Mappings)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `mappings.service.ts:750-765` vs `:902-904`

## Symptôme

Comparer `GET /mappings/progress/:locationId` et `GET /mappings/progress` pour la même location
après un mapping fait uniquement via l'endpoint merchant-element : les deux donnent un
`step2_shops_mapped` différent.

## Cause racine

Deux implémentations distinctes du calcul de progression sur les mêmes lignes de
`LocationShopMapping`, une pour la route unitaire, une pour la route bulk, qui ne comptent pas de
la même façon.

## Correction

Aucune à ce jour — unifier sur une seule fonction de calcul.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #4
