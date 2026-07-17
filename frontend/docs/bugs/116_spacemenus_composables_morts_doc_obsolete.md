# BUG-116 — Cluster de composables morts (useSpaceMenu / useSpaceMenuReconciliation / useShopElementMapping) + doc module obsolète

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/composables/useSpaceMenu.js` (122 lignes), `src/composables/useSpaceMenuReconciliation.js`
  (161 lignes), `src/composables/useShopElementMapping.js` (87 lignes),
  `src/api/endpoints/space-menu.api.js:10-15` (`getSpaceMenu`), `src/utils/api.js:630-641`,
  `docs/modules/04_MENU_CATALOGUE.md:249-256`

## Symptôme

`docs/modules/04_MENU_CATALOGUE.md:249-256` décrit l'écran d'édition `/space-menus/:spaceId/shops/:shopId`
comme reposant sur `useSpaceMenu.js` + `useSpaceMenuReconciliation.js`, avec une fonctionnalité de
« réconciliation souple » (pré-remplissage suggéré depuis le mapping Weezevent shop↔élément, badge
non bloquant de divergence). **Cette description est fausse** : aucun écran réellement routé
(`SpaceMenuView.vue`, `ShopDetailView.vue`, `SpaceMenuShopView.vue`, `SpaceMenuItemView.vue`,
les 3 drawers) n'importe `useSpaceMenu` ni `useSpaceMenuReconciliation` — confirmé par recherche
exhaustive dans tout `src/`. La fonctionnalité de réconciliation/suggestion/divergence n'existe
nulle part dans l'UI live (`grep -rniE "divergence|suggestion|reconcil|mapping"` sur le dossier
`space-menus/` ne renvoie aucun résultat).

## Cause racine

`useSpaceMenu()` (`useSpaceMenu.js:13`) : zéro appelant dans `src/` en dehors de son propre test
unitaire (`tests/unit/useSpaceMenu.spec.js`).

`useSpaceMenuReconciliation()` (le hook, `useSpaceMenuReconciliation.js:98`) : zéro appelant. Ses
fonctions pures exportées (`seedBlankElements`, `buildSuggestionsByElement`, `computeDivergence`)
sont correctement implémentées et testées (`tests/unit/spaceMenusInventory.spec.js`) mais ne sont
consommées que par d'autres fichiers eux-mêmes morts : `useSpaceMenu.js` et
`useShopElementMapping.js`, plus `SpaceMenusPanel.vue` (déjà catalogué comme mort dans le module
doc, hors périmètre de cet audit).

`useShopElementMapping()` (`useShopElementMapping.js:18`) : zéro appelant dans `src/`.

Ces 3 fichiers forment un cluster auto-référencé (chacun s'importe l'un l'autre) qui donne
l'illusion d'être utilisé alors qu'aucun point d'entrée ne le relie à un écran réellement routé. Les
écrans réels réimplémentent leur propre état inline dans les composants (`SpaceMenuView.vue`
`data()`, appels directs à `menu.api.js`), avec un design différent : sauvegarde en delta
(`assignMenuItemsToShop`, une seule paire shop×item ou les items modifiés) plutôt que le
`persist()` de `useSpaceMenu.js` (POST complet de la matrice `{elementId:{menuItemId:bool}}`).

Conséquence secondaire : 3 implémentations distinctes et incompatibles du client "get/save space
menu configuration" coexistent — `utils/api.js:630-641` (args positionnels, legacy monolithe que
CLAUDE.md documente comme « réservé à Restock »), `menu.api.js:434-460` (objet, la version réellement
utilisée), et `space-menu.api.js:10-15` (`getSpaceMenu`, un 3ᵉ variant jamais appelé — seul
`getShopMenus` du même fichier est vivant, consommé par `EventPredictView.vue`).

## Correction

**Arbitrage tranché le 2026-07-17, après recherche approfondie** (option (b) : abandon, suppression)
sur la base de 4 éléments convergents :
1. **Historique git muet mais non contradictoire** : le dépôt frontend a été réinitialisé le
   2026-07-15 (un seul commit avant l'audit) — aucune trace d'un branchement passé à un écran
   réel, mais aucune preuve du contraire non plus.
2. **Aucun spec document** : les composables référencent une numérotation externe
   (« spec composable #1/#2/#3/#4 » dans leurs commentaires d'en-tête) dont le document source
   n'existe nulle part dans le repo (`grep` exhaustif sur `docs/` et `backend/`). Seul le
   « composable #3 » de cette série (`menuItemAvailability.js`, une fonction utilitaire, pas un
   composable Vue) a réellement été câblé ailleurs dans l'app — les 3 autres de la série
   (`useShopElementMapping`=#1, `useSpaceMenu`=#2, `useInventoryExpansion.js`=#4) sont tous
   orphelins, signe d'une initiative plus large partiellement abandonnée.
3. **Preuve décisive** : la route backend dont dépend cette fonctionnalité,
   `GET /shop-element-mappings/:spaceId` (appelée via `getShopElementMappings` dans
   `utils/api.js`), **n'existe pas** dans `api-datafriday-staging` (zéro route, zéro modèle
   Prisma). Relancer cette fonctionnalité aurait signifié construire une feature backend entière,
   pas « finir un branchement ».
4. **Un concept concurrent déjà en production** : `LocationSpaceMapping`
   (table `WeezeventLocationSpaceMapping`) + le module backend `mappings/` implémentent déjà un
   mapping Weezevent location↔espace — vraisemblablement ce qui a remplacé l'idée
   « shop-element-mapping » jamais finalisée.

**Suppression effectuée** :
- `src/composables/useSpaceMenu.js`, `useSpaceMenuReconciliation.js`, `useShopElementMapping.js`
  supprimés.
- `tests/unit/useSpaceMenu.spec.js` supprimé.
- Le describe block `Règle 1 — réconciliation souple` (et son import dédié) retiré de
  `tests/unit/spaceMenusInventory.spec.js` ; les autres describe blocks de ce fichier (Règles 2/3,
  testant `inventoryUtils`/`stockPlanning`/`menuItemNormalize`/`salesAggregation`/`shoppingList`,
  tous vivants) sont inchangés.
- `docs/modules/04_MENU_CATALOGUE.md:249-266` mis à jour (architecture réelle décrite + historique
  de la suppression) et sa section « Code mort » actualisée.
- `getSpaceMenu` (`space-menu.api.js`) et `getSpaceMenuConfiguration`/`saveSpaceMenuConfiguration`
  (`utils/api.js`) **laissés en l'état** (non supprimés) : ils n'ont plus aucun consommateur en
  dehors de `SpaceMenusPanel.vue` (déjà mort, hors périmètre), mais leur suppression n'a pas été
  demandée dans cette passe — documentés comme dette résiduelle mineure dans le module doc.
  **Attention** : `getShopElementMappings` du même fichier `utils/api.js` reste vivante (domaine
  Restock, `useShoppingList.js`/`SpaceRestockView.vue`) — ne pas la confondre avec les fonctions
  space-menu mortes du même fichier ni la supprimer par erreur si ce nettoyage est repris plus tard.

## Risque de régression / à surveiller

- `SpaceMenusPanel.vue` (déjà mort, non routé, non importé par `appCopy.vue`→`MenuBuilder.vue`
  eux-mêmes inatteignables depuis `src/router`) contient désormais un import cassé vers
  `useSpaceMenuReconciliation.js` — sans impact sur le build (chaîne entièrement hors du graphe
  webpack, vérifié : zéro import vers `appCopy.vue`/`MenuBuilder.vue`/`SpaceMenusPanel.vue` dans
  tout `src/`) ni sur le runtime (jamais monté). À nettoyer seulement si `SpaceMenusPanel.vue` est
  un jour lui-même repris/supprimé.
- Suite `tests/unit/spaceMenusInventory.spec.js` vérifiée après coup : 14 tests passent (le seul
  échec, `Coca` vs `Coca 33cl` dans `buildConsolidatedInventory`, est pré-existant et sans rapport
  — confirmé par `git stash` avant les changements de cette session).
- Si le besoin métier (suggestion + badge de divergence non bloquant) redevient réel, repartir de
  zéro côté backend (modèle + route) plutôt que de tenter de réanimer ce code supprimé.

## Références

- [BUG-117](117_spacemenus_scrolllock_keepalive.md) et suivants — bugs sur les écrans réellement
  live qui ont remplacé cette couche.
