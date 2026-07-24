# BUG-197 — Dark mode absent/incomplet sur les workspaces F&B (Inventory, Logistic, Restock) + résidus clairs dans Analyse

- **Statut** : 🟡 Corrigé non déployé (correctif écrit, **non vérifié en navigateur** — cf. « Risque de régression »)
- **Sévérité** : 🟡 Mineur (lisibilité en thème sombre)
- **Domaine** : Espaces & builder / Analyse & agrégation (transverse aux 3 workspaces F&B)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-23 · **Corrigé le** : 2026-07-24 (emmanuel)
- **Fichiers** : voir la liste en fin de fiche

## Symptôme

Suite à [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md), six défauts
restaient visibles en thème sombre, signalés un à un par l'utilisateur :

1. **Champ « Outils »** (`WorkspaceToolSelect`) blanc à texte sombre dans **Analyse** et
   **Logistic** — alors qu'il est correct dans EventPredict / Inventory / Restock.
2. **`/spaces/:id/inventory`** : fond de page clair, carte « Résumé », ascenseurs, skeleton,
   drawer de filtres mobile, interface de comptage, vues agrégées — tout en clair.
3. **Champs de recherche du panneau de filtres Inventory** restés blancs à texte sombre, alors
   que le reste du panneau était déjà sombre.
4. **Analyse, bandeau rouge** : la ligne « Tout l'historique » (période + « Comparer à ») peinte
   en quasi-noir **par-dessus** le rouge de marque.
5. **Cards « Répartition des PdV par CA » et « Répartition du CA par article »** : liseré blanc
   autour des 6 donuts.
6. **`/spaces/:id/logistic`** et **`/spaces/:id/restock?step=stock`** : pas de thème sombre du
   tout, ou fond de page resté clair.

## Cause racine

Cinq mécanismes distincts, tous vérifiés dans le code :

1. **Contrat `--fb-*` déclaré sur trop peu de racines.** Les workspaces F&B partagent un jeu de
   variables défini dans [`src/style.css:21-79`](../../src/style.css), mais **uniquement** sous
   `.event-predict-overlay`, `.space-inventory-view` et `.space-restock-view`. Les composants
   consommateurs écrivent `var(--fb-surface, #fff)` : hors de ces trois racines, **chaque `var()`
   retombe sur son littéral clair**, en clair comme en sombre. D'où :
   - `WorkspaceToolSelect` clair dans Analyse et Logistic (points 1) ;
   - toute la vue Logistic clair (point 6) alors qu'elle consomme déjà `--fb-*` partout
     (12 usages dans la vue, 14 à 29 par composant).
   Les **dialogs Logistic sont en plus téléportés** hors de la vue (`Teleport to="body"` pour
   `LogisticMovementDialog`, `v-dialog` pour `LogisticSimulateSaleDialog`) : même déclarée sur
   `.space-logistic-view`, la variable ne les atteindrait pas.
2. **Valeurs claires codées en dur** là où la variable existait pourtant : `--si-bg` / `--sr-bg`
   (fond de page Inventory et Restock) figés sur `#f6f8fb`, carte agrégat, ascenseurs, dégradé du
   skeleton, colonne fournisseurs de Restock, etc. (points 2 et 6).
3. **`bg-color="grey-lighten-5"` sur les champs Vuetify** — même piège que la cause n°4 de
   BUG-196 : Vuetify pose la classe `bg-grey-lighten-5` sur `.v-field`, qui déclare
   `background-color` **et** `color` en `!important`. Une règle sans `!important` ne la bat pas
   (point 3, 3 champs dans `InventoryFilterPanel`).
