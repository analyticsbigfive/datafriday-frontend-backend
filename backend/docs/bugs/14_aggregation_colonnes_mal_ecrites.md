# BUG-014 — AggregationService écrit menuItemId dans spaceElementId, duplique locationId dans weezeventMerchantId

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🔴 Bloquant (CA affiché à 0 alors que des ventes existent)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `aggregation.service.ts:274-276`, RPC `20260704200000_...sql:296-306`

## Symptôme

Lancer "Traiter les événements" dans le wizard sur un espace, puis observer `shops[].revenue` dans
la réponse `GET /spaces/:id/shop-details` : à 0 ou incohérent malgré des ventes réelles agrégées.

## Cause racine

Le pipeline d'agrégation réellement exécuté (`AggregationService`) écrit un `menuItemId` dans la
colonne `spaceElementId`, et duplique `locationId` dans `weezeventMerchantId`. La jointure "shops
list" de la RPC de lecture attend un vrai `spaceElementId`/`weezeventMerchantId` — elle ne peut donc
jamais matcher ces lignes.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

Corriger implique un backfill des lignes déjà agrégées avec ces colonnes inversées/dupliquées —
sinon les données historiques restent fausses même après le fix du code d'écriture.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #1
