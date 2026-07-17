# BUG-062 — Component : `componentTypeId`/`componentCategoryId` re-résolus par nom à chaque sauvegarde, perte silencieuse possible du lien FK

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (perte silencieuse d'un lien FK, pas de perte du libellé affiché)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue` (`selectedComponentTypeId`, `selectedComponentCategoryId`, `loadComponentData`)

## Symptôme

`MenuComponent` porte à la fois deux champs texte legacy (`category`, `componentCategory`) et deux
FK dédiées (`componentTypeId`, `componentCategoryId`) vers la vraie taxonomie
(`ComponentType`/`ComponentCategory`, gérée sur `/component-types`/`/component-categories`). Le
formulaire résolvait `componentTypeId`/`componentCategoryId` en re-matchant le **nom** actuellement
affiché (`form.type`/`form.category`) contre la liste en cache du store, à chaque sauvegarde — y
compris en édition, sans jamais réutiliser l'id d'origine réellement chargé depuis le backend. Si le
nom ne matchait plus exactement (espace, casse, entrée supprimée entre-temps, cache pas encore
rafraîchi), la résolution retombait sur `''` → `componentTypeId`/`componentCategoryId` envoyés comme
`undefined`, silencieusement, alors que le composant avait bien un lien FK valide en base.

## Cause racine

`selectedComponentTypeId`/`selectedComponentCategoryId` (computed) ne connaissaient que le nom
affiché, jamais l'id d'origine. En édition, `loadComponentData()` préremplissait `form.type`/
`form.category` avec les libellés texte (`component.componentCategory`/`component.category`) mais ne
conservait nulle part `component.componentTypeId`/`component.componentCategoryId` pourtant reçus du
backend — l'information existait, elle était juste jetée.

## Correction

Ajout de `_loadedTaxonomy` (`{ typeId, categoryId, typeName, categoryName }`), rempli dans
`loadComponentData()` à partir de `component.componentTypeId`/`component.componentCategoryId` et des
noms préremplis. `selectedComponentTypeId`/`selectedComponentCategoryId` réutilisent désormais l'id
chargé tant que le nom affiché n'a pas changé depuis le chargement ; ils ne retombent sur la
résolution par nom (comportement précédent) que si l'utilisateur change effectivement le Type/Category
ou crée un nouveau composant.

## Risque de régression / à surveiller

Éditer un composant existant, sauvegarder sans toucher au Type/Category, vérifier en base que
`componentTypeId`/`componentCategoryId` restent identiques à avant. Puis changer le Type dans le
formulaire, sauvegarder, vérifier que la résolution par nom reprend la main et pointe vers le bon
nouveau Type/Category.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"Les 3 taxonomies parallèles — à ne jamais confondre en code".