4. **Règle globale devenue fausse après refonte** :
   [`App.vue`](../../src/App.vue) déclarait `.v-theme--dataFridayDark .filter-summary
   { background-color: #1A1A1A }`. À l'époque, `FilterSummary` était un bandeau sticky autonome
   posé sur le fond de page. Depuis, il est rendu **dans** le bandeau rouge d'AnalyseView
   (`.av-header__row2`) : le fond noir repeignait donc la ligne « Tout l'historique » par-dessus le
   rouge. Aucune règle équivalente n'existait en clair, d'où un défaut visible en sombre seulement
   (point 4).
5. **Conflit de spécificité à égalité, tranché par l'ordre d'injection.**
   `DonutChartCard.vue` déclare `.donut-card { border-color: #EEEEEE !important }` (scopé, donc
   `.donut-card[data-v-…]` = spécificité `0,2,0`) et `App.vue` déclarait
   `.v-theme--dataFridayDark .donut-card { border-color: #3F3F46 !important }` (même `0,2,0`).
   Le composant étant chargé en lazy-import, **son style est injecté après** celui d'App.vue et
   gagnait — d'où la bordure blanche en sombre (point 5).

Un sixième point, découvert en traitant Logistic : le champ de recherche des filtres est un
`.form-control` **Bootstrap** (chargé globalement, `main.js:11`). La règle locale fixait `color`
mais pas `background` → le blanc de Bootstrap reprenait la main, soit un champ blanc à texte blanc
en sombre.

## Correction

- **`style.css`** : `.space-logistic-view` ajoutée aux deux blocs du contrat (clair + sombre), plus
  `.lgmv-overlay` et `.lgsim-card` (racines des deux dialogs téléportés). Pour celui téléporté dans
  `<body>`, c'est la variante `.dark …` qui prend le relais — `.v-theme--dataFridayDark` est posée
  sur le `v-app` et ne descend pas jusque là ; `html.dark` est bien resynchronisée à chaque
  changement de thème (`DashboardView.vue:683`).
