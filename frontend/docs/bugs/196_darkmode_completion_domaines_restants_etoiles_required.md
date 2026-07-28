# BUG-196 — Dark mode incomplet sur les domaines restants + étoiles « required » incohérentes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (lisibilité en thème sombre + cohérence UI)
- **Domaine** : Transverse (Événements, Achats/référentiels, Menu & recettes, Analyse, Header workspace)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-23 · **Corrigé le** : 2026-07-23 (emmanuel)
- **Fichiers** : voir liste ci-dessous

## Symptôme

Suite à [BUG-194](194_darkmode_incomplet_component_library_market_prices.md) (dark component-library +
market-prices menu-fb) et au dark de `menu-items`, plusieurs dossiers restaient **partiellement ou pas
du tout** en thème sombre :

- **`components/events`** : dialogs (Type/Category/Subcategory/Delete), drawers (Form/TaxonomyDetail),
  vues (List/Type/Category/Subcategory) — fonds clairs, boutons Cancel, bandeaux d'erreur, chips/pills,
  bordures de colonnes. **+ bug fonctionnel** : les menus déroulants des `v-select` du `EventFormDrawer`
  passaient **sous** le drawer (z-index) → options invisibles.
- **`components/market-prices`** (top-level) : FormDrawers Type/Category, TypeCategoriesDrawer, vues
  Type/Category — champs `.v-field` + boutons Cancel restés clairs.
- **`components/menu-fb/.../component-library`** : dialogs `NewType`/`NewCategory` (bordures d'inputs
  blanches, fond « trop bleu »), drawers `ComponentType`/`ComponentCategoryFormDrawer` (fond bleuté,
  bordures blanches), vues `ComponentType`/`CategoryList` (bordure blanche de la carte tableau).
- **`components/products`** : bordure blanche des tableaux + du champ des drawers de création.
- **Référentiels génériques** `common/FlatReferential{ListView,FormDrawer,DeleteDialog}` : trous dark
  (bandeau d'erreur, icônes, hover boutons) — impactant **brand-name, display-name, industrial,
  packing-type** (tous des thin wrappers).
- **`views/DashboardView`** : les sous-menus de la section « Configuration » du settings-drawer.
- **`components/analyse`** (17 fichiers UI) : aucun dark. + la barre du haut partagée
  `WorkspaceAppHeader` forçait un fond blanc translucide même en dark.
- **Étoiles « required »** : incohérentes — soit absentes, soit un ` *` **en texte simple intégré dans
  les chaînes i18n** (souvent en EN seulement, pas en FR), donc noir au lieu du rouge de marque.

## Cause racine

1. Composants sans le pattern dark du projet (prop/`useTheme()` → classe racine `--dark` → CSS scopé).
2. Couleurs claires **codées en dur** (`#fff`, `#e5e7eb`, `#212121`…) sans override sous `--dark`.
3. `v-dialog`/menus **téléportés** : classe `--dark` posée sur un ancêtre scopé qui ne les atteint pas
   (il faut la poser sur leur racine propre).
4. Champs Vuetify avec `bg-color="grey-lighten-5"` : Vuetify applique un **style inline** sur `.v-field`
   → une règle de classe sans `!important` ne le bat pas (d'où les champs blancs en dark).
5. `v-select` dans un drawer téléporté : **z-index** du menu (~2000) < z-index du drawer (2200).
6. Étoiles required : ` *` mélangé au libellé i18n au lieu d'un `<span class="…-star">` rouge séparé.

## Correction

- **Dark autonome** ajouté partout où il manquait : `useTheme()` → `isDark` → classe racine `--dark` →
  blocs CSS scopés (palette repo : fonds `#0f172a`/`#1e293b`/`#111827`/`#1f2937`, textes
  `#f9fafb`/`#e2e8f0`/`#94a3b8`, bordures `rgba(255,255,255,.08–.14)`/`#374151`). Rouge marque `#ff3131`
  conservé (en-têtes, boutons primaires, focus).
- **Dialogs/menus téléportés** : classe `--dark` sur leur racine propre ; boutons Cancel des dialogs
  events ciblés via `.eds--dark` (racine du shell) car slottés hors du wrapper `--dark`.
- **Champs `bg-color="grey-lighten-5"`** : override `:deep(.v-field) { background: … !important }`.
- **z-index** : `:menu-props="{ zIndex: 2500 }"` sur les 7 selects/autocompletes du `EventFormDrawer`.
- **Étoiles required** : ` *` retiré des chaînes i18n (EN + FR) et remplacé par
  `<span class="…-star">*</span>` rouge dans les templates (events, market-prices, component-library,
  products). Labels de section (icône + `<span>`) ajoutés aux dialogs events.
- **Génériques `FlatReferential*`** complétés (bénéficie aux 4 familles référentielles).
- **DashboardView** : bloc dark scopé `.dark .settings-drawer …` pour les sous-menus Configuration.
- **`analyse` (UI)** : 17 fichiers passés en dark, palette unifiée sur celle de `MarketPriceListView`
  (`#0f172a`/`#1e293b`). `WorkspaceAppHeader` (header partagé) : dark autonome → barre du haut + pastilles
  KPI sombres sur **toutes** les vues workspace.

## Risque de régression / à surveiller

- **Non testé en build** (règle de session : build côté dev) — à valider visuellement en dark.
- **`analyse/charts` (6 charts chart.js)** : NON traités (phase 2) — le dark s'y fait en reconfigurant
  les options chart.js (grilles/ticks/légendes/tooltips/séries) selon `isDark`, avec validation visuelle.
- **`AnalyseAppHeader.vue`** : passé en dark mais **plus rendu** par AnalyseView (les KPI ont migré vers
  `WorkspaceAppHeader`) → dark inoffensif mais inutile là.
- Quelques `color: #1f2937/#111827` de **texte mode clair** ont été décalés en `#1e293b/#0f172a` par
  l'unification analyse (toujours sombres, imperceptible).

## Références

- [BUG-194](194_darkmode_incomplet_component_library_market_prices.md) — dark component-library +
  market-prices (menu-fb).
- [BUG-195](195_market_prices_dialogs_type_categorie_dupliques_create_edit.md) — dialogs dupliqués.
- Pattern dark : `ComponentTypeList.vue`, composants `space-menus` ([BUG-121](121_spacemenus_drawers_i18n_darkmode_incomplet.md), [BUG-125](125_spacemenus_darkmode_non_propage_enfants.md)).
