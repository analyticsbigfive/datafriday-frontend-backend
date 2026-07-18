# BUG-023 — Fonctions Inventory ciblent un ancien backend Supabase Edge Function

- **Statut** : 🟢 Corrigé (2026-07-18)
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

2026-07-18 : les trois fonctions ont des appelants **vivants** (`useReferenceSales`,
`useShoppingList`, `SpaceMenusPanel.vue`, `SpaceRestockView.vue`) qui traitaient tous l'échec
réseau comme un repli vide — elles ne sont donc pas supprimées mais **court-circuitées** dans
`utils/api.js` : plus aucun appel réseau vers le backend legacy, retour direct du repli
(`getShopElementMappings` → `[]`, `getSalesForSpace` → page vide sauf mode démo qui garde son
mock, `getSalesSummaryForSpace` → résumé vide). Comportement observable identique, moins la
latence/erreur réseau garantie. Une vraie migration NestJS (routes équivalentes) reste possible
plus tard — les signatures sont conservées.

## Risque de régression / à surveiller

`fetchReferenceSales` ne passera plus jamais par son chemin « summary dégradé » (le primaire ne
throw plus) — comportement inchangé en pratique (les deux échouaient). Mode démo Inventory :
vérifié, le mock de `getSalesForSpace` est conservé.

## Références

- `docs/modules/06_STOCK_INVENTAIRE.md` §"Tableau récapitulatif — bugs actifs confirmés" #5