- **Valeurs en dur → variables** (`var(--fb-*)` / `--si-*` / `--sr-*` / `--lg-*`), le littéral
  d'origine restant en fallback : **le mode clair est inchangé**. Traité sur Inventory (vue +
  6 composants), Logistic (vue + drawer d'historique + vue agrégée) et l'étape Stock de Restock
  (wizard, sliders, progression, pastilles de recette, colonne fournisseurs).
- **Blocs `.v-theme--dataFridayDark` ciblés** pour ce qui n'a pas de variable : ascenseurs,
  dégradé du skeleton, translucides noirs → blancs, voile blanc de la barre de navigation du
  wizard Restock, et les teintes sémantiques calibrées pour fond clair (ambre 700 `#b45309`,
  orange 600 `#ea580c`, vert 700 `#15803d`, rouge 700 `#b91c1c`) remplacées par la version claire
  de la même famille (`#fcd34d`, `#fdba74`, `#86efac`, `#fca5a5`).
- **Champs `bg-color="grey-lighten-5"`** : override `.v-field.bg-grey-lighten-5` en `!important`
  sur fond, texte, placeholder (avec `opacity: 1`) et icône. Le fond passe par `--fb-subtle`, qui
  vaut `#FAFAFA` en clair — **exactement** la valeur de `grey-lighten-5` chez Vuetify, donc rendu
  clair identique.
- **`App.vue`** : suppression du `background-color: #1A1A1A` sur `.filter-summary` (et de la règle
  `:hover` sur la bordure basse, vestige du même ancien bandeau) ; suppression du `border-color`
  mort sur `.donut-card`.
- **`DonutChartCard.vue`** : `border-color: transparent` sous `.v-theme--dataFridayDark`, dans le
  composant (seul endroit qui bat sa propre règle `!important`) — même parti pris que
  `ComponentCategoryList` dans BUG-196.
- **Bandeaux rouges `#ff3131` volontairement inchangés** dans les deux thèmes (Analyse, Inventory,
  Logistic, Restock), ainsi que leurs contrôles blancs translucides : parité Space Menus, déjà
  documentée dans les commentaires du code.

## Risque de régression / à surveiller

- **Aucune vérification en navigateur** : les 15 fichiers passent un contrôle de syntaxe CSS
  (blocs `<style>` fermés, accolades équilibrées), rien de plus. À reprendre écran par écran, en
  clair **et** en sombre — le mode clair est censé être inchangé (fallbacks identiques), c'est le
  point à contrôler en priorité.
- **Logistic** : ajouter la vue au contrat partagé lui applique aussi `color` et `font-family` à sa
  racine, comme aux trois autres vues F&B. La police est la même pile système que le `body`, mais
  l'héritage de couleur peut décaler un texte qui s'appuyait sur la valeur Vuetify.
- **Restock** : seule l'étape `?step=stock` a été passée en revue, à la demande. Les étapes
  `restock` et `shopping` partagent une partie des règles et en bénéficient partiellement, mais
  gardent des blocs en dur (tableaux, groupes fournisseurs, éditeur d'e-mail) — **reste à faire**.
- **`SpaceLogisticView`** consomme `var(--fb-*)` mais n'a pas de bloc `--dark` autonome : toute
  future racine de dialog/overlay téléportée devra être ajoutée à `style.css`, sinon elle repartira
  en clair. Même vigilance pour tout nouveau workspace F&B.
- **Pattern à ne pas reproduire** : une règle de thème globale dans `App.vue` qui vise une classe
  de composant (`.filter-summary`, `.donut-card`) est fragile — elle casse dès que le composant
  change de contexte (cause n°4) et perd les conflits de spécificité à égalité (cause n°5). Le
  thème sombre d'un composant appartient au composant.

## Références

- [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) — vague précédente
  (events, market-prices, component-library, products, référentiels, analyse) ; la cause n°4
  (`bg-color="grey-lighten-5"`) y est déjà décrite.
- [BUG-194](194_darkmode_incomplet_component_library_market_prices.md) — première vague.
- Contrat de variables partagé : [`src/style.css`](../../src/style.css) (lignes 21-91).
- Charte : [`../CHARTE_GRAPHIQUE.md`](../CHARTE_GRAPHIQUE.md) ·
  [ADR-0003](../adr/0003_charte_graphique_typographie.md).

## Fichiers touchés

| Fichier | Objet |
|---|---|
| `src/style.css` | `.space-logistic-view` + racines des 2 dialogs téléportés ajoutées au contrat `--fb-*` |
| `src/App.vue` | fond noir de `.filter-summary` retiré ; `border-color` mort de `.donut-card` retiré |
| `src/components/WorkspaceToolSelect.vue` | dark mode autonome (fallbacks sombres) |
| `src/components/analyse/charts/DonutChartCard.vue` | bordure blanche retirée en sombre |
| `src/views/SpaceInventoryView.vue` | fond de page, carte agrégat, ascenseurs, skeleton, bouton désactivé |
| `src/components/InventoryFilterPanel.vue` | champs `bg-color`, séparateur, kicker |
| `src/components/InventoryFilterDrawer.vue` | fond, bordure, titres, champs |
| `src/components/InventoryAggregateView.vue` | en-tête, stats, items, listes PdV, surcharges utilitaires |
| `src/components/InventoryCountingInterface.vue` | en-tête, placeholders, totaux, état vide |
| `src/components/InventoryShopCard.vue` | teintes sémantiques ambre/vert |
| `src/components/InventoryStorageAggregateView.vue` | kicker, bordure « complet », encart focus |
| `src/views/SpaceLogisticView.vue` | contrat `--lg-*`, cartes KPI, panneau de filtres, champ Bootstrap |
| `src/components/LogisticHistoryDrawer.vue` | en-têtes de date, compteurs, séparateurs |
| `src/components/LogisticAggregateView.vue` | carte englobante + cartes de groupe |
| `src/views/SpaceRestockView.vue` | fond de page, étape Stock, colonne fournisseurs |
