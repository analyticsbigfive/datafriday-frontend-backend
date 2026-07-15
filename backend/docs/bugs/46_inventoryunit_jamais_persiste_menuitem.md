# BUG-046 — `inventoryUnit` (unité du conditionnement) jamais persisté sur `MenuItem`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (affichage — unité générique au lieu de la vraie unité)
- **Domaine** : Menu & recettes / Stock (Logistics)
- **Repo(s) concerné(s)** : les deux (`api-datafriday-staging` + `datafriday-web`)
- **Découvert le** : 2026-07-15
- **Fichiers** :
  - `datafriday-web/.../MenuItemCreateView.vue:363,683` (avant fix) — champ formulaire non envoyé
  - `api-datafriday-staging/prisma/schema.prisma:1863-1864` (avant fix) — colonne absente
  - `api-datafriday-staging/src/features/logistics/logistics.service.ts:548,588` (avant fix) —
    `unit: null` codé en dur, faute de source

## Symptôme

Sur la fiche menu item (`readyForSale = "Yes"`), le bloc « Inventory Information » propose de
choisir l'unité du conditionnement (`Kg` / `L` / `Pc`) — ex. « BURGER SEUL is stored in Emballage
of **2 Pc** ». Sur `/spaces/:spaceId/logistic`, la carte correspondante affiche « 2 **units**/pack »
(repli générique `LogisticItemCard.vue:16-18`) et la ligne « Number of Emballages of 2 » sans
suffixe d'unité — l'unité choisie dans le formulaire n'apparaît jamais.

Repro : créer/éditer un menu item `readyForSale=Yes` sans ingrédient unique résolu par Market Price
(cas "produit ↔ son propre packaging"), renseigner Inventory Information avec une unité ≠ défaut
formulaire, sauvegarder, ouvrir `/spaces/:id/logistic` → unité toujours générique.

## Cause racine

Le champ `inventoryUnit` n'a **jamais existé côté backend** :
1. Front (`MenuItemCreateView.vue`) : `form.inventoryUnit` (défaut `"Pc"`) alimente le `<select>`
   mais n'était **jamais inclus dans le payload de sauvegarde** (ligne ~1194, seuls
   `inventoryPackagingType`/`inventoryNumberOfUnits` étaient envoyés) — perdu silencieusement à
   chaque save. Au chargement en édition, non plus relu depuis `menuItem` (retombe toujours sur le
   défaut `"Pc"` du formulaire, indépendamment de la vraie valeur si elle avait existé).
2. Backend : `MenuItem` (Prisma) n'avait **pas de colonne** pour cette donnée — seuls
   `inventoryPackagingType`/`inventoryNumberOfUnits` existaient. Rien à lire de toute façon.
3. `logistics.service.ts` : les deux branches "produit = lui-même" (`readyForSale=Yes` sans
   ingrédient unique résolu, ligne 548 ; et `readyForSale=No` sans ingrédients/composants, ligne
   588) codaient donc `unit: null` en dur — pas un oubli isolé comme BUG-045, mais l'absence pure et
   simple de la donnée source.

Distinct de [BUG-045](45_unit_null_codee_en_dur_readyforsale_yes.md) : BUG-045 concernait la
branche "ingrédient unique résolu via Market Price" (source `Ingredient.recipeUnit`, qui existe
bien en base) où le null était un vrai oubli de code. Ici, la branche "produit = son propre
packaging" (pas de Market Price impliqué) n'avait simplement aucune colonne pour stocker l'unité.

## Correction

- Migration `20260715180000_add_inventory_unit_to_menu_item` : `MenuItem.inventoryUnit String?`.
- `CreateMenuItemDto` (+ `UpdateMenuItemDto` via `PartialType`) : ajout `inventoryUnit?: string`.
- `menu-items.service.ts` : `create()`, `bulkCreate()`, `update()` lisent/écrivent
  `dto.inventoryUnit` au même endroit que `inventoryPackagingType`/`inventoryNumberOfUnits` (pas de
  changement de `serializeItem`/`select` nécessaire — `include` remonte déjà tous les scalaires).
- `logistics.service.ts` : `recipeSelect()` sélectionne `inventoryUnit` ; les deux branches
  "produit = lui-même" (lignes 548 et 588) lisent `item.inventoryUnit ?? null` au lieu de `null`.
- `MenuItemCreateView.vue` : payload de save envoie `inventoryUnit: this.form.inventoryUnit || null`
  ; préremplissage édition lit `menuItem.inventoryUnit || "Pc"`.

## Risque de régression / à surveiller

- Les menu items déjà en base ont `inventoryUnit = null` (colonne neuve) — ils continueront
  d'afficher l'unité générique sur `/logistic` jusqu'à un re-save depuis la fiche article (pas de
  backfill : la vraie valeur n'a jamais été capturée, impossible à déduire rétroactivement).
- Vérifier après déploiement qu'un item `readyForSale=Yes` "produit = lui-même" (pas de Market
  Price) affiche bien son unité choisie sur `/spaces/:id/logistic`, sur les deux branches
  (`readyForSale=Yes` ligne 548 et `readyForSale=No` fallback ligne 588).

## Références

- [BUG-045](45_unit_null_codee_en_dur_readyforsale_yes.md) — même écran, même symptôme (« units »
  générique), cause distincte (oubli de code vs champ jamais persisté).
- [BUG-044](44_stock_payload_lent_et_volumineux.md) — même écran, code adjacent.
