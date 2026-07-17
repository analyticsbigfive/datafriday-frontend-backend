# BUG-108 — Import CSV MenuItem : support du format multi-lignes (une ligne par recette) de l'export

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17 (demandé par l'utilisateur, suite à BUG-107)
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue`

## Symptôme

Le nouvel export CSV (BUG-107) produit une ligne par ingrédient/composant/packaging de la recette
de chaque article (donc plusieurs lignes CSV pour un même article). L'import CSV, lui, attendait
toujours une ligne = un article : réimporter tel quel un fichier exporté aurait créé un article en
double par ligne de recette au lieu d'un seul article avec sa recette complète.

## Cause racine

`MenuItemCsvImportDrawer.vue` n'avait aucune notion de "plusieurs lignes CSV = un seul article" ;
`HEADER_MAP` ne reconnaissait pas les nouvelles colonnes de l'export (Brand, Display Name Ref,
Kitchen Type, Number of Pieces, VAT %, Discount Type/Value, Storage Type, Diet, Space, Line
Type/Line Item Name/Line Quantity/Line Unit Cost/Line Total Cost) ; et l'ancien mécanisme de
recette (`parseRecipe`, colonne "Recipe" packée) résolvait par **ID interne**, jamais réutilisable
d'un compte à l'autre.

## Correction

- `HEADER_MAP` étendu à toutes les colonnes du nouvel export (avec un alias FR pour chacune).
  Collision évitée avec l'alias historique `'display name' → name` : la nouvelle colonne référence
  s'appelle `Display Name Ref` (export MenuItemView.vue renommé en conséquence).
- Nouvelle fonction `groupCsvRows()` : détecte la présence de la colonne `Line Item Name` et, si
  présente, regroupe les lignes CSV par nom d'article (une ligne CSV devient une entrée
  `recipeLines[]` de l'article correspondant) avant la résolution habituelle. Rétrocompatible :
  sans cette colonne, le comportement (une ligne = un article, éventuellement avec l'ancienne
  colonne "Recipe" packée) est inchangé.
- Nouveaux lookups nom→id (`ingredientNameToId`/`componentNameToId`/`packagingNameToId`/
  `brandNameToId`/`displayNameToId`/`spaceNameToId`), construits depuis les référentiels du
  **compte cible** (dispatch `marketPriceIngredients/fetchRows`, `packaging/fetchPackaging`,
  `menuComponents/fetchComponents`, `brandNames/fetchBrandNames`, `displayNames/fetchDisplayNames`,
  `spaces/fetchSpaces` à l'ouverture du drawer).
- `resolveRecipeLines(row)` : résout chaque ligne de recette PAR NOM contre ces lookups. Une ligne
  non résolue (ingrédient/composant/packaging inexistant dans ce compte) est simplement omise —
  l'article est quand même créé, sans cette ligne — et listée dans un nouveau bandeau
  d'avertissement à l'étape Aperçu (`unresolvedRecipeLines`), plutôt que de rejeter tout l'article.
- `buildPayload()` étendu pour envoyer aussi `kitchenType`, `numberOfPiecesRecipe`, `discountType`/
  `discountValue`, `vatRate`, `storageType`/`diet` (arrays), `brandId`/`displayNameId` (résolus par
  nom), `spaceIds` (résolus par nom), en plus des champs déjà supportés.
- Le routage bulk-vs-individuel de `runImport()` (déjà présent, BUG-085) fonctionne sans
  changement : un article avec des `ingredients`/`components`/`packagings` résolus passe par
  `createMenuItem` individuel (seul endpoint qui traite la recette), comme pour l'ancien format
  "Recipe" packé.
- Dédoublonnage par nom (BUG-086, `existingMenuItemNames`) inchangé et toujours actif sur ce
  nouveau format — réimporter deux fois le même export n'est toujours pas censé créer de doublons.

## Risque de régression / à surveiller

- Tester un aller-retour complet export→import sur un même compte (round-trip) puis vers un
  compte différent (les ingrédients/composants/packagings portant des noms différents ou absents
  doivent apparaître dans `unresolvedRecipeLines`, pas planter l'import).
- Un ingrédient/composant/packaging dont le NOM est ambigu (même nom sur deux entités distinctes)
  résout vers la première correspondance trouvée — comportement best-effort assumé, cohérent avec
  la résolution par nom déjà utilisée ailleurs dans ce domaine (type/catégorie, BUG-087).
- Vérifier que `createMenuItem` accepte bien `brandId`/`displayNameId`/`spaceIds` en plus des
  champs déjà testés (`CreateMenuItemDto` les déclare tous en optionnels — non testé en conditions
  réelles dans ce lot, `pnpm dev` interdit dans cette session).

## Références

- [[107_menu_items_export_csv_lent_incomplet_ids_bruts]]
- [[86_menu_items_csv_pas_de_dedup_reimport]]
- [[87_menu_items_csv_resolution_type_categorie_fragile]]
