# BUG-165 — Référentiels plats (Brand/Display/Industrial/PackingType) : duplication quasi totale, jamais factorisée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (dette technique)
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/components/brand-name/views/BrandNameListView.vue` / `src/components/display-name/views/DisplayNameListView.vue` / `src/components/industrial/views/IndustrialListView.vue` / `src/components/packing-type/views/PackingTypeListView.vue` (353 lignes chacune)
  - Leurs 4 `*FormDrawer.vue` (287 lignes chacune, structure/logique 100% identiques)
  - Leurs 4 `*DeleteDialog.vue` (163 lignes chacune, 100% identiques)
  - `src/store/modules/{brandNames,displayNames,industrials,packingTypes}.js` (84-85 lignes chacun, structure identique)
  - `src/api/endpoints/{brand-name,display-name,industrial,packing-type}.api.js` (17 lignes chacun, wrapper CRUD identique)

## Symptôme

Les 4 référentiels plats (`{id, name, tenantId}`, `@@unique([tenantId, name])`) sont implémentés en
4 copies quasi byte-for-byte : vue liste, drawer formulaire, dialog de suppression, module Vuex,
client API — chaque paire ne diffère que par le préfixe de classe CSS, l'icône, le namespace i18n
et le nom du module store/API. Aucun composant générique (`TaxonomyListView`/factory Vuex) n'a été
factorisé malgré la structure s'y prêtant explicitement.

Conséquence pratique : les bugs de cette famille (BUG-160, i18n en dur — voir BUG-166) sont
dupliqués 4 fois dans des fichiers séparés au lieu d'exister en un seul endroit, ce qui multiplie le
risque de divergence future (un correctif appliqué sur l'un et oublié sur les 3 autres — déjà arrivé
: `BrandNameListView.vue:36` a une régression i18n absente des 3 autres, voir BUG-167 [sic, se
référer à la fiche i18n]).

## Cause racine

Copié-collé lors de l'ajout successif de chaque référentiel, sans extraction d'un composant
générique paramétré (nom de l'entité, module store, client API, icône).

## Correction

Extraction faite en deux couches (store + vue), chaque implémentation par entité devenant un thin
wrapper qui configure un composant/module générique au lieu de dupliquer la logique.

**Store (nouveau fichier)** :
- `src/store/modules/factories/flatReferentialModule.js` — factory `createFlatReferentialModule({
  fetchFn, getterName, fetchAction, addAction, updateAction, removeAction, mergeOnUpdate })`
  reproduisant exactement la forme Vuex existante (`state: {list, cachedAt, fetching}`, getter
  `isCacheValid`, TTL 15 min, actions `fetch*`/`add*`/`update*`/`remove*`/`invalidate`). Les noms
  d'action/getter sont passés explicitement (pas dérivés par pluralisation) car plusieurs écrans
  externes (`MenuItemCreateView.vue`, `MarketPriceCreateDrawer.vue`, `MenuItemCsvImportDrawer.vue`,
  `ComponentCreateView.vue`, `CreatePackingTypeDialog.vue`, `MarketPriceEditSupplierDrawer.vue`,
  `MarketPriceCsvImportDrawer.vue`, `MarketPriceListView.vue`) dispatchent/lisent ces
  actions/getters par leur nom exact (`'brandNames/fetchBrandNames'`, `'packingTypes/addPackingType'`,
  etc.) — vérifié par grep avant refactor, tous ces noms sont préservés à l'identique. Les noms de
  mutation restent internes au module (personne ne commit directement depuis l'extérieur, vérifié
  par grep) donc génériques (`SET_LIST`, `ADD_ITEM`, `UPDATE_ITEM`, `REMOVE_ITEM`, ...).

**Store (fichiers modifiés, 85 → ~14 lignes chacun)** : `brandNames.js`, `displayNames.js`,
`industrials.js`, `packingTypes.js` appellent désormais la factory avec leur `fetchFn` (import de
leur `*.api.js` respectif) et leurs noms d'action/getter d'origine. Modules Vuex enregistrés sous
les mêmes noms dans `store/index.js` (fichier non modifié).

**Vue (3 nouveaux fichiers génériques dans `src/components/common/`, structure cross-domaine déjà
documentée dans `FRONTEND_ARCHITECTURE.md`)** :
- `FlatReferentialListView.vue` — reproduit le template/logique de `BrandNameListView.vue`
  (header, barre de recherche, table, drawer/dialog embarqués), paramétré par props
  (`i18nPrefix`, `icon`, `storeModule`, `fetchAction`/`addAction`/`updateAction`/`removeAction`,
  `createFn`/`updateFn`/`deleteFn`, `addButtonKey`, `totalCountKey`, `loadErrorFallback`,
  `searchCountMode`).
- `FlatReferentialFormDrawer.vue` — reproduit `BrandNameFormDrawer.vue`, paramétré par
  `i18nPrefix`, `icon`, `storeModule`, `addAction`/`updateAction`, `createFn`/`updateFn` (props
  publiques `modelValue`/`mode`/`initialData`/`isDark` + emits `update:modelValue`/`saved`
  inchangées).
- `FlatReferentialDeleteDialog.vue` — reproduit `BrandNameDeleteDialog.vue`, paramétré par
  `i18nPrefix` uniquement (props/emits publiques inchangées).

**Vue (12 fichiers existants convertis en thin wrappers, contenu remplacé mais chemin/nom
inchangés)** : les 4 `*ListView.vue` (353 → ~30 lignes), 4 `*FormDrawer.vue` (287 → ~40 lignes) et
4 `*DeleteDialog.vue` (163 → ~25 lignes) sous `brand-name/`, `display-name/`, `industrial/`,
`packing-type/` ne contiennent plus que la config propre à l'entité (icône, préfixe i18n, module
store, fonctions API) et rendent le composant générique correspondant. **Aucun fichier n'a été
supprimé** : contrairement au plan initial ("supprimer les fichiers per-entity devenus inutiles"),
`BrandNameFormDrawer.vue` et `DisplayNameFormDrawer.vue` sont importés directement par
`MenuItemCreateView.vue` (drawers de création rapide de marque/nom d'affichage depuis le formulaire
menu item) — supprimer ces fichiers aurait cassé cet import. Par cohérence, les 12 fichiers (pas
seulement ces 2) sont conservés comme wrappers plutôt que mélanger deux stratégies (wrapper pour
certains, suppression + import direct du composant générique par le router pour d'autres).

**`router/index.js` : non modifié.** Les imports lazy pointent toujours vers les mêmes 4
`*ListView.vue`, qui continuent de fonctionner à l'identique (ils rendent maintenant
`FlatReferentialListView` en interne). C'était l'option la plus sûre entre les deux proposées
(wrapper vs. router pointant directement sur le composant générique), vu la contrainte ci-dessus
sur les FormDrawer.

**Divergences comportementales réelles trouvées entre les 4 entités, préservées via config
(pas unifiées silencieusement)** :
1. **`mergeOnUpdate`** (store) : BUG-160 n'a corrigé la fusion optimiste (`{...item, ...updated}`
   au lieu d'un remplacement complet) que sur `brandNames.js`/`displayNames.js`. `industrials.js`/
   `packingTypes.js` n'ont jamais été touchés par ce correctif et remplacent toujours la ligne
   entière (`UPDATE_INDUSTRIAL`/`UPDATE_PACKING_TYPE` faisaient `i.id === updated.id ? updated : i`,
   pas de spread). `mergeOnUpdate: true` pour Brand/DisplayName, `false` pour Industrial/PackingType
   — reproduit tel quel, pas corrigé ici (hors périmètre de ce refactor pur).
2. **`loadErrorFallback`** (vue) : le volet BUG-166 traitant Industrial/PackingType a corrigé
   `missingId`/`deleteError` en clés i18n mais **pas** le fallback d'erreur de chargement — celui-ci
   reste une chaîne anglaise en dur ("Failed to load industrials"/"Failed to load packing types"),
   alors que Brand/DisplayName passent par `t('<prefix>.loadError')` (clé existante en `en`/`fr`).
   Vérifié : `industrialListLoadError`/`packingTypeListLoadError` n'existent dans aucune locale de
   `translations.js`. Reproduit à l'identique via la prop `loadErrorFallback`, non corrigé ici.
3. **`searchCountMode`** (vue) : `PackingTypeListView.vue` affichait le compteur de la barre de
   recherche sur le total *non filtré* (`packingTypes.length`) alors que les 3 autres écrans
   affichent le total *filtré*. Reproduit via `search-count-mode="total"` sur `PackingTypeListView`
   uniquement (défaut `"filtered"` pour les 3 autres).
4. `PackingType` n'est pas une FK (`MarketPrice.purchasePackaging`/`inventoryPackaging`,
   `MenuComponent.inventoryPackaging` la consomment en texte libre, cf.
   `docs/modules/04_MENU_CATALOGUE.md:404-407`), contrairement à `Brand`/`DisplayName`
   (FK sur `MenuItem`) et `Industrial` (FK sur `MarketPrice`) — mais cette distinction est purement
   backend/relationnelle et n'a aucune incidence observable côté frontend (mêmes 4 écrans CRUD
   `{id, name}` sans référence de clé étrangère affichée) : aucune prop dédiée nécessaire pour ça,
   au-delà des divergences 1-3 ci-dessus déjà trouvées indépendamment.

Le namespace i18n (`brandNameList.*`/`displayNameList.*`/`industrialList.*`/`packingTypeList.*`)
n'a pas été touché dans `translations.js` — les clés déjà posées par BUG-166 sont réutilisées telles
quelles via la prop `i18nPrefix` + les props `addButtonKey`/`totalCountKey` pour les deux suffixes
non uniformes (`addBrand` vs `addDisplayName` vs `addIndustrial` vs `addPackingType`, idem pour
`totalBrands`/`totalDisplayNames`/`totalIndustrials`/`totalPackingTypes`).

Vérifié par grep après refactor : plus aucune référence à `BrandNameListView`/`DisplayNameListView`/
`IndustrialListView`/`PackingTypeListView` (ni leurs `*FormDrawer`/`*DeleteDialog`) en dehors de
leur propre dossier, de `router/index.js` (imports inchangés) et de `MenuItemCreateView.vue`
(imports de `BrandNameFormDrawer`/`DisplayNameFormDrawer` inchangés). `node --check` OK sur les 5
fichiers `.js` modifiés/créés (factory + 4 modules store) ; les fichiers `.vue` n'ont pas pu être
compilés dans cette session (pas de `pnpm dev`/`pnpm build` autorisé), relecture manuelle seulement.

**Suivi du même jour — les 2 divergences trouvées pendant le refactor ont été closes** (le refactor
lui-même les avait délibérément préservées telles quelles, sans les corriger, pour rester un pur
refactor comportement-préservé ; corrigées séparément une fois la factorisation en place, chacune
devenue un changement d'une ligne) :
- `mergeOnUpdate: false → true` sur `industrials.js`/`packingTypes.js` — la factory supportait déjà
  la fusion optimiste (fix BUG-160), il ne restait qu'à activer le flag pour ces 2 modules.
- `industrialListLoadError`/`packingTypeListLoadError` ajoutées en `en`/`fr` dans `translations.js`
  (même convention que `brandNameListLoadError`/`displayNameListLoadError`) ; la prop
  `load-error-fallback` (qui reproduisait l'ancien texte anglais en dur) retirée de
  `IndustrialListView.vue`/`PackingTypeListView.vue` — les 4 écrans passent désormais uniformément
  par `t('<prefix>.loadError')`.

## Risque de régression / à surveiller

Refactor structurel de grande ampleur (store + 3 composants génériques + 12 wrappers), vérifié
uniquement par lecture de code et `node --check` sur les fichiers `.js` — **aucune vérification
navigateur possible dans cette session** (`pnpm dev`/`pnpm build` interdits). À valider manuellement
avant merge, sur les 4 écrans (`/configurations/brand-names`, `/display-names`, `/industrials`,
`/packing-types`) :
- Liste : chargement initial, recherche (filtre insensible à la casse), tri/affichage de la colonne
  "Créé le", état de chargement (`v-progress-linear`) et état d'erreur réseau simulé.
- Création : drawer, validation "nom requis", création réussie (la ligne apparaît sans perdre les
  autres colonnes), erreur serveur affichée.
- Édition : la colonne "Créé le" doit rester correcte immédiatement après renommage sur
  Brand/DisplayName (comportement BUG-160) — et vérifier qu'Industrial/PackingType n'ont **pas**
  régressé par rapport à leur comportement (potentiellement bogué) d'avant refactor.
- Suppression : dialog de confirmation, suppression bloquée par une relation FK (409 —
  BUG-85/86, sur Brand/DisplayName/Industrial uniquement, `PackingType` n'étant pas une FK) avec
  message d'erreur affiché, suppression réussie.
- `MenuItemCreateView.vue` : les drawers rapides "créer une marque"/"créer un nom d'affichage"
  (`BrandNameFormDrawer`/`DisplayNameFormDrawer` importés directement, hors du contexte
  `*ListView`) doivent continuer à fonctionner à l'identique — c'est le point le plus à risque de ce
  refactor car ce sont des composants réutilisés hors de leur écran de liste d'origine.
- Changement de langue (`appLocale`) sur les 4 écrans, pour confirmer que les clés i18n réutilisées
  résolvent toujours correctement via le nouveau chemin (`t(`${i18nPrefix}.xxx`)` au lieu de clés
  littérales dans le template).

## Références

- [BUG-166](166_taxonomies_configurations_i18n_texte_en_dur.md) — conséquence directe de cette duplication (mêmes chaînes en dur, dupliquées).
- [BUG-160](160_brand_displayname_optimistic_write_objet_partiel.md) — autre bug dupliqué par cette même architecture.
