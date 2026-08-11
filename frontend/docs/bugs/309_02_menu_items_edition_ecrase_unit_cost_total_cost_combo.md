# BUG-309-02 — Édition d'un menu item : unit cost / total cost des lignes de recette écrasés à 0 (court-circuit combo)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `api-datafriday-staging` (cause racine) + `datafriday-web` (déclencheur payload)
- **Découvert le** : 2026-08-10
- **Fichiers** : `backend/src/features/menu-items/menu-items.service.ts:416-420` (`create()`) et
  `:923-927` (`update()`) ; `frontend/src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:1068-1165`

## Symptôme

Après édition (sauvegarde) d'un menu item, tous les `unitCost`/`totalCost` affichés pour les lignes
Ingrédients/Composants/Packagings passent à 0€, alors qu'ils étaient corrects juste avant l'édition
— y compris pour une simple modification de nom ou de prix qui ne touche pas la recette elle-même.
Impact en cascade sur l'export CSV et l'endpoint `/menu-items/:id/recipe` (Réappro/Stock-up/Inventaire),
qui lisent les mêmes colonnes.

## Cause racine

`create()`/`update()` de `MenuItemsService` traitent le recalcul des coûts comme **mutuellement
exclusif** entre recette « plate » et recette « combo » :

```ts
if (comboItemsLines) {
  await this.refreshComboCost(tenantId, id);
} else if (componentsLines || ingredientsLines || packagingsLines) {
  await this.refreshCosts(tenantId, { itemIds: [id] });
}
```

`comboItemsLines` est dérivé via `Array.isArray(dto.comboItems) ? dto.comboItems : undefined` — un
tableau **vide** `[]` est *truthy* en JS, donc la branche `refreshComboCost` était prise dès que
`comboItems` était présent dans le payload, même vide. Or seule `refreshCosts()` réécrit
`unitCost`/`totalCost` sur les lignes `MenuItemIngredient`/`MenuItemComponent`/`MenuItemPackaging` ;
`refreshComboCost()` ne touche que `MenuItem.totalCost` (le total agrégé de l'article), jamais les
lignes de recette elles-mêmes. Comme `update()` supprime et recrée ces lignes à chaque sauvegarde
(`deleteMany` + `create`, sans `unitCost`/`totalCost`, colonnes `Decimal?` sans défaut), elles
restaient `null` en base dès que `refreshCosts()` n'était pas appelée.

Côté frontend, `MenuItemCreateView.vue` envoie désormais **systématiquement** `comboItems:
comboItems` dans le payload de sauvegarde (ligne 1165), même `[]` pour un article sans combo — donc
toute sauvegarde déclenchait le court-circuit.

Régression introduite par l'ajout de la fonctionnalité combo items, en deux temps :
- `3f2d5c72` (2026-07-30, Ulrich) — introduit la branche `if/else if` exclusive dans `create()`/`update()`.
- `ddc8ac4f` (2026-08-03, emmanuel) — fait envoyer `comboItems` (potentiellement vide) dans tous
  les payloads de sauvegarde du formulaire.

Avant le 3 août, le formulaire n'envoyait jamais `comboItems`, donc `comboItemsLines` restait
`undefined` et `refreshCosts()` s'exécutait normalement.

## Correction

`create()` et `update()` : les deux recalculs ne sont plus exclusifs. `refreshCosts()` s'exécute
dès que components/ingredients/packagings sont modifiés (indépendamment de `comboItems`) ;
`refreshComboCost()` s'exécute en plus, seulement si `comboItems` contient réellement des lignes
(`comboItemsLines && comboItemsLines.length > 0`).

```ts
if (componentsLines || ingredientsLines || packagingsLines) {
  await this.refreshCosts(tenantId, { itemIds: [id] });
}
if (comboItemsLines && comboItemsLines.length > 0) {
  await this.refreshComboCost(tenantId, id);
}
```

Pas de risque de double comptage : `computeMenuItemComboCost` (appelée par `refreshComboCost`)
recalcule toujours depuis les coûts maîtres (`component.unitCost`, `ingredient.costPerRecipeUnit`,
etc.), jamais depuis les colonnes de ligne déjà persistées — l'ordre entre les deux appels n'a donc
pas d'importance.

## Risque de régression / à surveiller

- Ne pas réintroduire un test `if (arrayField)` sur un champ qui peut légitimement être un tableau
  vide envoyé par le frontend — préférer `array?.length > 0` dès que la présence du champ n'est pas
  distinguable de son absence.
- Pas encore vérifié en conditions réelles (`pnpm dev` non relancé dans la session) : à tester en
  éditant un menu item avec ingrédients/composants/packagings (sans combo) et en confirmant que
  `unitCost`/`totalCost` restent non-null après sauvegarde.
- Les menu items déjà sauvegardés entre le 2026-08-03 et ce fix ont potentiellement leurs lignes de
  recette à `unitCost`/`totalCost` = `null` en base — un `refresh-costs` global (bulk, cf.
  `refreshCosts(tenantId)` sans `itemIds`) sera nécessaire pour les rattraper.

## Références

- [BUG-072](72_menu_items_refresh_costs_echec_silencieux.md) — `onRefreshCosts` : échec silencieux, même famille de fonction.
- [BUG-267-01](267_01_menu_items_stepper_pas_de_1_et_couts_arrondis.md) — autre bug d'affichage à 0€ sur le même écran de coût de revient (cause différente).
