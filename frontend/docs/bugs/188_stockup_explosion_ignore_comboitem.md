# BUG-188 — Stock up : l'explosion recette ne considère que `readyForSale`, jamais `comboItem`

- **Statut** : 🟢 Corrigé (2026-07-24 — règle métier QUESTIONS_A_BERTRAND #18)
- **Sévérité** : 🟠 Majeur (quantités de préparation potentiellement fausses pour les combos)
- **Domaine** : Prévision (Event Predict) — miroir backend : `logistics.service.ts` (`deriveSales`)
- **Repo(s) concerné(s)** : `datafriday-web` (+ backend si la règle change : duplication à dessein)
- **Découvert le** : 2026-07-15 (doc module 01, bug #2) — fiche créée 2026-07-18
- **Fichiers** : `src/components/EventPredictStockUpSection.vue:644` (`expandMenuItem`) —
  aucune occurrence de `comboItem` dans la décision d'expansion

## Symptôme

Un article combo (`comboItem === 'Yes'`) avec `readyForSale === 'Yes'` est traité comme une
simple pièce (`1 item en pcs`) dans le Stock up : ses articles constitutifs ne sont jamais
explosés, alors que la section Menus du même écran classe bien ces items en onglet « Combo »
(`normalizeToTypeTab`, `EventPredictMenusSection.vue:838-841`) et que le catalogue les modélise
comme composés.

## Cause racine

`expandMenuItem` (`EventPredictStockUpSection.vue:644`) branche uniquement sur
`readyForSale === 'Yes'` (→ pièce) vs `'No'` + `components[]` (→ explosion récursive,
`MAX_DEPTH`). Le flag `comboItem` n'est jamais consulté. Incohérence transverse documentée dans
`docs/modules/04_MENU_CATALOGUE.md` (bug #3) : les différents consommateurs du catalogue ne
s'accordent pas sur ce que signifie « combo » pour l'explosion.

## Correction

**Décision (2026-07-24, réponse Bertrand — [Question #18](../QUESTIONS_A_BERTRAND.md))** : « Combo
item doivent être explosé par menu items et les règles de menu item s'appliquent pour les menu
items qui composent le combo item. » — un combo `readyForSale='Yes'` doit donc être **explosé en
ses constituants** pour le Stock up, exactement comme un item non-`comboItem`, puis chaque
constituant suit les règles standard des menu items (mono-ingrédient, `unitsPerPack`, etc.).

**Correction appliquée (2026-07-24)** — `expandMenuItem` (`EventPredictStockUpSection.vue:649-708`)
branche désormais sur `comboItem==='Yes'` (variable `isCombo`) en plus de `readyForSale` : un combo
n'entre plus jamais dans la branche "1 pièce" et déclenche l'explosion récursive via `components[]`
même quand `readyForSale==='Yes'` ; un constituant résolu qui est lui-même
`comboItem==='Yes'` (et pas seulement `readyForSale==='No'`) est aussi récursé. Même règle portée
aux 3 endroits dupliqués à dessein (backend `logistics.service.ts`, inventaire
`inventoryUtils.js`) — voir `backend/docs/bugs/02_double_regle_combo_incompatible.md` pour le
détail des 3 correctifs. Test : `frontend/tests/unit/eventPredictStockUpExpansion.spec.js`.

⚠️ Contrainte pour le fix : l'explosion recette est **dupliquée à dessein** aux 3 endroits suivants
— toute évolution de la règle doit être portée aux trois, même passe :
- Front Stock up : `EventPredictStockUpSection.vue` (`expandMenuItem`)
- Backend Logistics : `logistics.service.ts` (`deriveSales` — cf. doc module 06, piège
  « readyForSale explosion duplicated »)
- Inventaire : `buildConsolidatedInventory` (`utils/inventoryUtils.js`)

## Risque de régression / à surveiller

Si la règle « explosion des combos » est adoptée : quantités Stock up et Réarmement changent pour
tous les espaces vendant des combos ; vérifier aussi `buildConsolidatedInventory`
(`utils/inventoryUtils.js`) qui porte la même cascade côté inventaire.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #2
- `docs/modules/04_MENU_CATALOGUE.md` bug #3 (incohérence combo transverse)
- `docs/QUESTIONS_A_BERTRAND.md` #18
