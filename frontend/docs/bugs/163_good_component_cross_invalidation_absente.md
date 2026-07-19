# BUG-163 — Good/Component Types↔Categories : pas d'invalidation croisée de cache, actions `invalidate` mortes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels / Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/store/modules/marketPriceTypes.js:52-54`, `marketPriceCategories.js:57-59` (`invalidate`, jamais dispatché)
  - `src/store/modules/componentTypes.js:68-70`, `componentCategories.js:77-79` (idem)
  - `src/components/menu-fb/views/component-library/views/ComponentTypeList.vue:199` (mount sans `forceRefresh`)
  - `src/components/menu-fb/views/component-library/views/ComponentCategoryList.vue` (mount avec `forceRefresh`)
  - `src/components/menu-fb/views/component-library/drawers/ComponentTypeCategoriesDrawer.vue` (lit `componentType.categoryList`, source potentiellement périmée)

## Symptôme

Conséquence directe de [BUG-161](161_good_component_categories_derivees_endpoint_types.md) : la
page Categories (Good ou Component) mute uniquement l'état de son propre module Vuex
(`componentCategories`/`marketPriceCategories`) après create/update/delete — jamais celui du module
`Types`, qui contient pourtant sa propre copie indépendamment cachée du `categories[]` imbriqué par
type. Résultat : après avoir ajouté/renommé/supprimé une catégorie depuis la page Categories, le
chip de comptage de catégories et le contenu de `ComponentTypeCategoriesDrawer.vue` sur la page
Types peuvent rester périmés jusqu'à 15 minutes (TTL), dans la même session.

Par ailleurs, l'action `invalidate` existe dans les 4 modules concernés (`marketPriceTypes`,
`marketPriceCategories`, `componentTypes`, `componentCategories`) mais n'est **jamais dispatchée**
nulle part dans le code — le pattern de cache-invalidation documenté comme convention standard dans
`CLAUDE.md` est mort pour ces 4 modules ; en pratique, chaque page force un refetch complet
(`forceRefresh: true`) au montage à la place, sauf `ComponentTypeList.vue` qui ne le fait pas
(incohérence supplémentaire, page Types plus susceptible d'afficher des données périmées que la
page Categories correspondante).

## Cause racine

`invalidate` jamais câblé aux actions de mutation croisées (créer/éditer/supprimer une Category
devrait dispatcher `Types/invalidate`, et vice-versa au besoin) ; `ComponentTypeList.vue` mount sans
`forceRefresh` alors que sa page sœur `ComponentCategoryList.vue` en a un.

## Correction

Deux volets, tous deux traités :

**(a) Direction Types→Categories (la staleness décrite dans ce bug) est désormais moot.** Depuis le
correctif [BUG-161](161_good_component_categories_derivees_endpoint_types.md),
`marketPriceCategories.js`/`componentCategories.js` lisent leur propre endpoint dédié
(`getMarketPriceCategories()`/`getComponentCategories()`) au lieu de dériver de `type.categories[]`
— la page Categories n'a donc plus de dépendance de fraîcheur envers le cache du module Types dans
ce sens.

**(b) Direction Categories→Types (le staleness inverse, pas couvert par BUG-161) : câblage ajouté.**
Les modules Types continuent de GET leur liste avec les catégories imbriquées
(`include: {categories}` côté serveur), donc une mutation côté Category peut laisser périmé le
`categories[]` en cache du module Types. Les actions de mutation optimiste du module Category
dispatchent maintenant l'`invalidate` du module Types sœur via `dispatch('<module>Types/invalidate',
null, { root: true })` (pattern `{ root: true }` déjà utilisé ailleurs dans le store, ex.
`analyse.js:144`) :

- `src/store/modules/marketPriceCategories.js:88-101` — `addMarketPriceCategory`,
  `updateMarketPriceCategory`, `removeMarketPriceCategory` dispatchent chacune
  `marketPriceTypes/invalidate` après leur `commit`.
- `src/store/modules/componentCategories.js:88-101` — `addComponentCategory`,
  `updateComponentCategory`, `removeComponentCategory` dispatchent chacune
  `componentTypes/invalidate` après leur `commit`.

Ceci constitue le premier appelant réel de `marketPriceTypes/invalidate` et
`componentTypes/invalidate` (jusqu'ici mortes). Les actions `invalidate` de
`marketPriceCategories`/`componentCategories` (l'autre sens) restent volontairement non câblées —
hors scope de ce correctif, cf. consigne de la tâche.

L'incohérence `forceRefresh` de `ComponentTypeList.vue` vs `ComponentCategoryList.vue` n'a **pas**
été traitée ici (fichier `.vue`, hors périmètre de cette tâche store-only) — reste ouverte pour un
suivi séparé si jugé utile.

**Suivi (2026-07-19, session ultérieure)** : vérification de `ComponentTypeList.vue:198-200`
(`mounted()`) — le mount dispatch déjà `componentTypes/fetchComponentTypes` **sans**
`forceRefresh`, ce qui est le comportement standard attendu (respect du cache TTL 15 min,
cf. `CLAUDE.md`). Aucun changement de code nécessaire sur ce fichier : l'incohérence décrite dans ce
bug (`ComponentTypeList.vue` sans `forceRefresh` vs `ComponentCategoryList.vue` avec) est donc
résolue du côté `ComponentTypeList.vue` — c'est `ComponentCategoryList.vue` qui reste l'exception
(force-refresh systématique au mount), volontairement non touchée ici car hors du périmètre de cette
tâche (fichiers `componentTypes.js`/`componentCategories.js` déjà possédés par l'agent store-only
ci-dessus ; `ComponentCategoryList.vue` non modifié). Combiné à l'invalidation croisée déjà en place
(ci-dessus), `ComponentTypeList.vue` lit maintenant soit un cache valide, soit un cache invalidé par
une mutation Category récente — le point (a) de ce bug est donc pleinement clos.

## Risque de régression / à surveiller

Corrigé sur revue de code uniquement (pas de `pnpm dev` cette session) — nécessite une validation
manuelle, en particulier :
- Vérifier que `marketPriceTypes/invalidate` / `componentTypes/invalidate` se déclenchent bien après
  un create/update/delete de catégorie et que la page Types (drawer
  `ComponentTypeCategoriesDrawer.vue` notamment) reflète la mutation au prochain fetch
  (`forceRefresh` ou après expiration du cache invalidé).
- Le filtre `?typeId=` de `getMarketPriceCategories()`/`getComponentCategories()` (voir BUG-161) —
  confirmer qu'aucun consommateur actuel ou futur de `fetchMarketPriceCategories`/
  `fetchComponentCategories` n'a besoin de filtrer par type ; aucun appelant recensé aujourd'hui n'en
  a besoin.
- Avant ce correctif, `ComponentTypeList.vue` montait sans `forceRefresh` (contrairement à
  `ComponentCategoryList.vue`) — avec l'invalidation croisée désormais active, un `mount` sans
  `forceRefresh` après une mutation Category dans la même session lira quand même un cache invalidé
  (donc refetch). Vérifié (2026-07-19) : `ComponentTypeList.vue` mount toujours sans `forceRefresh`
  (comportement correct/standard, aucun changement requis) — code-review uniquement, pas de
  `pnpm dev` cette session, à valider manuellement en navigateur.

## Références

- [BUG-161](161_good_component_categories_derivees_endpoint_types.md) — cause racine partagée.
