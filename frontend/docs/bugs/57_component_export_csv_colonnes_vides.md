# BUG-057 — Export CSV Components : "Number of Units Recipe" et "Description" toujours vides

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/componentListView.vue` (`onExportCsv`, `normalizeComponent`)

## Symptôme

Sur `/components`, le bouton "Export CSV" produisait un fichier avec 2 colonnes systématiquement
vides ("Number of Units Recipe", "Description"), quel que soit le composant.

## Cause racine

`onExportCsv()` construisait chaque ligne à partir de `this.componentsList`, qui contient des objets
déjà normalisés par `normalizeComponent()` — dont la forme exposée est `{id, name, category, type,
unit, unitsPerRecipe, storageType, unitCost, subItemsCount, _raw}`. Or le code lisait
`component?.numberOfUnitsRecipe` (clé inexistante — la vraie clé normalisée est `unitsPerRecipe`) et
`component?.description` (jamais produit du tout par `normalizeComponent`, qui ne capturait pas ce
champ). Les deux étaient donc toujours `undefined` → chaîne vide dans le CSV.

La colonne "Type" (`component?.componentCategory || component?.type`) fonctionnait par coïncidence :
`componentCategory` n'existe pas non plus sur l'objet normalisé, mais le fallback `|| component?.type`
retombait sur la bonne valeur — ce n'était donc pas cassé, juste une clé morte inutile dans la chaîne
de fallback (nettoyée au passage).

## Correction

- `normalizeComponent()` : ajout de `description: String(raw?.description ?? "")` à l'objet
  retourné.
- `onExportCsv()` : `component?.numberOfUnitsRecipe` → `component?.unitsPerRecipe` ; retrait de la
  clé morte `component?.componentCategory` dans le fallback de la colonne "Type" (ne gardait que
  `component?.type`, seule clé réellement présente).

## Risque de régression / à surveiller

Exporter un composant ayant une description et un `numberOfUnitsRecipe` non nul, ouvrir le CSV,
confirmer que les deux colonnes sont bien remplies.

## Références

- Aucune fiche liée.
