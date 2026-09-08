# BUG-377-02 — TTL cache catalogue trop court (60s) ; ingrédients laissé tel quel (market-price non invalidé)

- **Statut** : 🟡 Corrigé partiellement (menu-items/menu-components) — ingredients documenté, non
  corrigé par choix (décision utilisateur du 2026-09-03)
- **Sévérité** : 🟡 Mineur (performance, pas de perte de données)
- **Domaine** : Performance / Cache
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-09-03, en construisant le nouveau Live (`/live2`, `datafriday-web`) — sa
  page dispatch `loadSpace` au montage, qui recharge tout le catalogue (menu items, menu-components,
  ingredients) à chaque visite.
- **Fichiers** : `src/features/menu-items/menu-items.service.ts`,
  `src/features/menu-components/menu-components.service.ts`,
  `src/features/ingredients/ingredients.service.ts`, `src/features/market-prices/*`

## Symptôme

Les listes `GET /menu-items`, `GET /menu-components`, `GET /ingredients` sont cachées Redis
(`getOrSet`) avec un TTL de **60s** — alors que ce catalogue change rarement (édition manuelle,
pas à chaque vente). Résultat : quasi aucun écran ne bénéficie du cache en pratique, chaque
visite/re-render (Analyse, Restock, Inventory, et maintenant Live v2) retape la base à chaque fois
qu'il s'écoule plus d'une minute entre deux montages — ce qui est le cas courant, pas l'exception.

## Cause racine

Le TTL de 60s date d'avant [BUG-128-02](128_02_redis_cache_jamais_invalide_double_prefixe.md)
(corrigé le 2026-08-14) : à l'époque, `invalidateCache()` ne purgeait jamais réellement le cache
(bug de double-préfixe), donc un TTL court était le SEUL filet de rattrapage en cas de mutation —
sans lui, une modification de catalogue serait restée invisible indéfiniment. Une fois
l'invalidation réellement fonctionnelle, ce TTL court n'a plus de rôle protecteur ; il ne fait plus
que garantir un cache-miss permanent pour un usage en rafale (rechargements de page rapprochés).

Pour `ingredients` spécifiquement : son cache (`ingredients:{tenantId}:list:*`) n'est purgé que par
les mutations d'`IngredientsService` (create/update/delete, `ingredients.service.ts:59,160,183`).
Une modification de **prix marché** (`market-prices.service.ts`, module séparé) ne déclenche AUCUNE
invalidation de ce cache — le prix affiché dans une liste d'ingrédients servie par ce cache peut donc
rester obsolète jusqu'à expiration du TTL, indépendamment de toute mutation sur l'ingrédient
lui-même.

## Correction

- `menu-items.service.ts:702` et `menu-components.service.ts:435` — TTL remonté de `60` à `3600`
  (1h). Sûr : leur invalidation couvre bien tous leurs chemins de mutation (aucun module tiers ne
  modifie un `MenuItem`/`MenuComponent` sans passer par leur propre service).
- `ingredients.service.ts:91` — **volontairement laissé à `60`**. Le remonter exposerait un risque
  de prix obsolète jusqu'à 1h après une modification de prix marché, tant que
  `market-prices.service.ts` ne purge pas `ingredients:{tenantId}:*` lui-même. Décision utilisateur
  du 2026-09-03 : ne pas corriger maintenant, documenter pour ne pas retomber dans le même piège
  plus tard (ex. si quelqu'un généralise le TTL 3600s à tous les caches catalogue par copier-coller).

## Risque de régression / à surveiller

- Aucun pour `menu-items`/`menu-components` : changement de durée seule, invalidation déjà
  vérifiée fiable par BUG-128-02.
- `ingredients` : si un besoin futur justifie d'allonger son TTL, il faut D'ABORD faire invalider
  `ingredients:{tenantId}:*` depuis `market-prices.service.ts` (ou un event/hook partagé) — sinon
  reproduire ce même bug avec un TTL plus long et donc plus visible.

## Références

- [BUG-128-02](128_02_redis_cache_jamais_invalide_double_prefixe.md) — l'invalidation que ce TTL
  plus long présuppose fiable.
- [BUG-143-01](143_01_endpoints_batch_analyse_sans_cache_redis.md) — endpoints analyse déjà cachés
  différemment (invalidation à l'événement, pas TTL).
