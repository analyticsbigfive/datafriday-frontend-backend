# BUG-79 — Suppression `ProductType`/`ProductCategory` sans garde contre les `MenuItem` dépendants

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/menu-items/menu-items.service.ts:1578-1593` (`deleteProductType`), `:1700-1715` (`deleteProductCategory`), `prisma/schema.prisma:1741` (`ProductCategory.type`, `onDelete: Cascade`), `:1877-1878` (`MenuItem.productType`/`productCategory`, relation optionnelle sans `onDelete` explicite → défaut Prisma `SET NULL`)

## Symptôme

Supprimer un `ProductType` (Menu Item Type) cascade-supprime silencieusement toutes ses
`ProductCategory` enfants en base, et met `NULL` sur `MenuItem.typeId`/`categoryId` pour tout
article qui référençait le type ou l'une de ses catégories — sans aucun décompte, garde ou
confirmation côté backend. Même problème pour `deleteProductCategory` seule.

Le seul filet de sécurité existant est côté front, et il est incomplet : `ProductTypeList.vue`
bloque le bouton de suppression si `deleteTarget.categoryList.length > 0` (cache local, potentiellement
périmé) mais ne vérifie jamais si des `MenuItem` référencent directement le type ; `ProductCategoryList.vue`
n'a aucune vérification du tout avant d'appeler `deleteProductCategory`.

## Cause racine

Ni `deleteProductType` ni `deleteProductCategory` ne comptent les lignes dépendantes
(`ProductCategory`, `MenuItem`) avant l'appel `prisma.productType.delete()`/`productCategory.delete()`.
Même famille de bug que [`75_eventtype_eventcategory_delete_cascade_sans_garde.md`](75_eventtype_eventcategory_delete_cascade_sans_garde.md),
déjà corrigée pour `EventType`/`EventCategory` par un blocage total tant que des enfants dépendent —
le même correctif n'a jamais été porté sur la taxonomie Menu Item.

## Correction

Reste à faire : appliquer le même pattern que le fix de BUG-75 — bloquer la suppression
(`ConflictException` ou équivalent) tant qu'au moins un `MenuItem` référence le type/la catégorie,
ou qu'une `ProductCategory` dépend encore du `ProductType`.

## Risque de régression / à surveiller

Après le fix, vérifier que la suppression d'un type/catégorie inutilisé continue de fonctionner
normalement, et qu'un message d'erreur clair (pas un 500 brut) remonte au front quand la
suppression est bloquée. Le front pourra alors simplifier/retirer sa vérification `categoryList`
actuelle (partielle) au profit du message d'erreur backend faisant autorité.

## Références

- [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) — même mécanisme, déjà corrigé pour `EventType`/`EventCategory`.
- [BUG-81](81_suppression_componenttype_category_sans_garde_dependances.md), [BUG-82](82_suppression_marketpricetype_sans_garde_categories.md), [BUG-85](85_suppression_brand_displayname_sans_garde_usage.md), [BUG-86](86_suppression_industrial_sans_garde_usage.md) — même famille de bug répétée sur les 5 autres taxonomies de la section Configurations.
