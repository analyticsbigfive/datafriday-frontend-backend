# BUG-166 — Taxonomies Configurations : chaînes FR/EN codées en dur dans les drawers/dialogs (10 écrans)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** (liste non exhaustive, un échantillon par écran) :
  - `src/components/market-prices/views/MarketPriceTypeList.vue:208` (`"Failed to load types"`, EN), `MarketPriceCategoryList.vue:200` (`"Failed to load categories"`, EN) — mélangées avec `:258,263,272,274` en FR dans le même fichier
  - `src/components/market-prices/drawers/MarketPriceTypeFormDrawer.vue:112,133`, `MarketPriceCategoryFormDrawer.vue:128-129,137,156`
  - `src/components/market-prices/drawers/MarketPriceTypeCategoriesDrawer.vue:43` (`<v-chip>Category</v-chip>` en dur, EN, dans une UI FR)
  - `src/components/menu-fb/views/component-library/drawers/ComponentTypeFormDrawer.vue:112,118,133`, `ComponentCategoryFormDrawer.vue:128-129,137,156`
  - `src/components/menu-fb/views/component-library/views/ComponentTypeList.vue:258,264,273,275`, `ComponentCategoryList.vue:247,256,258`
  - `src/components/menu-fb/views/component-library/dialogs/NewTypeDialog.vue:22,74`, `NewCategoryDialog.vue:80,101`
  - `src/components/brand-name/drawers/BrandNameFormDrawer.vue:43,104,110,125`, `BrandNameDeleteDialog.vue:35` (+ 3 équivalents `DisplayName*`)
  - `src/components/industrial/drawers/IndustrialFormDrawer.vue:43,104,110,125`, `IndustrialDeleteDialog.vue:35` (+ 2 équivalents `PackingType*`)
  - `src/components/products/views/ProductTypeList.vue` / `ProductCategoryList.vue` (mêmes motifs "Identifiant manquant"/"Échec de...")

## Symptôme

Sur les 10 écrans de Configurations, tous les labels statiques passent bien par `t()`, mais les
messages d'erreur/validation/état de chargement sont codés en dur dans le script, en français ou en
anglais selon le fichier (parfois les deux mélangés dans le même composant). Viole la règle
`frontend/CLAUDE.md` "no hardcoded user-facing text in templates" et empêche ces messages de suivre
le changement de langue (`appLocale`).

## Cause racine

Ces 10 écrans ont été écrits par copie successive (voir [BUG-165](165_referentiels_plats_duplication_non_factorisee.md))
sans jamais faire passer les messages d'erreur/validation par `useI18n()`/`t()`, contrairement au
reste de chaque même fichier.

## Correction

Reste à faire : appliquer le même correctif que [BUG-156](156_taxonomydetaildrawer_i18n_texte_en_dur.md)
(déjà fait pour la taxonomie Événements — nouvelles clés `t()` par écran, en/fr dans
`translations.js`) aux 10 écrans de Configurations. Vu le nombre d'écrans concernés, envisager de
faire ce nettoyage **après** le refactor de factorisation (BUG-165) pour n'écrire les clés qu'une
seule fois dans le composant générique plutôt que 4× à l'identique pour les référentiels plats.

