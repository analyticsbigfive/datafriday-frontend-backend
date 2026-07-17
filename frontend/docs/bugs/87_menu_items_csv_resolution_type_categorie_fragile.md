# BUG-087 — Import CSV MenuItem : résolution type/catégorie fragile et silencieuse

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue:434-442`

## Symptôme

Deux problèmes liés :
1. Si deux types différents possèdent chacun une catégorie nommée identiquement (ex. "Standard"),
   l'import peut associer au menu item la catégorie du **mauvais type** — FK incorrecte, silencieuse.
2. Si le texte `type`/`category` de la ligne CSV ne correspond exactement à aucun référentiel connu
   (recherche exacte insensible à la casse), l'item est quand même créé — juste sans `typeId`/
   `categoryId` — sans avertir l'utilisateur, alors que ces champs sont **requis** dans le
   formulaire manuel (`MenuItemCreateView.vue`).

## Cause racine

```js
catObj = this.productCategories.find(c => c.name.toLowerCase() === row.category...) // pas de filtre par typeId
if (typeObj?.id) payload.typeId = ...    // ajout conditionnel silencieux, pas un rejet de ligne
if (catObj?.id) payload.categoryId = ... // idem
```

## Correction

`productCategories` est désormais filtré par `typeId` résolu avant de matcher le nom de catégorie,
comme le fait le formulaire manuel. Une ligne dont le type ou la catégorie ne se résout pas bascule
en ligne invalide (exclue de `validRows`, affichée dans le récapitulatif "ignorées" avec le motif),
au lieu de créer un item incomplet sans FK.

## Risque de régression / à surveiller

Vérifier qu'un CSV avec des noms de type/catégorie légèrement différents (espaces, casse) reste
importable — la recherche insensible à la casse est conservée, seul le scoping par type et le rejet
explicite changent.

## Références

- [[43_market_prices_import_csv_supplierid_jamais_resolu]] (même classe de bug sur `/market-prices`).
