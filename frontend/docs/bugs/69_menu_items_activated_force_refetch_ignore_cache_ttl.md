# BUG-069 — `activated()` force un refetch complet à chaque retour sur `/menu-items`, ignorant le cache TTL

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue:532-536`

## Symptôme

La route `/menu-items` a `meta:{keepAlive:true}` (`router/index.js:261`), donc le hook `activated()`
est réellement vivant. Chaque retour sur la page (navigation puis retour) redéclenche 3 appels
réseau avec `forceRefresh:true`, même si les données viennent d'être chargées quelques secondes
plus tôt.

## Cause racine

```js
activated() {
  this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true });
  this.$store.dispatch('productCategories/fetchProductCategories', { forceRefresh: true });
  this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
},
```

Le module `menuItems.js` implémente pourtant un vrai cache TTL 15 min (`isCacheValid`,
`store/modules/menuItems.js:21-22`), jamais consulté ici. Le endpoint `/menu-items` est documenté
comme lent côté backend (`menu-item.api.js:37-40`, timeouts 60s constatés à l'échelle) — ce
forçage systématique est donc coûteux sans bénéfice réel dans le cas courant "retour sur la page
quelques secondes après".

## Correction

`activated()` appelle désormais `fetchMenuItems({})`/`fetchProductTypes({})`/
`fetchProductCategories({})` sans `forceRefresh`, laissant le getter `isCacheValid` de chaque
module décider. Le `force:true` reste utilisé ailleurs dans le même fichier après une mutation
réelle (delete, import CSV, refresh costs) — comportement inchangé sur ces chemins.

## Risque de régression / à surveiller

Vérifier qu'après une création/édition d'article ailleurs dans l'app (ex. via un autre onglet ou
le drawer d'import), un retour sur `/menu-items` dans les 15 minutes affiche bien les données à
jour si une invalidation de cache a été déclenchée par cette mutation — sinon il faudra un
`invalidate` explicite plutôt que de réintroduire `forceRefresh: true` ici.

## Références

- [[70_menu_items_store_fetchmenuitems_sans_inflight]]
