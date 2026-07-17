# BUG-107 — Export CSV MenuItem : lent (N+1), champs incomplets, recette en IDs bruts non portables

- **Statut** : 🟢 Corrigé (export uniquement — voir "Risque" pour le volet réimport)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17 (signalé par l'utilisateur)
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue` (`onExportCsv`)

## Symptôme

1. Cliquer sur "Exporter CSV" prenait énormément de temps avant que le téléchargement démarre.
2. Le fichier exporté n'avait qu'une poignée de colonnes (Name/Type/Category/Space/Price TTC/
   Price HT/VAT/Ready for Sale/Combo Item/Description/Recipe) — brand, display name, kitchen
   type, nombre de pièces recette, remise, storage, diet/allergènes absents.
3. La colonne "Recipe" packait tous les ingrédients/composants/packagings d'un article en une
   seule cellule avec un format `id>Type>entityId>entityId>quantité` séparé par `|` — illisible,
   et surtout basé sur des **IDs internes** (`ingredientId`/`componentId`/`packagingId`) qui
   n'ont aucun sens en dehors du tenant où l'export a été fait.

## Cause racine

1. **Lenteur** : `onExportCsv` refaisait un appel `getMenuItemById(id)` PAR ARTICLE (`runWithConcurrency`, concurrence 5) pour récupérer le détail ingrédients/composants/packagings —
   alors que ces relations sont **déjà incluses** dans la réponse de `GET /menu-items` (liste)
   via `includeRelations` côté backend (`menu-items.service.ts:63-91`, mêmes relations que le
   détail unitaire). `item._raw` (déjà chargé via `fetchMenuItems`) contenait donc déjà tout ce
   qu'il fallait — les N appels réseau supplémentaires étaient purs gaspillage, sur un backend
   déjà documenté comme lent.
2. **Champs incomplets** : la liste de colonnes n'avait jamais été mise à jour pour suivre les
   champs ajoutés au modèle `MenuItem` (`docs/modules/04_MENU_CATALOGUE.md`).
3. **IDs bruts** : `buildRecipeString()` construisait la colonne Recipe à partir de
   `ing.ingredientId`/`comp.componentId`/`pkg.packagingId` — jamais des noms, alors que
   `item._raw.ingredients[].ingredient.name` (et équivalents component/packaging) étaient
   disponibles.

## Correction

- Suppression complète de la boucle `getMenuItemById`/`runWithConcurrency` — l'export utilise
  désormais uniquement `item._raw` (déjà en mémoire), zéro appel réseau supplémentaire.
- Colonnes étendues : Name, Type, Category, Brand, Display Name, Ready for Sale, Kitchen Type,
  Combo Item, Number of Pieces (Recipe), Price TTC, Price HT, VAT %, Discount Type, Discount
  Value, Storage Type, Diet, Space, Description.
- **Une ligne par ligne de recette** (ingrédient/composant/packaging) au lieu d'une colonne
  packée : `Line Type`, `Line Item Name` (le **nom**, pas l'id), `Line Quantity`, `Line Unit
  Cost`, `Line Total Cost`. Un article sans aucune ligne de recette garde une ligne dans l'export
  (colonnes de ligne vides) pour ne pas disparaître silencieusement du fichier.

## Risque de régression / à surveiller

**Le réimport n'est PAS encore compatible avec ce nouveau format.** `MenuItemCsvImportDrawer.vue`
(l'import CSV d'articles) attend toujours UNE ligne = UN article — réimporter tel quel un export
produit par ce fix créerait un article en double par ligne de recette. Une extension du volet
import (regroupement multi-lignes par article, résolution ingrédient/composant/packaging par nom
avec gestion des noms non trouvés, déduplication) est nécessaire pour un vrai aller-retour
export→import — **non faite dans ce lot**, à traiter séparément si besoin confirmé.

## Références

- [[86_menu_items_csv_pas_de_dedup_reimport]] (dédoublonnage sur l'import existant, pattern à
  réutiliser si le volet réimport de ce nouveau format est construit).
