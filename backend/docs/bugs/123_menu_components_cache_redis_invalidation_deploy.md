# BUG-123 — Cache Redis composants : vérifier l'invalidation à la suppression sur l'env déployé

- **Statut** : ⚪ Diagnostiqué (code correct dans le repo — à vérifier/redéployer sur Render)
- **Sévérité** : 🟡 Mineur (donnée périmée jusqu'à 60 s max)
- **Domaine** : Menu & recettes (Composants) / Cache Redis / Déploiement
- **Owner** : **Ulrich** (backend / ops)
- **Repo(s) concerné(s)** : `api-datafriday` (déploiement Render)
- **Découvert le** : 2026-08-01
- **Fichiers** :
  - `src/features/menu-components/menu-components.service.ts` (`findAll` L388-420, `remove` L604-623, `invalidateCache` L20-22)

## Symptôme

Des composants supprimés pouvaient continuer d'apparaître côté front après suppression. Le volet
front (cache Vuex 15 min) a été corrigé — voir
[`frontend/docs/bugs/258`](../../../frontend/docs/bugs/258_composants_cache_ttl_supprime_reste_local.md).
Reste le volet **cache serveur** à confirmer.

## Cause racine (analyse)

`GET /menu-components` (`findAll`) est mis en cache **Redis 60 s** via
`redis.getOrSet(cacheKey, …, { ttl: 60 })`. La suppression (`remove`) fait une **suppression douce**
(`deletedAt: new Date()`) **et** appelle `invalidateCache(tenantId)` →
`redis.deletePattern('datafriday:menu-components:${tenantId}:*')`, et `findAll` filtre bien
`deletedAt: null`. **Dans le code du repo, la chaîne est donc correcte.**

Le risque est **au déploiement** : si le backend **Render** est en retard (cf.
[BUG-255](255) — Render obsolète constaté), le build en prod peut ne pas invalider ce cache à la
suppression (ou différer), et servir un composant supprimé jusqu'à expiration du TTL (≤ 60 s), voire
plus si le pattern d'invalidation ou la clé diffèrent de la version déployée.

## Correction (à faire — Ulrich)

1. **Vérifier sur l'env déployé** que `remove` invalide bien le cache Redis (clé/pattern
   `datafriday:menu-components:${tenantId}:*`) et que `findAll` filtre `deletedAt: null`.
2. **Redéployer** le backend sur Render avec le code courant (résout aussi BUG-255).
3. (Optionnel) Envisager un TTL plus court ou une invalidation par clé explicite si le
   `deletePattern` s'avère coûteux/incomplet en prod.

## Risque de régression / à surveiller

- Après redéploiement : supprimer un composant puis re-lister immédiatement → doit disparaître
  sans attendre 60 s.
- Même schéma de cache Redis potentiellement présent sur d'autres référentiels (market-prices,
  menu-items…) — vérifier que leurs mutations invalident aussi.

## Références

- Front : [`frontend/docs/bugs/258`](../../../frontend/docs/bugs/258_composants_cache_ttl_supprime_reste_local.md)
- Déploiement Render obsolète : [`frontend/docs/bugs/255`](../../../frontend/docs/bugs/255_hr_supplier_departments_rejete_backend_render_obsolete.md)