Volet Good taxonomy (MarketPrice Type/Category) traité : dans `MarketPriceTypeList.vue`, le
fallback `"Failed to load types"` (:208) et les messages FR en dur `"Identifiant manquant"` (:258),
`"Impossible de supprimer un Good Type lié à des catégories."` (:263 et :272) et `"Échec de la
suppression"` (:274) passent désormais par `t('marketPriceTypeList.loadError'|'missingId'|
'deleteBlockedCategories'|'deleteError')`. Même traitement dans `MarketPriceCategoryList.vue` :
`"Failed to load categories"` (:200) → `loadError`, `"Identifiant manquant"` (:247) → `missingId`,
`"Impossible de supprimer une Good Category utilisée dans le système."` (:256) →
`deleteBlockedUsed`, `"Échec de la suppression"` (:258) → `deleteError`, sous la clé
`marketPriceCategoryList.*`. Dans `MarketPriceTypeFormDrawer.vue`, `"Le nom est requis"` (:112) →
`marketPriceTypeList.nameRequired`, `"Identifiant manquant"` (:118) → `marketPriceTypeList.missingId`
(clé réutilisée, même namespace que la liste), `"Échec de la sauvegarde"` (:133) →
`marketPriceTypeList.saveError`. Dans `MarketPriceCategoryFormDrawer.vue`, `"Le nom est requis"`
(:128) → `marketPriceCategoryList.nameRequired`, `"Le type est requis"` (:129) →
`marketPriceCategoryList.typeRequired`, `"Identifiant manquant"` (:137) →
`marketPriceCategoryList.missingId`, `"Échec de la sauvegarde"` (:156) →
`marketPriceCategoryList.saveError`. Dans `MarketPriceTypeCategoriesDrawer.vue`, le chip `<v-chip>
Category</v-chip>` (:43, anglais en dur dans une UI FR) → `t('marketPriceTypeList.categoryChipLabel')`
(EN "Category" / FR "Catégorie"). 14 nouvelles clés ajoutées en `en`/`fr` dans `translations.js`,
insérées immédiatement après les blocs de clés `marketPriceTypeList*`/`marketPriceCategoryList*`
existants (pas de clé "saving" dédiée ajoutée pour ces deux drawers : contrairement aux dialogs de
BUG-156, aucun texte "Enregistrement…"/"Saving…" n'était codé en dur ici — le bouton reste juste
`:disabled="loading"`). Ni `ComponentType*`/`ComponentCategory*`, ni `NewTypeDialog`/
`NewCategoryDialog`, ni `BrandName*`/`DisplayName*`, ni `Industrial*`/`PackingType*`, ni
`ProductType*`/`ProductCategory*` n'ont été touchés dans ce passage (autres volets du même bug,
traités séparément).

Volet Industrial/PackingType traité : dans `IndustrialFormDrawer.vue`, le bouton "Sauvegarde…" (:43)
→ `t('industrialList.saving')`, `"Le nom est requis"` (:104) → `industrialList.nameRequired`,
`"Identifiant manquant"` (:110) → `industrialList.missingId`, `"Échec de la sauvegarde"` (:125) →
`industrialList.saveError`. Dans `IndustrialDeleteDialog.vue`, le bouton "Suppression…" (:35) →
`industrialList.deleting`. Dans `IndustrialListView.vue`, `"Identifiant manquant"` (:197)
→ `industrialList.missingId` (clé réutilisée, même namespace que le drawer/dialog) et `"Échec de la
suppression"` (:203) → `industrialList.deleteError`. `PackingTypeFormDrawer.vue`,
`PackingTypeDeleteDialog.vue` et `PackingTypeListView.vue` étant des duplicatas quasi identiques
(mêmes numéros de ligne), traités à l'identique sous le namespace `packingTypeList.*` (`saving`,
`nameRequired`, `missingId`, `saveError`, `deleting`, `deleteError`). Les 3 composants Industrial et
les 3 composants PackingType partageaient déjà un même namespace de clés par écran
(`industrialList.*` / `packingTypeList.*`, pas un namespace par composant) pour les labels
statiques existants — convention reprise ici plutôt que le pattern par-composant de BUG-156 pour
rester cohérent avec l'existant local. 12 nouvelles clés ajoutées en `en` et 12 en `fr` dans
`translations.js` (6 par namespace `industrialList*`/`packingTypeList*`), insérées immédiatement
après les blocs de clés existants correspondants.

