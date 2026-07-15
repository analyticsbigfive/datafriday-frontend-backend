# BUG-023 — Fonctions Inventory ciblent un ancien backend Supabase Edge Function

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur (appels API garantis en échec)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `utils/api.js:5,680-743`, `utils/supabase/info.js`

## Symptôme

Backend `api-datafriday-staging` : zéro route `/shop-element-mappings` (grep confirmé) — tout
appel à ces fonctions échoue.

## Cause racine

`getShopElementMappings`/`getSalesForSpace`/`getSalesSummaryForSpace` ciblent encore un ancien
projet Supabase Edge Function, jamais mis à jour vers l'API NestJS actuelle.

## Correction

Aucune à ce jour — soit migrer ces fonctions vers l'API NestJS, soit confirmer qu'elles sont mortes
et les supprimer.

## Risque de régression / à surveiller

Vérifier d'abord si un code vivant appelle encore ces fonctions avant de les toucher.

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #5
