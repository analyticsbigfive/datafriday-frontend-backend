# BUG-159 — `ProductType` : écriture Vuex optimiste avec objet partiel écrase `categories`/`createdAt` après édition

- **Statut** : 🟢 Corrigé
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

- `src/store/modules/productTypes.js:38-40` (`UPDATE_PRODUCT_TYPE`) : remplacement complet
  (`t.id === updated.id ? updated : t`) remplacé par une fusion (`{ ...t, ...updated }`), même
  pattern que `eventTypes.js:39` (correctif de référence BUG-149). Les champs absents du payload
  dispatché par le drawer (`categories`, `createdAt`) sont désormais préservés depuis l'entrée
  existante au lieu d'être écrasés par `undefined`.
- `src/components/products/views/ProductTypeList.vue:96-102` : ajout du listener
  `@saved="loadTypes"` sur `<ProductTypeFormDrawer>` (manquant, contrairement à
  `ProductCategoryList.vue:101`).
- `src/components/products/views/ProductTypeList.vue:207-216` (`loadTypes`) : passe désormais
  `{ forceRefresh: true }` à `fetchProductTypes` (au lieu d'un fetch simple qui aurait pu être
  no-op si le cache était encore valide), pour garantir un refresh visible juste après
  création/édition — même pattern que `ComponentTypeList.vue::loadTypes` (déjà correct).

`ProductTypeFormDrawer.vue` n'a pas eu besoin d'être modifié pour dispatcher la réponse API
complète : la fusion dans la mutation suffit à préserver `categories`/`createdAt` même avec un
payload partiel `{id, name}`.

## Risque de régression / à surveiller

Vérifié seulement par lecture de code (le fichier a été relu après édition, pas de `node --check`
possible sur un `.vue`) — **pas de reproduction live en navigateur** (interdiction de lancer
`pnpm dev` dans cette session). À valider manuellement : éditer un Menu Item Type et vérifier que
le chip "N catégories" et la colonne "Créé le" restent corrects immédiatement après le renommage,
sans attendre le TTL de 15 min ; créer un nouveau type et vérifier que la liste se rafraîchit bien
après fermeture du drawer.

## Références

- [BUG-149](149_taxonomie_evenements_optimistic_write_objets_partiels.md) — même bug, même correctif déjà appliqué côté taxonomie Événements.
- [BUG-160](160_brand_displayname_optimistic_write_objet_partiel.md) — même famille sur Brand/DisplayName.
