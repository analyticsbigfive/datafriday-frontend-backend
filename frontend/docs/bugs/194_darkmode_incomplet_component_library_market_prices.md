# BUG-194 — Dark mode incomplet sur les écrans `component-library` et `market-prices`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (lisibilité en thème sombre — fonds clairs / textes sombres illisibles)
- **Domaine** : Menu & recettes (composants) / Achats & référentiels (prix du marché)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-22 · **Corrigé le** : 2026-07-22 (emmanuel)
- **Fichiers** : voir liste ci-dessous

## Symptôme

En thème sombre (`dataFridayDark`), plusieurs vues/drawers/dialogs de `menu-fb/component-library` et
`menu-fb/market-prices` restaient en **clair** : cartes à fond blanc, en-têtes de tableaux gris clair,
textes `#111827`/`#374151` peu lisibles sur fond sombre, badges/chips aux teintes claires. Le support
dark avait été ajouté progressivement mais n'était **pas propagé à tous les composants du dossier**.

## Cause racine

Le pattern dark du projet (parent : `useTheme()` → `isDark` ; enfant : prop `isDark` → classe racine
`--dark` → overrides CSS scopés) n'était appliqué qu'à une partie des composants. Trois défauts :

1. Des composants **rendus** sans aucun support dark (ex. `MarketPriceTable`, `componentListView`,
   `ComponentCreateView` et ses 4 enfants).
2. Des parents qui **ne threadaient pas** `:is-dark` à des enfants pourtant capables (ex.
   `MarketPriceTable`, `ComponentDeleteDialog`).
3. Des enfants qui **déclaraient la prop `isDark` mais ne l'appliquaient pas** (pas de classe racine
   `--dark`, pas de bloc CSS — ex. `MarketPriceDeleteItemDialog`, `MarketPriceDeleteSupplierDialog`).

## Correction

Alignement uniforme sur le pattern déjà en place (référence : `ComponentTypeList.vue` et les composants
`space-menus`), **sans nouveau mécanisme** : `useTheme()`/`isDark` côté parent, prop `isDark` +
classe racine `--dark` côté enfant, blocs CSS `.xxx--dark` avec la palette sombre du repo
(`#1e293b`/`#111827`/`#1a2332`/`#0f172a`, textes `#e2e8f0`/`#94a3b8`/`#cbd5e1`, bordures
`rgba(255,255,255,.08–.14)`). Surfaces de marque (en-têtes rouges `#ff3131`, boutons primaires)
conservées volontairement.

**`component-library/` (6 fichiers)** :
- `views/componentListView.vue` — `cl--dark` + threading `:is-dark` vers `ComponentDeleteDialog`.
- `views/ComponentCreateView.vue` — `cc--dark` + threading `:is-dark` vers ses 4 enfants.
- `drawers/ComponentPickerDrawer.vue`, `drawers/IngredientPickerDrawer.vue` — prop `isDark` + `--dark` + CSS.
- `dialogs/NewTypeDialog.vue`, `dialogs/NewCategoryDialog.vue` — prop `isDark` + `--dark` + CSS.
- (Déjà OK, inchangés : `ComponentTypeList`, `ComponentCategoryList`, `ComponentTypeFormDrawer`,
  `ComponentCategoryFormDrawer`, `ComponentTypeCategoriesDrawer`, `ComponentDeleteDialog`.)

**`market-prices/` (5 fichiers)** :
- `components/MarketPriceTable.vue` — prop `isDark` + `market-table--dark` + CSS (table/chips/actions/expanded).
- `views/MarketPriceListView.vue` — threading `:is-dark` vers `MarketPriceTable`.
- `dialogs/MarketPriceDeleteItemDialog.vue`, `dialogs/MarketPriceDeleteSupplierDialog.vue` — classe
  `--dark` branchée (prop déjà reçue) + CSS footer/bouton.
- `drawers/MarketPriceEditSupplierDrawer.vue` — bloc `--dark` étendu (labels, inputs, v-select).
- (Déjà OK, inchangés : `MarketPriceCreateDrawer`, `MarketPriceCsvImportDrawer`, `MarketPriceEditDrawer`.)

## Risque de régression / à surveiller

- **Non testé en build** (règle de session : build côté dev) — à valider visuellement en dark sur
  `/menu-fb/components` et `/menu-fb/market-prices`.
- **Limite connue non traitée (hors périmètre)** : les mini-dialogs de création (`v-dialog` téléportés
  hors de la racine scopée `--dark`) restent en clair dans plusieurs drawers — défaut **pré-existant
  commun à tout le dossier**, non introduit par ce correctif. À traiter séparément si besoin (nécessite
  d'appliquer `isDark` directement sur la racine du mini-dialog, pas via sélecteur ancêtre).
- **Composants morts non traités** : `MarketPriceFilters` (importé mais non rendu) et `MarketPriceStats`
  (ni importé ni rendu) — aucun impact visuel, laissés tels quels.

## Références

- Pattern de référence : `ComponentTypeList.vue`, composants `space-menus` (cf. [BUG-121](121_spacemenus_drawers_i18n_darkmode_incomplet.md), [BUG-125](125_spacemenus_darkmode_non_propage_enfants.md)).
