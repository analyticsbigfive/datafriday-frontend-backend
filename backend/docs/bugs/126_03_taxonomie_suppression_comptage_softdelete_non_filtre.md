# BUG-126-03 — Gardes de suppression taxonomie : les comptages de blocage ne filtrent pas `deletedAt`

- **Statut** : 🟡 Corrigé non déployé (fix en repo, à déployer sur Render)
- **Sévérité** : 🟠 Majeur (empêche des suppressions légitimes)
- **Domaine** : Menu & recettes / Achats & référentiels (taxonomies Type/Catégorie)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-09 (Emmanuel — signalé côté produit : après suppression de tous les menu items, les catégories restent bloquées)
- **Fichiers** :
  - `src/features/menu-items/menu-items.service.ts` — `deleteProductType` (comptage `typeId`), `deleteProductCategory` (comptage `categoryId`)
  - `src/features/market-prices/market-price-taxonomy.service.ts` — `deleteType` (comptage `marketPriceTypeId`), `deleteCategory` (comptage `marketPriceCategoryId`)

## Symptôme

Après avoir supprimé **tous** les menu items d'une catégorie (Menu Item Category) ou d'un type,
la suppression de la catégorie/du type reste **bloquée** avec un 409 « … X article(s) de menu en
dépendent encore. Réassignez-les d'abord. », alors qu'aucun menu item **actif** ne les référence
plus. Même classe de problème possible côté Market Prices (Good Type/Category) via les prix marché.

## Cause racine

Les menu items sont **soft-deleted** : `MenuItemsService.remove()` pose `deletedAt`
(`menu-items.service.ts:1639`, `update … data: { deletedAt: new Date() }`) au lieu de supprimer la
ligne. Or les gardes de suppression comptent **toutes** les lignes, y compris celles déjà
soft-deleted, car le `where` n'inclut pas `deletedAt: null` :

```ts
// deleteProductType
const menuItemCount = await this.prisma.menuItem.count({ where: { typeId: id } });      // ← manque deletedAt: null
// deleteProductCategory
const menuItemCount = await this.prisma.menuItem.count({ where: { categoryId: id } });   // ← idem
```

Un article « supprimé » conserve son `typeId`/`categoryId` → il est encore compté → blocage à tort.
Même famille que BUG-108 / BUG-110 (soft-delete non filtré dans un comptage/une jointure).

Note : ce n'est **pas** un problème de cache — ces comptages sont des requêtes Prisma directes, non
mises en cache Redis.

## Correction

Ajout de `deletedAt: null` aux 4 comptages de blocage (menu items + prix marché). Côté Market
Prices, `MarketPrice.remove()` fait un hard-delete, mais la colonne `deletedAt` existe et un
chemin de soft-delete est possible → filtre ajouté par cohérence/robustesse.

**Reste à faire** : redéployer le backend sur Render (le front appelle Render ; tant que le
déploiement n'est pas fait, le blocage persiste — aucun contournement frontend possible puisque le
comptage est côté serveur).

## Risque de régression / à surveiller

- Vérifier que les gardes bloquent toujours quand un menu item **actif** (non supprimé) référence
  encore le type/la catégorie (le blocage doit rester effectif dans ce cas).
- Auditer les autres comptages/gardes du même fichier pour le même oubli (`ProductCategory` et
  `MarketPriceCategory` sont eux hard-deleted, donc leurs comptages `categoryCount` sont corrects).

## Références

- Bugs liés : `108_event_timeline_deletedat_non_filtre.md`, `110_derivesalesraw_deletedat_non_filtre.md` (même famille soft-delete).
- Garde-fou d'origine : BUG-79 (product taxonomy) / BUG-82 (market price taxonomy) — le filtre soft-delete y avait été oublié.
