# BUG-165 — Référentiels plats (Brand/Display/Industrial/PackingType) : duplication quasi totale, jamais factorisée

- **Statut** : 🔴 Ouvert
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

Reste à faire : extraire un composant `TaxonomyListView`/`FlatReferentialListView` générique
(props : titre, icône, module store, client API, clés i18n) + un store factory Vuex générique
(`createFlatReferentialModule(apiClient)`), puis migrer les 4 implémentations dessus. Chantier de
refactor, pas un bug fonctionnel isolé — à planifier séparément des correctifs de bugs.

## Risque de régression / à surveiller

Un refactor de cette ampleur doit être suivi d'un test manuel complet des 4 écrans (create/edit/
delete/liste/recherche) avant merge, aucun test automatisé n'existant sur ces pages à ce jour
(à vérifier).

## Références

- [BUG-166](166_taxonomies_configurations_i18n_texte_en_dur.md) — conséquence directe de cette duplication (mêmes chaînes en dur, dupliquées).
- [BUG-160](160_brand_displayname_optimistic_write_objet_partiel.md) — autre bug dupliqué par cette même architecture.
