# BUG-313-01 — EventPredict / Par article : pas d'action groupée « ajouter l'article à tous les PDV »

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur (ergonomie — demande maquette, pas une régression)
- **Domaine** : Prévision (Event Predict) / Menu & recettes (Space Menus)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul — aucun changement backend)
- **Découvert le** : 2026-08-11 (annotation maquette JLH sur capture « Auxerre Ipswitch »)
- **Fichiers** : `src/components/EventPredictRowActions.vue`,
  `src/components/EventPredictMenusSection.vue` (header d'article, vue Par article),
  `src/components/EventPredictView.vue` (`handleAssignItemAllShops`),
  `src/i18n/translations.js`

## Symptôme

Vue « Par article » de l'écran Configuration d'Event Predict : un article non proposé (badge
« non mappé », « 0 / 5 points de vente ») ne peut être réactivé que PDV par PDV, via le kebab
« ⋮ » de chaque ligne de point de vente (« Réactiver au menu »). Pour un article à remettre en
vente partout (ex. « 2 bieres 50 cl - happy hour » sur 5 PDV), c'est 5 ouvertures de menu et
5 POST successifs. La maquette (08/2026) demande le même menu au niveau de l'article pour
« ajouter l'article à tous les PDVs proposés dans Space Menus ».

## Cause racine

Pas un défaut : l'action n'existait simplement qu'au niveau ligne PDV
(`EventPredictRowActions.vue`, emit `add` → `emitAddToMenu(element, item)` → un
`POST /space-menu` par PDV). Aucun point d'entrée au niveau du header d'article.

## Correction

Décisions JLH (2026-08-11) : kebab **ajouté** au niveau article, kebabs PDV **conservés**.

- `EventPredictRowActions.vue` : nouveau prop `variant` (`'row'` défaut | `'item-header'`) +
  prop `assignAllDisabled` + emit `'assign-all'`. En `item-header`, le menu ne montre que
  « Ajouter l'article à tous les PDV (Space Menus) » et le lien Space Menus existant ; les
  actions par PDV (Remapper/Ajouter/Réactiver/Historique) restent réservées au variant `row`.
- `EventPredictMenusSection.vue` : kebab `variant="item-header"` inséré dans le header d'article
  (avant le chevron), masqué si l'item est hors catalogue (`spaceCatalogIdSet` — le backend
  ignorerait silencieusement l'id) ou si aucune assignation Space Menus n'est active
  (`assignmentFeatureActive()`). Action grisée quand l'article est déjà proposé partout
  (nouvelle méthode `isItemAssignedEverywhere` — `null` = assignation non chargée → ne grise
  pas, l'écriture est idempotente). Nouvel emit `'assign-item-all-shops'`.
- `EventPredictView.vue` : nouveau handler `handleAssignItemAllShops({menuItemId, itemName})` —
  cibles = lignes `/shops` de la config courante (même filtre que `loadShopMenuAssignment`)
  moins les shops où l'article est déjà **activé** (`shopMenuAssignment`, clé nom normalisé ;
  un article assigné mais désactivé est donc bien ré-activé, même sens que « Réactiver au
  menu »). **Un seul** `POST /space-menu` multi-shops via `saveSpaceMenuConfiguration`
  (`menu.api.js` — le backend merge en delta partiel par couple shop/item,
  `saveMenuConfiguration`, `space-menus.service.ts`). Puis même séquence que
  `handleAssignShopItems` : invalidation `shopMenuItems`/`shopMenuAvailability` par shop ciblé,
  purge `_shopMenuAssignmentCache[cfgId]`, `loadShopMenuAssignment()`, et répercussion sur la
  sélection explicite (`applyAssignToExplicit` pour chaque élément de config apparié par nom
  normalisé via `configElementNormNameById`).
- i18n : `epraAssignAllShops`, `epraAssignAllDone`, `epAssignAllSuccess`, `epAssignAllNone`,
  `epAssignAllError` (en + fr) — les snackbars du nouveau handler passent par `t()`
  (contrairement aux snackbars historiques du fichier, en dur — non reproduits).

## Risque de régression / à surveiller

- Kebabs PDV : le variant par défaut `row` doit rendre exactement l'ancien menu (Remapper /
  Ajouter / Réactiver / Historique / Space Menus) — vérifier les 4 usages existants
  (2 en vue PDV, 2 en vue article).
- Vérifier en réseau : l'action article = **1 seul** POST `/space-menu` (pas N).
- Compteur « X / Y points de vente » : doit passer à Y / Y après le refetch.
- Optimistic update `menuItemsCount` (bascule Opened/Closed sans refetch) non rejoué pour le
  bulk — assumé, comme `handleAssignShopItems` : le refetch `loadShopMenuAssignment` fait foi.
- Shops fermés (0 item) inclus volontairement dans les cibles : c'est le but de la feature
  (l'article les rouvre, `menuItemsCount > 0` → « Opened » au refetch).

## Références

- Maquette : capture « Auxerre Ipswitch » annotée JLH (08/2026) — « Déplacer ce menu sur
  l'article pour ajouter l'article à tous les PDVs proposés dans Space Menus ».
- Plan d'implémentation session 2026-08-11 (Phase A) ; Feature sœur : fiche 314-01
  (Réarmement – Espaces de stockage).
- Contrat backend : `POST /space-menu` multi-shops, delta partiel — vérifié dans
  `space-menus.service.ts` (`saveMenuConfiguration`).

— JLH
