# BUG-127-02 — Space Menus : menu item composé d'articles combo affiché "No recipe"/indisponible

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes / Space Menus
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:462-624` (méthode privée
  `getItemsWithAvailabilityForSpace`, notamment `select` du `menuItem.findMany` ligne 471-487 et
  calcul `hasRecipe` ligne 597-598)

## Symptôme

Un menu item de catégorie "Combo" composé exclusivement d'articles ajoutés via le picker "Add
Combo Item" (relation `MenuItemCombo`, ex. "Test combo" = Burger 25/26 + Coca-Cola Zero, coût par
pièce €2.06 visible et correct dans `MenuItemCreateView.vue` en édition) apparaît **barré,
indisponible, avec le badge d'alerte** dans les écrans Space Menus (`ShopMenuItemsDrawer.vue`,
`SpaceMenuItemView.vue`). Le tooltip affiche "Missing Ingredients: No recipe" alors que l'item a
bel et bien une recette (2 composants combo). Signalé par l'utilisateur le 2026-08-14 sur l'espace
"La Beaujoire Nantes" / config "Configuration Max" (drawer "Visiteurs", 89 items, plusieurs combos
concernés : "Combo PP/Potatoes/...", "Combo Tenders/Frites/...", "Test combo").

## Cause racine

`getItemsWithAvailabilityForSpace` (`space-menus.service.ts:450-624`) calcule la disponibilité
d'un menu item à partir de 3 relations seulement :

```ts
// select du menuItem.findMany, ligne ~484-486 — ne charge PAS comboChildren
ingredients: { select: { ingredientId: true } },
packagings: { select: { packagingId: true } },
components: { select: { componentId: true } },

// ligne 597-598
const hasRecipe =
  mi.ingredients.length > 0 || mi.packagings.length > 0 || mi.components.length > 0;
