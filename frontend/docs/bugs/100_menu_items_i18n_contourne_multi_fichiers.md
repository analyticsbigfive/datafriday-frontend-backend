# BUG-100 — i18n contourné / texte en dur sur toute la page `/menu-items`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `MenuItemView.vue` (boutons, dialogue suppression masse, en-têtes colonnes), `MenuItemCreateView.vue` (titres de section, labels allergènes, messages de validation/succès), `RecipeImportDrawer.vue` (fichier entier, `useI18n()` jamais importé), `ComponentPickerDrawer.vue` ("Aucun composant trouvé"/"Tous"), `IngredientPickerDrawer.vue`/`PackagingPickerDrawer.vue` (en-têtes de tableau, mélange EN/FR selon le drawer), `SpaceGroupDrawer.vue` (mode vue non traduit), `CreateCategoryDialog.vue`/`CreatePackingTypeDialog.vue`/`CreateTypeDialog.vue` (messages de validation), `MenuItemDeleteDialog.vue` (props par défaut en dur, appelants qui bypassent `t()`)

## Symptôme

Le reste de chaque fichier utilise systématiquement `t(...)`, mais de nombreux libellés visibles
restent codés en dur (le plus souvent en français). En anglais, ces textes resteraient affichés en
français. Cas le plus flagrant : `RecipeImportDrawer.vue` n'importe même pas `useI18n()` — 100% de
son texte est en dur. Autre cas notable : `IngredientPickerDrawer.vue` a des en-têtes de colonnes
en anglais ("Item name"/"Supplier") tandis que `PackagingPickerDrawer.vue`, quasi-jumeau, les a en
français ("Item"/"Fournisseur") — un mélange de langues sans rapport avec la locale active de
l'utilisateur.

## Cause racine

Développement incrémental de chaque drawer/dialog sans passage systématique par `translations.js`
au moment de l'écriture — contrairement à la règle CLAUDE.md "no hardcoded user-facing text in
templates".

## Correction

Toutes les chaînes listées ci-dessus migrées vers `translations.js` (clés `menuItemLib.*`/
`menuItemCreate.*` ajoutées côté EN et FR) et consommées via `t()`. `useI18n()` importé et câblé
dans `RecipeImportDrawer.vue`. Les en-têtes divergents entre `IngredientPickerDrawer.vue` et
`PackagingPickerDrawer.vue` sont unifiés sous les mêmes clés partagées.

## Risque de régression / à surveiller

Vérifier en basculant la locale EN que tous les nouveaux libellés s'affichent correctement (pas de
clé manquante affichée brute), en particulier dans les messages d'erreur/validation qui étaient
auparavant construits par concaténation.

## Références

- [[61_component_i18n_contourne_localstorage_manuel_et_textes_en_dur]] (même classe de dette sur
  `/components`).
