# BUG-002 — Deux règles d'expansion "combo" incompatibles

- **Statut** : 🟢 Corrigé (2026-07-24)
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

**Correction appliquée (2026-07-24)** — décision Bertrand (Question #18,
`frontend/docs/QUESTIONS_A_BERTRAND.md` / `frontend/docs/REPONSES_QUESTIONS_2026-07-24.md`) : un
menu item `comboItem==='Yes'` s'explose TOUJOURS en ses menu items constitutifs, indépendamment de
son propre `readyForSale` ; chaque constituant suit ensuite les règles standard (mono-ingrédient /
`readyForSale` / recette). Règle unifiée aux 3 endroits dupliqués à dessein :
- Backend `backend/src/features/logistics/logistics.service.ts` : filtre de frontière combo
  (`loadRecipeContext:505`, `explodeSalesToConsumption:1202`) ne requiert plus
  `readyForSale==='No'` en plus de `comboItem==='Yes'` ; `itemRefsForMenuItem:578-596` et
  `perUnit` (dans `explodeSalesToConsumption:1284-1287`) n'entrent plus dans la branche
  "self as readyForSale=Yes" quand `comboItem==='Yes'`.
- Front Stock up `frontend/src/components/EventPredictStockUpSection.vue:649-708`
  (`expandMenuItem`) : idem, `comboItem==='Yes'` déclenche l'explosion même si
  `readyForSale==='Yes'`.
- Front Inventaire `frontend/src/utils/inventoryUtils.js:257-290`
  (`buildConsolidatedInventory`) : idem.

Tests : `backend/src/features/logistics/logistics.service.spec.ts` (describe "BUG-002/Q18"),
`frontend/tests/unit/eventPredictStockUpExpansion.spec.js`,
`frontend/tests/unit/spaceMenusInventory.spec.js` (cas `comboItem=Yes/readyForSale=Yes`).

Voir aussi `frontend/docs/bugs/188_stockup_explosion_ignore_comboitem.md`.

## Risque de régression / à surveiller

Choisir une règle cible unique (probablement celle du backend, plus stricte) et l'aligner des deux
côtés. Auditer les données existantes pour repérer les items où `readyForSale='No'` mais
`comboItem≠'Yes'` **avant** de changer la règle en prod — sinon le changement de règle modifie
silencieusement le comportement de prévision/stock pour ces items.

## Références

- `datafriday-web/docs/modules/04_MENU_CATALOGUE.md` §"Bugs actifs confirmés"