```

La relation `MenuItemCombo` (`comboChildren` sur le modèle `MenuItem`, `schema.prisma:2350`) —
celle qui stocke réellement quels articles composent un combo (voir
`docs/modules/04_MENU_CATALOGUE.md` côté front, section "distinct aussi de comboChildren/
comboParents") — n'est ni sélectionnée dans la requête Prisma, ni prise en compte dans `hasRecipe`,
ni dans la boucle de résolution des `missingIngredients` (ligne 591-595, qui n'itère que sur
`mi.ingredients` / `mi.packagings` / `mi.components`). Un menu item composé **uniquement**
d'articles combo (aucun ingrédient/composant/packaging direct) a donc `ingredients.length === 0 &&
packagings.length === 0 && components.length === 0` → `hasRecipe = false` → `available = false`,
avec `missingIngredients` vide (d'où le tooltip "No recipe" plutôt qu'une raison de blocage
précise).

Ce bug touche les 2 points d'entrée qui appellent cette méthode : `getShopMenu` (ligne 692, utilisé
par `ShopMenuItemsDrawer.vue`, cf. capture "Visiteurs 89 items") et `getSpaceMenuItems` (ligne
1036, utilisé par `SpaceMenuItemView.vue`).

## Correction

Faite le 2026-08-14, dans `getItemsWithAvailabilityForSpace` :

1. Ajout de `comboChildren: { select: { childId: true } }` au `select` du `menuItem.findMany`
   scopé espace (ligne ~495) et extension de `hasRecipe` pour inclure `mi.comboChildren.length > 0`
   (ligne ~662-666).
2. Nouvelle requête tenant-wide (7e requête du `Promise.all`, `comboSourceMenuItems`) chargeant
   `id`/`deletedAt`/`ingredients`/`packagings`/`components`/`comboChildren` de **tous** les
   `MenuItem` du tenant — nécessaire car un enfant combo peut ne pas être lui-même associé à
   l'espace consulté et donc absent du `menuItems` scopé. Même besoin, même pattern que les
   requêtes tenant-wide déjà présentes pour `ingredients`/`packagings`/`components`.
3. `collectMenuItemComboIssues(menuItemId, stack)` : résolution récursive des blocages d'un enfant
   combo (ingrédients/packagings/composants, et récursion sur ses propres `comboChildren`), avec
   cache + garde anti-cycle — calqué à l'identique sur `collectComponentIssues` déjà en place pour
   les composants (même fichier, lignes ~586-608). Un enfant absent/soft-delete ne bloque pas le
   parent (parité volontaire avec `collectComponentIssues`, qui a le même comportement pour un
   composant manquant).
4. Point ouvert du diagnostic initial : la disponibilité d'un combo dépend bien du
   fournisseur/espace de chaque enfant (mêmes règles `checkSupplyItem` que pour un ingrédient
   direct), cohérent avec l'arbitrage produit déjà tranché par Bertrand pour le domaine voisin
   (Event Predict Stock up, `docs/QUESTIONS_A_BERTRAND.md` front #18, 2026-07-24/2026-08-04) : "on
   prend chaque menu item qui compose [le combo] et on les traite de la même façon que les menu
   items normaux".

**Design retenu pour éviter une régression silencieuse** (au lieu d'une route dédiée) : le fix est
strictement **additif et isolé par item**. Pour tout menu item sans `comboChildren` (l'immense
majorité du catalogue), `mi.comboChildren` est un tableau vide → la nouvelle branche de `hasRecipe`
n'ajoute rien, et la nouvelle boucle `for (const link of mi.comboChildren)` ne s'exécute jamais :
le résultat est bit-à-bit identique à avant le fix. Le comportement ne change donc que pour les
items qui ont réellement des enfants combo — exactement le périmètre du bug. Une route dédiée
aurait dupliqué la logique de résolution de disponibilité (nouvelle source de divergence, cf.
"Risque de régression" ci-dessous), ce qui allait à l'encontre de l'objectif.

`npx tsc --noEmit` passe sans erreur sur le fichier modifié (vérifié dans cette session — build
`nest build` non lancé, cf. consigne de laisser l'utilisateur builder/tester en conditions réelles).

## Risque de régression / à surveiller

Pour les items **sans** combo : aucun changement de comportement (cf. design additif ci-dessus) —
risque de régression nul par construction pour ~99% du catalogue.

Pour les items **avec** combo, à vérifier en conditions réelles (build + déploiement utilisateur,
non fait dans cette session) :
- Un item combo pur (ex. "Test combo" = Burger 25/26 + Coca-Cola Zero) redevient `available: true`
  dans Space Menus si tous ses enfants ont un fournisseur qui livre l'espace concerné.
- Un item combo dont un enfant a un fournisseur hors-espace (ou aucun fournisseur, ou un enfant
  inactif) redescend bien en `available: false` avec une raison précise dans `missingIngredients`
  (plus "No recipe" trompeur).
- Écrans à retester : `ShopMenuItemsDrawer.vue` (drawer "Visiteurs" de la capture utilisateur),
  `SpaceMenuItemView.vue`. Vérifier aussi `EventPredictMenusSection.vue`/`EventPredictView.vue` :
  ils consomment `hasRecipe`/`missingIngredients` via `menuItemAvailability.js`/
  `shopMenuAvailability.js` côté front — si ces fichiers dérivent leur propre logique plutôt que de
  relire tel quel le payload backend, ils pourraient avoir la même lacune côté front, hors
  périmètre de ce fix backend (à vérifier séparément si le symptôme persiste côté Event Predict).
- Famille de bugs voisine déjà connue et distincte (audit `04_MENU_CATALOGUE.md` #3 : "Deux règles
  d'expansion combo incompatibles" entre `EventPredictStockUpSection.vue` et
  `logistics.service.ts`) — ce fix ajoute une 3e implémentation de résolution combo
  (`collectMenuItemComboIssues`), volontairement calquée sur `collectComponentIssues` déjà en
  place dans ce même fichier plutôt que sur les deux autres (périmètre différent : disponibilité
  espace, pas expansion de stock-up) — à garder en tête si une factorisation inter-domaines est
  entreprise un jour.
- Pas de test automatisé ajouté (aucune suite de tests existante sur `space-menus.service.ts`
  identifiée dans cette session).

## Références

- `docs/bugs/62_spacemenu_availability_referentiel_tenant_non_scope.md` — bug précédent sur cette
  même méthode.
- Front `docs/modules/04_MENU_CATALOGUE.md` — section `comboItem` vs `MenuItemCombo`/`comboChildren`.
- Front `docs/bugs/322_02_combo_item_picker_liste_toujours_vide.md` — bug distinct découvert dans la
  même session (le picker de sélection d'articles combo, corrigé) ; celui-ci porte sur le calcul de
  disponibilité une fois le combo créé.
