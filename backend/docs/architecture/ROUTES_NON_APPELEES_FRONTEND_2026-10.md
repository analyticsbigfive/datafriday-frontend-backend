# Routes non référencées par le frontend (2026-10-02)

Recherche statique du chemin de chaque route dans `frontend/src` (chaînes et gabarits).
Une route absente de cette recherche peut encore être appelée : URL construite dynamiquement,
autre client (outil interne, intégration), ou usage manuel. Liste à vérifier avant tout retrait.

## Appelées de l'extérieur (à garder)

| Méthode | Route |
|---|---|
| GET | `/health/admin` |
| GET | `/health/detailed` |
| GET | `/health/protected` |
| GET | `/metrics` |
| GET | `/metrics/cache` |
| GET | `/metrics/database` |
| GET | `/metrics/queues` |
| POST | `/webhooks/digifood/:tenantId/:integrationId` |
| POST | `/webhooks/weezevent/:tenantId/:integrationId` |

## Candidates au retrait (à confirmer)

Points d'attention : la reconstruction du tableau de bord d'espace écrit dans les agrégats avec une
autre logique que le pipeline principal ; `POST /menu-components/repair` calcule le coût unitaire
à l'inverse de BUG-001 ; les analyses Weezevent ont été réécrites en SQL faute de pouvoir les retirer
sans accord.

| Méthode | Route |
|---|---|
| POST | `/aggregation/skip-event` |
| GET | `/analyse/cost-breakdown` |
| GET | `/analyse/kpis/events` |
| GET | `/analyse/kpis/menu` |
| GET | `/analyse/timeline/:eventId` |
| GET | `/mappings/merchant-element` |
| POST | `/mappings/merchant-element` |
| DELETE | `/mappings/merchant-element/:merchantId` |
| POST | `/mappings/merchant-element/bulk` |
| GET | `/mappings/progress` |
| GET | `/mappings/progress/:locationId` |
| POST | `/market-prices/sync-ingredients` |
| GET | `/me/tenant` |
| POST | `/menu-components/refresh-costs` |
| PUT | `/menu-items/:id/components` |
| PUT | `/menu-items/:id/packagings` |
| GET | `/orchestrator/health` |
| POST | `/orchestrator/invalidate-cache` |
| GET | `/orchestrator/strategy` |
| GET | `/organizations/:organizationId/integrations/webhooks` |
| PATCH | `/organizations/:organizationId/integrations/webhooks` |
| POST | `/spaces/:id/access` |
| DELETE | `/spaces/:id/access/:userId` |
| GET | `/spaces/:id/analyse-unmapped` |
| DELETE | `/spaces/:id/pin` |
| POST | `/spaces/:id/pin` |
| GET | `/spaces/:id/transaction-baskets` |
| GET | `/spaces/:id/users` |
| GET | `/spaces/:spaceId/dashboard` |
| GET | `/spaces/:spaceId/dashboard/health` |
| POST | `/spaces/:spaceId/dashboard/invalidate` |
| POST | `/spaces/:spaceId/dashboard/rebuild` |
| GET | `/spaces/pinned` |
| GET | `/spaces/statistics` |
| GET | `/tenants` |
| POST | `/tenants` |
| DELETE | `/tenants/:id` |
| GET | `/tenants/:id` |
| PATCH | `/tenants/:id` |
| DELETE | `/tenants/:id/permanent` |
| POST | `/tenants/:id/reactivate` |
| POST | `/tenants/:id/suspend` |
| POST | `/tenants/:id/upgrade` |
| GET | `/tenants/:id/usage` |
| GET | `/tenants/by-slug/:slug` |
| GET | `/tenants/statistics` |
| DELETE | `/users/:id/spaces/:spaceId/access` |
| POST | `/users/:id/spaces/:spaceId/access` |
| GET | `/users/me` |
| GET | `/users/statistics` |
| GET | `/weezevent/analytics/margin-analysis` |
| GET | `/weezevent/analytics/sales-by-event` |
| GET | `/weezevent/analytics/sales-by-product` |
| GET | `/weezevent/analytics/top-products` |
| GET | `/weezevent/attendees` |
| GET | `/weezevent/integrity` |
| GET | `/weezevent/merchants` |
| GET | `/weezevent/orders` |
| GET | `/weezevent/prices` |
| DELETE | `/weezevent/products/:productId/map` |
| POST | `/weezevent/products/:productId/map` |
| GET | `/weezevent/products/mappings` |
| DELETE | `/weezevent/sync/state` |
| GET | `/weezevent/transactions/:id` |
