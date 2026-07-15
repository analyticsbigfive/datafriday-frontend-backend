# Feature — Appliquer le prix Weezevent à un menu item (+ historique)

**Date :** 2026-06-29
**Scope :** backend (`api-datafriday-staging`) + front (`datafriday-web`, Vue)

## Problème résolu

À l'étape 3 de la Data Integration, on associe un produit Weezevent à un menu item. Jusqu'ici
le mapping était un **simple lien** : il ne propageait aucun prix. Un menu item créé à 0 restait
à 0 même mappé à un produit Weezevent vendu 3 €. Aucun moyen de faire « monter » le prix
Weezevent dans l'article, ni de suivre l'évolution du prix.

## Ce qui a été ajouté

1. **Application du prix** : un bouton applique le prix Weezevent du produit mappé à
   `MenuItem.basePrice` (le prix devient visible côté menu-items). Source du prix :
   - `WeezeventProduct.basePrice` (catalogue Weezevent) s'il existe ;
   - sinon le **prix modal** dérivé des ventes (le plus fréquent), via `getModalSalesPrices`
     — exactement le prix déjà affiché à l'étape 3 (on ne reparcourt rien de neuf).
2. **Historique** : chaque application qui change le prix est archivée dans la nouvelle table
   `MenuItemPriceHistory` (courbe d'évolution). Idempotent : si le prix courant = prix résolu,
   rien n'est réécrit ni historisé.
3. **Affichage du prix DataFriday actuel** dans l'étape 3 (colonne « DataFriday : X € » par ligne
   mappée) + dialog d'historique.

## Backend

| Élément | Fichier |
|---|---|
| Modèle `MenuItemPriceHistory` (+ relations `MenuItem`/`Tenant`) | `prisma/schema.prisma` |
| Migration `CREATE TABLE` | `prisma/migrations/20260629140000_add_menu_item_price_history/migration.sql` |
| `getModalSalesPrices` + `resolveWeezeventApplyPrice` (source unique du prix modal) | `src/shared/pricing/menu-item-pricing.service.ts` |
| `applyWeezeventPrice` / `applyWeezeventPricesBulk` / `getPriceHistory` | `src/features/menu-items/menu-items.service.ts` |
| Routes + DTO | `menu-items.controller.ts`, `dto/apply-weezevent-price.dto.ts` |
| Refactor : `deriveSalesPrices` délègue à `getModalSalesPrices` (zéro duplication) | `src/features/weezevent/weezevent.controller.ts` |

### Endpoints

- `POST /menu-items/:id/apply-weezevent-price` — body optionnel `{ weezeventProductId }`
  (requis seulement si plusieurs produits sont mappés à l'article).
  → `{ changed, previous, applied: { basePrice, vatRate, currency, source }, item }`
- `POST /menu-items/apply-weezevent-prices` — `{ items: [{ menuItemId, weezeventProductId? }] }`
  → `{ total, changed, results: [{ menuItemId, changed, applied?, error? }] }`
- `GET /menu-items/:id/price-history` → lignes `MenuItemPriceHistory` (récent → ancien).

`source` ∈ `weezevent_catalog` | `weezevent_sales` | `manual`.

## Front (Vue)

| Élément | Fichier |
|---|---|
| `applyWeezeventPrice` / `applyWeezeventPrices` / `getMenuItemPriceHistory` | `src/api/endpoints/menu-item.api.js` |
| Bouton « Appliquer X € » par ligne + colonne « DataFriday : X € » + bannière « Appliquer les prix Weezevent » (masse) + dialog historique | `src/components/integration/wizard/StepMapMenuItems.vue` |

## ⚠️ Ordre de déploiement (IMPORTANT)

Render n'applique **aucune** migration automatiquement (cf. `project_migrations_deploy_gotcha`).
La nouvelle table doit exister **avant** que le code qui l'écrit ne tourne, sinon 500
« relation MenuItemPriceHistory does not exist ».

1. **D'abord** : appliquer la migration en prod → `make prod-migrate`
   (ou exécuter `prisma/migrations/20260629140000_add_menu_item_price_history/migration.sql`).
2. **Ensuite** : déployer le backend, puis le front.

La migration est additive et idempotente (`CREATE TABLE IF NOT EXISTS`, colonnes nullable),
sans risque sur la base peuplée.

## Notes de conception

- `MenuItem.basePrice` reste la **source du prix courant** (affiché partout). L'historique est
  une table additive ; on ne dénormalise pas le HT/TVA (calculés par `computePricing`).
- Le prix appliqué passe par `resolveWeezeventApplyPrice` → même logique que `getProducts`
  (catalogue sinon modal), donc cohérent avec ce que l'utilisateur voit à l'étape 3.
- Isolation multi-tenant : `tenantId` filtré explicitement en plus du CLS, FK en cascade.
