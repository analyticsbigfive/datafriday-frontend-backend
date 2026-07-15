# BUG-002 — Deux règles d'expansion "combo" incompatibles

- **Statut** : 🔴 Ouvert (documenté, non corrigé)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Stock (Logistics)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-15
- **Fichiers** : `logistics.service.ts:407,904` (backend), `EventPredictStockUpSection.vue:636-680` (front)

## Symptôme

Un menu item peut s'expanser différemment selon le contexte : en prévision (Event Predict) vs en
réconciliation de stock (Logistics). Quantités prévues et quantités décomptées peuvent diverger
pour un même item.

## Cause racine

Deux règles de détection "combo" coexistent, héritées de deux époques de modélisation
différentes :
- **Front, Event Predict** (`EventPredictStockUpSection.vue:636-680`) : expanse un menu item
  imbriqué sur `readyForSale==='No'` **seul**.
- **Backend, Logistics** (`logistics.service.ts:407,904`) : exige
  `comboItem==='Yes' && readyForSale==='No'`.

Un item avec `readyForSale='No'` mais `comboItem` non renseigné (ou `'No'`) s'expanse donc en
prévision mais pas en réconciliation de stock.

## Correction

Aucune à ce jour, documenté le 2026-07-15.

## Risque de régression / à surveiller

Choisir une règle cible unique (probablement celle du backend, plus stricte) et l'aligner des deux
côtés. Auditer les données existantes pour repérer les items où `readyForSale='No'` mais
`comboItem≠'Yes'` **avant** de changer la règle en prod — sinon le changement de règle modifie
silencieusement le comportement de prévision/stock pour ces items.

## Références

- `datafriday-web/docs/modules/04_MENU_CATALOGUE.md` §"Bugs actifs confirmés"