Volet Menu Item (Product) / Component / NewType-NewCategory dialogs traité (2026-07-19, session
ultérieure) : suit exactement la même convention `xxxList.loadError`/`.missingId`/
`.deleteBlockedCategories`|`.deleteBlockedUsed`/`.deleteError`/`.nameRequired`/`.typeRequired`/
`.saveError` déjà posée par le volet Good/MarketPrice ci-dessus (clés réutilisées entre List et
FormDrawer d'un même écran, namespace par écran).

- `ProductTypeFormDrawer.vue:112,118,133` → `productTypeList.nameRequired`/`.missingId`/
  `.saveError`. `ProductTypeList.vue` (`loadTypes` catch, `confirmDelete`) → `.loadError`,
  `.missingId`, `.deleteBlockedCategories`, `.deleteError`.
- `ProductCategoryFormDrawer.vue:230-260` → `productCategoryList.nameRequired`/`.typeRequired`/
  `.missingId`/`.saveError` ; le sous-dialog inline "créer un type" (jusqu'ici entièrement en dur :
  titre, sous-titre, label, placeholder, message "existe déjà", erreur de création) → nouvelles
  clés `.newTypeTitle`/`.newTypeSubtitle`/`.newTypeLabel`/`.newTypePlaceholder`/`.typeExists`
  (avec un placeholder `{name}` remplacé manuellement en JS, faute de support d'interpolation dans
  `t()`)/`.typeCreateError` ; les boutons Annuler/Créer du sous-dialog réutilisent les clés
  `.cancel`/`.create` déjà existantes. `ProductCategoryList.vue` (`loadCategories` catch,
  `confirmDelete`) → `.loadError`, `.missingId`, `.deleteBlockedUsed`, `.deleteError`.
- `ComponentTypeFormDrawer.vue:112,118,133` → `componentTypeList.nameRequired`/`.missingId`/
  `.saveError`. `ComponentTypeList.vue` (`loadTypes` catch, `confirmDelete`) → `.loadError`,
  `.missingId`, `.deleteBlockedCategories`, `.deleteError`.
- `ComponentCategoryFormDrawer.vue:128-129,137,156` → `componentCategoryList.nameRequired`/
  `.typeRequired`/`.missingId`/`.saveError`. `ComponentCategoryList.vue` (`loadCategories` catch,
  `confirmDelete`) → `.loadError`, `.missingId`, `.deleteBlockedUsed`, `.deleteError`.
- `NewTypeDialog.vue:22,74` → `compCreateNewTypeDialogCreating` (bouton "Création…") /
  `compCreateNewTypeDialogGenericError`.
- `NewCategoryDialog.vue:17-18,22,80,101` → `compCreateNewCategoryDialogChooseTypeFirst` +
  `compCreateNewCategoryDialogTypeNotRecognized` (message d'avertissement composé, avec le nom de
  type interpolé directement dans le template comme c'était déjà fait pour `itemName` dans
  `BrandNameDeleteDialog.vue`), `compCreateNewCategoryDialogCreating` (bouton "Création…"),
  `compCreateNewCategoryDialogTypeRequiredError`, `compCreateNewCategoryDialogGenericError`.
  Namespace `compCreate*` réutilisé (déjà utilisé par ces 2 dialogs pour leurs labels statiques)
  plutôt qu'un nouveau namespace par dialog, pour rester cohérent avec l'existant local — même
  logique que le choix `industrialList*`/`packingTypeList*` ci-dessus.
- `BrandNameFormDrawer.vue:43,104,110,125` → `brandNameList.saving`/`.nameRequired`/`.missingId`/
  `.saveError`. `BrandNameDeleteDialog.vue:35` → `brandNameList.deleting`. `BrandNameListView.vue`
  (`loadBrands` catch, `confirmDelete`, + `:36` compteur `"{{n}} marques"` en dur) →
  `.loadError`/`.missingId`/`.deleteError`, et branchement du compteur sur la clé
  `brandNameListTotalBrands` déjà existante (vérifiée présente en `en`/`fr`, pas de doublon créé).
- `DisplayNameFormDrawer.vue`/`DisplayNameDeleteDialog.vue`/`DisplayNameListView.vue` : mêmes
  motifs, mêmes lignes, sous `displayNameList.*` (`.saving`, `.nameRequired`, `.missingId`,
  `.saveError`, `.deleting`, `.loadError`, `.deleteError`) — le compteur `totalDisplayNames` de
  `DisplayNameListView.vue:36` utilisait déjà `t('displayNameList.totalDisplayNames')`, aucun
  changement nécessaire là.

Toutes les nouvelles clés insérées immédiatement après le bloc de clés existant de chaque écran
(`productTypeList*`/`productCategoryList*`/`componentTypeList*`/`componentCategoryList*`/
`brandNameList*`/`displayNameList*`/`compCreate*`) en `en` et en `fr`, syntaxe vérifiée avec
`node --check src/i18n/translations.js` (OK). `ComponentTypeList.vue`/`ComponentCategoryList.vue`/
`ComponentTypeFormDrawer.vue`/`ComponentCategoryFormDrawer.vue`/`marketPriceTypes.js`/
`marketPriceCategories.js`/`componentTypes.js`/`componentCategories.js`/tout fichier drawer
MarketPrice n'ont pas été touchés côté store ou logique métier dans ce passage (uniquement les
chaînes en dur listées ci-dessus, dans les fichiers `.vue` explicitement dans le périmètre de cette
tâche).

## Risque de régression / à surveiller

Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement en
basculant la langue et déclenchant chaque état d'erreur (nom vide, échec réseau, suppression
bloquée) sur les 10 écrans.

## Références

- [BUG-156](156_taxonomydetaildrawer_i18n_texte_en_dur.md) — correctif de référence, même famille, domaine Événements.
- [BUG-165](165_referentiels_plats_duplication_non_factorisee.md) — dette technique sous-jacente qui multiplie ce bug par 4 sur les référentiels plats.
