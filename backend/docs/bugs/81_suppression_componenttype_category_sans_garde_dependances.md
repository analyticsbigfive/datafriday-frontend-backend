# BUG-81 — Suppression `ComponentType`/`ComponentCategory` sans garde contre les `MenuComponent` dépendants

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/menu-components/component-taxonomy.service.ts:55-67` (`deleteType`), `:172-184` (`deleteCategory`), `prisma/schema.prisma:1632-1633` (`MenuComponent.componentType`/`componentCategoryRef`, `onDelete: SetNull`), `:1670` (`ComponentCategory.type`, `onDelete: Cascade`)

## Symptôme

Supprimer un `ComponentType` référencé par des `MenuComponent` existants met silencieusement `NULL`
sur leur `componentTypeId` (et cascade-supprime ses `ComponentCategory` enfants, qui à leur tour
mettent `NULL` sur `componentCategoryId` partout où elles étaient utilisées) — sans décompte, garde
ni confirmation. `deleteCategory` seule a le même trou.

Côté front, `ComponentTypeList.vue:261-266` bloque la suppression **uniquement** si le type a des
catégories dans le cache local (potentiellement périmé, voir BUG-163) — pas s'il a des
`MenuComponent` qui le référencent directement. `ComponentCategoryList.vue:241-263` n'a **aucune**
vérification avant suppression.

## Cause racine

Ni `deleteType` ni `deleteCategory` ne comptent les `MenuComponent` dépendants avant l'appel
Prisma `delete()`. Même famille que [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md)
(`EventType`/`EventCategory`, déjà corrigée) et [BUG-79](79_suppression_producttype_category_sans_garde_dependances.md)
(`ProductType`/`ProductCategory`, même trou) — jamais porté sur la taxonomie Component.

## Correction

Appliqué le pattern de fix de BUG-75 (`ConflictException`, blocage total si des enfants dépendent
encore) :
- `src/features/menu-components/component-taxonomy.service.ts:96-124` (`deleteType`) : compte
  désormais les `ComponentCategory` dépendantes (`typeId: id`) et les `MenuComponent` dépendants
  (`componentTypeId: id`), lève `ConflictException` avec un message distinct pour chaque cas avant
  `prisma.componentType.delete()`.
- `src/features/menu-components/component-taxonomy.service.ts:240-260` (`deleteCategory`) : compte
  les `MenuComponent` dépendants (`componentCategoryId: id`) et lève `ConflictException` avant
  `prisma.componentCategory.delete()`.

## Risque de régression / à surveiller

Non testé en navigateur/via `pnpm dev` (indisponible dans cette session) — revue de code
uniquement, validation manuelle requise. Vérifier que le message d'erreur remonte proprement au
front (pas un 500 brut), et que la suppression d'un type/catégorie réellement inutilisé continue de
fonctionner.

## Références

- [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) — pattern de correctif de référence.
- [BUG-79](79_suppression_producttype_category_sans_garde_dependances.md) — même bug sur la taxonomie ProductType/Category.
