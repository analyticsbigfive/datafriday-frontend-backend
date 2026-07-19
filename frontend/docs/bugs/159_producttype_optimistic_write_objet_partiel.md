# BUG-159 — `ProductType` : écriture Vuex optimiste avec objet partiel écrase `categories`/`createdAt` après édition

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes (Configurations — Menu Item Types)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/store/modules/productTypes.js:38-40` (`UPDATE_PRODUCT_TYPE`)
  - `src/components/products/drawers/ProductTypeFormDrawer.vue:117-121`
  - `src/components/products/views/ProductTypeList.vue:96-101` (pas de `@saved` sur `<ProductTypeFormDrawer>`, contrairement à `ProductCategoryList.vue:101`)

## Symptôme

Renommer un Menu Item Type fait disparaître son chip "N catégories" (devient "Aucune catégorie") et
sa colonne "Créé le" (devient "-") pendant jusqu'à 15 minutes après l'édition, jusqu'à expiration du
TTL du cache ou navigation forcée.

## Cause racine

`ProductTypeFormDrawer.vue:117-121` dispatch `productTypes/updateProductType` avec seulement
`{id, name}`. `UPDATE_PRODUCT_TYPE` (`productTypes.js:38-40`) fait un remplacement complet de
l'objet (`state.list.map(t => t.id === updated.id ? updated : t)`) au lieu d'une fusion — les champs
absents du payload (`categories`, `createdAt`) sont donc perdus. Rien ne corrige ensuite l'affichage
: contrairement à `ProductCategoryList.vue:101` qui écoute `@saved="loadCategories"` et force un
refetch complet, `ProductTypeList.vue` n'a **aucun** listener `@saved` sur son
`<ProductTypeFormDrawer>`.

Exactement le même mécanisme que [BUG-149](149_taxonomie_evenements_optimistic_write_objets_partiels.md)
(taxonomie Événements, déjà corrigé) : le fix (fusionner `{...existing, ...updated}` ou dispatcher
la réponse API complète) n'a jamais été porté sur `productTypes.js`.

## Correction

Reste à faire : appliquer le même correctif que BUG-149 — soit fusionner l'objet dans la mutation
(`{...state.list.find(t => t.id === updated.id), ...updated}`), soit faire dispatcher la réponse API
complète (incluant `categories`) par `updateProductType`, et/ou ajouter un `@saved` sur
`ProductTypeList.vue` comme sur `ProductCategoryList.vue`.

## Risque de régression / à surveiller

Vérifier après le fix que le chip "N catégories" reste correct immédiatement après un renommage,
sans attendre le TTL. Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à
valider manuellement.

## Références

- [BUG-149](149_taxonomie_evenements_optimistic_write_objets_partiels.md) — même bug, même correctif déjà appliqué côté taxonomie Événements.
- [BUG-160](160_brand_displayname_optimistic_write_objet_partiel.md) — même famille sur Brand/DisplayName.
