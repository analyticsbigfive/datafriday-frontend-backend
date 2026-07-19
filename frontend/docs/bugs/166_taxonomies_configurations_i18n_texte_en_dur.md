# BUG-166 — Taxonomies Configurations : chaînes FR/EN codées en dur dans les drawers/dialogs (10 écrans)

- **Statut** : 🔴 Ouvert
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

## Risque de régression / à surveiller

Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement en
basculant la langue et déclenchant chaque état d'erreur (nom vide, échec réseau, suppression
bloquée) sur les 10 écrans.

## Références

- [BUG-156](156_taxonomydetaildrawer_i18n_texte_en_dur.md) — correctif de référence, même famille, domaine Événements.
- [BUG-165](165_referentiels_plats_duplication_non_factorisee.md) — dette technique sous-jacente qui multiplie ce bug par 4 sur les référentiels plats.
