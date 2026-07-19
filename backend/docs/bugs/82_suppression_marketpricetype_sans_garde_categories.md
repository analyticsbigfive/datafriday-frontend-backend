# BUG-82 — Suppression `MarketPriceType` sans garde contre les `MarketPriceCategory` dépendantes

- **Statut** : 🔴 Ouvert
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

Reste à faire : bloquer la suppression côté backend si des `MarketPriceCategory` dépendent encore
du type (même pattern que le fix de [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md)).
Une fois le backend faisant autorité, le check front peut rester en optimisation UX mais ne doit
plus être le seul filet.

## Risque de régression / à surveiller

Vérifier que la suppression d'un Good Type sans catégorie continue de fonctionner, et que le
message d'erreur front reste cohérent avec la nouvelle réponse backend.

## Références

- [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) — pattern de correctif de référence.
- [BUG-79](79_suppression_producttype_category_sans_garde_dependances.md), [BUG-81](81_suppression_componenttype_category_sans_garde_dependances.md) — même famille sur les 2 autres taxonomies Type/Category de Configurations.
