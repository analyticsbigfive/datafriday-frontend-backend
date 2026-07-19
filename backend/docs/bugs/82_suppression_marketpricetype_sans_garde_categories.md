# BUG-82 — Suppression `MarketPriceType` sans garde contre les `MarketPriceCategory` dépendantes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Configurations — Good Types/Categories)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/market-prices/market-price-taxonomy.service.ts:55-67` (`deleteType`), `prisma/schema.prisma:1777` (`MarketPriceCategory.type`, `onDelete: Cascade`)

## Symptôme

`deleteType` ne vérifie que l'ownership tenant avant d'appeler `prisma.marketPriceType.delete()`.
La relation `MarketPriceCategory.type` étant `onDelete: Cascade`, supprimer un Good Type
supprime silencieusement **toutes** ses Good Categories enfants en base.

Le seul garde-fou est côté front (`MarketPriceTypeList.vue:262-265`, bloque le bouton si
`deleteTarget.categoryList.length > 0`) — trivialement contournable (appel API direct, cache
périmé après une édition de nom, voir BUG-162, ou une race entre deux onglets). Le message
d'erreur affiché à l'utilisateur ("Impossible de supprimer un Good Type lié à des catégories")
laisse croire à une protection backend qui n'existe pas.

## Cause racine

Aucune vérification `categories.length` (ou équivalent `count`) côté service avant le `delete()`.

## Correction

Appliqué le même pattern de garde que [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md)
(`count()` avant `delete()`, `ConflictException` si des dépendants existent), étendu au-delà du
périmètre initial du bug pour rester cohérent avec les correctifs jumeaux BUG-79/81/85/86 (politique
uniforme "bloquer si quelque chose en dépend") :

- `market-price-taxonomy.service.ts:114-139` (`deleteType`) — bloque désormais si des
  `MarketPriceCategory` (`typeId: id`) **ou** des `MarketPrice` (`marketPriceTypeId: id`) dépendent
  encore du type, avec `ConflictException` donnant le compte de chaque.
- `market-price-taxonomy.service.ts:266-288` (`deleteCategory`) — bloque désormais si des
  `MarketPrice` (`marketPriceCategoryId: id`) dépendent encore de la catégorie.

Le check front (`MarketPriceTypeList.vue:262-265`) reste en place en optimisation UX ; le backend
fait maintenant autorité.

## Risque de régression / à surveiller

Revue de code uniquement dans cette session (pas de `pnpm dev` lancé) — validation manuelle requise :
vérifier que la suppression d'un Good Type/Category sans dépendant continue de fonctionner, et que
le message d'erreur front reste cohérent avec la nouvelle réponse backend (`e.response.data.message`,
même pattern que BUG-75).

## Références

- [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) — pattern de correctif de référence.
- [BUG-79](79_suppression_producttype_category_sans_garde_dependances.md), [BUG-81](81_suppression_componenttype_category_sans_garde_dependances.md) — même famille sur les 2 autres taxonomies Type/Category de Configurations.
