# BUG-71 — `GET /events` : `page`/`limit` négatifs acceptés, `limit` sans borne haute

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.controller.ts:38-40`

## Symptôme

`findAll(@Query('page') page, @Query('limit') limit)` calcule les valeurs par défaut avec
`+page || 1` / `+limit || 50` — ce fallback ne s'active que sur `0`/`NaN`, pas sur les valeurs
négatives (`-5 || 50` vaut `-5`, pas `50`). Un `GET /events?page=-1` atteint
`prisma.event.findMany({ skip: <négatif>, take: 50 })`, que Prisma rejette avec une erreur non
catchée → 500 générique. De plus, `limit` n'a aucune borne haute : `?limit=999999` renvoie tout le
tenant en une seule réponse.

## Cause racine

Validation absente au niveau du controller — pas de DTO de query avec `class-validator`
(`@IsPositive()`, `@Max()`), juste une conversion `+value || default` insuffisante.

## Correction

Clampe `page`/`limit` côté service (`Math.max(1, ...)` sur `page`, `Math.min(200, Math.max(1,
...))` sur `limit`) avant de les utiliser dans `skip`/`take`.

## Risque de régression / à surveiller

Vérifier que les appels existants sans `page`/`limit` (défaut 1/50) sont inchangés, et qu'un
`limit` très élevé est désormais silencieusement plafonné plutôt que servi tel quel (à surveiller
côté consommateurs qui supposeraient obtenir exactement le `limit` demandé au-delà de 200).

## Références

- `docs/modules/07_EVENEMENTS.md`
