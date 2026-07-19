# BUG-168 — `ProductCategoryList.vue` : force le refresh à chaque montage, contourne le cache TTL

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes (Configurations — Menu Item Categories)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/components/products/views/ProductCategoryList.vue:187-192,211` (`mounted()` appelle `loadCategories()` qui passe toujours `{forceRefresh: true}`)

## Symptôme

Contrairement à `ProductTypeList.vue:197-199` (mount respectant le cache 15 min standard),
`ProductCategoryList.vue` recharge systématiquement les catégories depuis l'API à chaque montage/
navigation vers `/product-categories`, même si le cache est encore valide — un aller-retour réseau
évitable à chaque visite de l'écran.

## Cause racine

`loadCategories()` passe inconditionnellement `{forceRefresh: true}` au lieu de laisser le getter
`isCacheValid` du store trancher, contrairement au contrat de cache documenté dans
`frontend/CLAUDE.md` pour les modules Vuex standard.

## Correction

`src/components/products/views/ProductCategoryList.vue` :
- `loadCategories()` (ex-`:207-211`) accepte désormais un paramètre `forceRefresh = false` et le
  transmet tel quel à `productCategories/fetchProductCategories({ forceRefresh })` au lieu de
  toujours passer `{ forceRefresh: true }`.
- `mounted()` appelle `this.loadCategories()` sans argument → respecte désormais le cache TTL
  15 min (comportement standard, aligné sur `ProductTypeList.vue`).
- `<ProductCategoryFormDrawer>` écoute maintenant `@saved="onCategorySaved"` (nouvelle méthode) au
  lieu de `@saved="loadCategories"` directement — `onCategorySaved()` appelle
  `this.loadCategories(true)`, préservant le refresh forcé légitime après un create/edit (cf.
  [BUG-159](159_producttype_optimistic_write_objet_partiel.md), qui a par ailleurs ajouté
  l'équivalent `@saved="loadTypes"` sur `ProductTypeList.vue`).

## Risque de régression / à surveiller

Vérifié seulement par lecture de code (pas de `pnpm dev` cette session) — à valider manuellement :
naviguer vers `/product-categories` deux fois de suite dans les 15 minutes doit éviter un second
appel réseau (cache respecté) ; créer/éditer une catégorie doit toujours rafraîchir la liste
immédiatement (refresh forcé toujours actif sur `@saved`) ; vérifier qu'une catégorie créée/modifiée
depuis un autre onglet reste visible dans un délai raisonnable (le TTL de 15 min s'applique
normalement, comportement attendu et cohérent avec le reste de l'app).

## Références

- [BUG-159](159_producttype_optimistic_write_objet_partiel.md) — problème inverse sur la page sœur Types (pas assez de refresh, celui-ci en a trop).
