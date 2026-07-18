# BUG-80 — `getShopDetails` : RPC ~300ms sur le chemin critique /analyse, jamais cachée

- **Statut** : 🟢 Corrigé (en code, non déployé)
- **Sévérité** : 🟠 Majeur/perf (premier rendu /analyse)
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/spaces/spaces.service.ts:969-978` (avant fix)

## Symptôme

`GET /spaces/:id/shop-details` (RPC Supabase `get_space_shop_details`, ~300ms d'après le commentaire du code « ~2s → ~300ms ») est appelé en **phase 1** du chargement de la vue /analyse (`useSpaceData.js`) — donc payé intégralement à chaque mount, alors que toutes les méthodes sœurs du service (`getSpaceShops`, `getSpaceConfigurations`, `resolveShopIdsForSpace`…) passent par `redis.getOrSet` (TTL 30-120s).

À lui seul, cet appel consommait l'essentiel du budget « premier contenu < 300ms » de la vue.

## Cause racine

Oubli : la méthode a été migrée vers la RPC sans recevoir la couche cache que ses voisines avaient déjà.

## Correction

2026-07-18 : enveloppée dans `redis.getOrSet`, clé `spaces:shopdetails:{tenantId}:{spaceId}:{page}:{limit}:{granular}`, **TTL 60s** (données alimentées par sync/agrégation, pas d'écriture utilisateur directe). Invalidation ajoutée au `invalidateSpaceCache` existant (deletePattern). Une erreur `space_not_found` jette depuis la factory → jamais mise en cache. Specs : `spaces.service.spec.ts` (délégation getOrSet + clé/TTL, non-cache d'erreur).

## Risque de régression / à surveiller

Fraîcheur : ventes agrégées en retard de ≤60s sur cette vue — cohérent avec les TTL voisins (30-120s). Vérifier en staging que le 2e chargement de /analyse dans la minute ne montre plus la RPC dans le slow-query log Prisma.

## Références

- `docs/weezevent/WEEZEVENT_PERFORMANCE_GUIDE.md` (pattern CacheService/indexes)
- Fiche front 151 (cache-first loadSpace — les deux fixes composent)
