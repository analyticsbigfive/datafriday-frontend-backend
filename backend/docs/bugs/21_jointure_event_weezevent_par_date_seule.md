# BUG-021 — Jointure Event ↔ WeezeventEvent par égalité de DATE seule dans la RPC

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur (latent — pas de cas observé aujourd'hui)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : RPC `20260704200000_...sql:175-178,224-227` (`get_space_shop_details`)

## Symptôme

Deux events Weezevent le même jour calendaire sur le même espace risquent d'être confondus par la
jointure.

## Cause racine

La RPC `get_space_shop_details` joint `Event` DataFriday et `WeezeventEvent` par égalité de date
seule, sans autre discriminant (nom, heure, id externe).

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

Le risque augmente avec le nombre d'événements multi-quotidiens sur un même espace — à surveiller
si ce cas d'usage se développe.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #8
