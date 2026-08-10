# BUG-310-02 — Menu item : sélectionner deux fois le même ingrédient/composant/packaging/combo renvoie une erreur serveur brute

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-10
- **Fichiers** : `backend/src/features/menu-items/menu-items.service.ts` — `update()` (catch, ~ligne 933),
  `create()` (catch, ~ligne 426), `replaceComponents()`, `replaceIngredients()`, `replacePackagings()`,
  `replaceComboItems()` (catch de chacune)

## Symptôme

En sélectionnant deux fois le même ingrédient (ou composant/packaging/article combo) dans la
recette d'un menu item puis en sauvegardant, l'utilisateur voit remonter le message d'erreur Prisma
brut au lieu d'un message compréhensible :

```
Invalid `prisma.menuItem.update()` invocation: Unique constraint failed on the fields: (`menuItemId`,`ingredientId`)
```

## Cause racine

`MenuItemIngredient`/`MenuItemComponent`/`MenuItemPackaging`/`MenuItemCombo` portent chacun une
contrainte unique (`@@unique([menuItemId, ingredientId])` etc., `schema.prisma:2404/2421/2438` et
`@@unique([parentId, childId])` pour les combos, `:2341`). `update()` recrée ces lignes à chaque
sauvegarde (`deleteMany` + `create` à partir des lignes envoyées par le formulaire) sans dédupliquer
— deux lignes identiques dans le payload déclenchent une violation `P2002` côté Postgres.

Le `catch` de `update()` ne gérait **pas du tout** `P2002` (seulement `P2003`/`P2025`) : l'erreur
Prisma remontait donc telle quelle en 500, exposant le message technique brut au frontend, qui
l'affiche directement (`e?.response?.data?.message`,
`frontend/.../MenuItemCreateView.vue:1198`). `create()` gérait `P2002` mais seulement pour le cas
« nom déjà utilisé », pas pour les lignes de recette en double. Les routes `replaceComponents`,
`replaceIngredients`, `replacePackagings`, `replaceComboItems` avaient le même trou.

## Correction

Ajout d'un helper `describeMenuItemUniqueConstraintError(error)` qui lit `error.meta.target` (liste
des colonnes de la contrainte violée) et retourne un message FR ciblé selon le champ en conflit
(`ingredientId`/`componentId`/`packagingId`/`childId`), avec repli sur le message "nom déjà utilisé"
sinon. Branché dans le `catch` de `create()`, `update()`, `replaceComponents()`,
`replaceIngredients()`, `replacePackagings()`, `replaceComboItems()`.

Aucun changement frontend nécessaire : `MenuItemCreateView.vue` lit déjà
`e?.response?.data?.message` en priorité.

## Risque de régression / à surveiller

- Pas encore vérifié en conditions réelles (`pnpm dev` non relancé dans la session) : à tester en
  sélectionnant deux fois le même ingrédient dans le formulaire d'édition et en confirmant
  l'affichage du message FR au lieu du message Prisma brut.
- Le vrai fix produit serait plutôt d'empêcher la sélection en double **côté formulaire**
  (dédupliquer/désactiver l'option déjà choisie dans le picker) — ce ticket ne couvre que le
  message d'erreur backend, pas la prévention amont.
- Si un nouveau modèle avec une contrainte `@@unique` similaire est ajouté aux relations MenuItem,
  penser à étendre `describeMenuItemUniqueConstraintError`.

## Références

- [BUG-097](97_menu_items_creation_type_categorie_doublon_500_generique.md) — même famille de bug (500 générique sur doublon) côté création Type/Category.
- [BUG-309-02](309_02_menu_items_edition_ecrase_unit_cost_total_cost_combo.md) — trouvé et corrigé dans la même session, code adjacent.
