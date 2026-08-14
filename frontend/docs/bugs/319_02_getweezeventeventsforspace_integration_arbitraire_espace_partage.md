# BUG-319-02 — `getWeezeventEventsForSpace` résout une intégration arbitraire quand l'espace est mappé par plusieurs intégrations : réhydratation "déjà lié" faussée à l'étape 4

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/multi-integration-same-space`)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-14 (signalement utilisateur KOUAME Ulrich — même fil que BUG-317-02)
- **Fichiers** :
  - `backend/src/features/spaces/spaces.service.ts:1651-1691` (`getWeezeventEventsForSpace`)
  - `backend/src/features/spaces/spaces.controller.ts:743` (route `GET :id/weezevent-events`,
    aucun paramètre `integrationId` accepté)
  - `frontend/src/api/endpoints/space.api.js:358-366` (`getWeezeventEventsForSpace(spaceId)` —
    aucun paramètre `integrationId` à transmettre)
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue:838-847` (`mounted()`),
    `:854-863` (watcher `spaceId`), `:1421-1445` (`loadWeezeventEvents`)

## Symptôme

Espace mappé par 2 intégrations (ex. Weezevent A + Weezevent B). Dans l'assistant de l'intégration
B à l'étape 4, la bannière "Créer et lier tout" (`bulkCreateEvents`) ne détecte pas les événements
déjà liés d'une session précédente sur B — alors que le mécanisme de réhydratation
(`loadWeezeventEvents`, correctif de l'ancien BUG-214) est bien câblé dans `mounted()` et le
watcher `spaceId`. Risque : re-déclencher "Créer et lier tout" recrée des `Event` DataFriday en
double pour des `WeezeventEvent` de B déjà liés.

## Cause racine

`loadWeezeventEvents()` (`StepProcessTimeline.vue:1421`) appelle `getWeezeventEventsForSpace(this.
spaceId)` — **sans transmettre `this.location.id`** (l'`integrationId` de l'intégration
actuellement ouverte dans le wizard), alors que `loadTimeline(this.spaceId, this.location.id)`,
appelée juste avant à la ligne 841, le fait bien. Ce n'est pas un simple oubli d'argument côté
appelant : la fonction API elle-même (`space.api.js:358-366`) ne connaît pas ce paramètre, et la
route backend (`spaces.controller.ts:743`) n'en déclare aucun.

Côté service, `getWeezeventEventsForSpace` (`spaces.service.ts:1651-1691`) résout "l'intégration de
cet espace" ainsi :

```ts
const locationMapping = await this.prisma.locationSpaceMapping.findFirst({
  where: { tenantId, spaceId },   // AUCUN orderBy, AUCUN filtre par intégration
  select: { salesLocationId: true },
});
...
const location = await this.prisma.salesLocation.findFirst({
  where: { id: locationMapping.salesLocationId, tenantId },
  select: { integrationId: true },
});
const integration = { id: location.integrationId };

const events = await this.prisma.salesEvent.findMany({
  where: { tenantId, integrationId: integration.id }, ...
});
```

`findFirst` sans `orderBy` sur `LocationSpaceMapping` renvoie une ligne dont l'ordre n'est garanti
par rien de fonctionnel (dépend du plan Postgres) quand plusieurs lignes matchent `{tenantId,
spaceId}` — ce qui est précisément le cas d'un espace mappé par 2+ intégrations. Résultat : la liste
de `WeezeventEvent` et les `dfEventId` déjà liés que `loadWeezeventEvents` réhydrate dans
`weezEventMappings` peuvent appartenir à une intégration totalement différente de celle affichée
dans le wizard — les ids `WeezeventEvent` ne se recoupant jamais entre deux intégrations distinctes,
`weezEventMappings` reste effectivement vide pour l'intégration réellement ouverte, reproduisant le
symptôme de l'ancien BUG-214 (déjà corrigé pour la cause "jamais réhydraté") par un chemin de code
différent, toujours ouvert.

## Correction

Corrigée en code le 2026-08-14 (branche `fix/multi-integration-same-space`), pas encore testée en
environnement réel ni déployée :

1. Backend : `getWeezeventEventsForSpace(spaceId, tenantId, integrationId?)`
   (`spaces.service.ts:1651`) — quand `integrationId` est fourni, résolution directe (vérifie que
   `LocationSpaceMapping` a bien une ligne `{tenantId, spaceId, salesLocationId: integrationId}` —
   rappel : le mapping de l'étape 1 du wizard stocke `integration.id` directement dans
   `salesLocationId`, voir `createLocationSpaceMapping`/`StepMapSpace.vue:705`) au lieu de piocher
   arbitrairement le premier mapping de l'espace. Sans lui, comportement historique inchangé
   (`findFirst` sans `orderBy` + résolution via `SalesLocation`) — rétro-compatible pour tout appelant
   qui ne le fournirait pas encore.
2. Route : `@Query('integrationId') integrationId?: string` ajouté à `GET :id/weezevent-events`
   (`spaces.controller.ts:743-750`), même pattern que `GET aggregation/step4-context/:spaceId`.
3. Frontend : `getWeezeventEventsForSpace(spaceId, integrationId)` (`space.api.js:358-366`), et
   `loadWeezeventEvents()` passe désormais `this.location.id`
   (`StepProcessTimeline.vue:1421-1445`) — symétrique à `loadTimeline` juste au-dessus dans
   `mounted()`/le watcher `spaceId`.
4. Pas de test dédié ajouté (aucune suite existante pour `getWeezeventEventsForSpace` avant ce fix)
   — `tsc --noEmit` propre, `spaces.controller.spec.ts`/`spaces.service.spec.ts` toujours verts
   (1 échec pré-existant sans rapport, `getRevenueSummaries`/`findAll`, confirmé reproductible hors
   de cette branche).

## Risque de régression / à surveiller

- Vérifier après fix : sur un espace à intégration unique (cas majoritaire aujourd'hui), le
  comportement ne doit pas changer — `integrationId` fourni ou non doit donner le même résultat
  puisqu'il n'y a qu'un seul mapping possible.
- Chercher d'éventuels `Event` DataFriday déjà dupliqués chez des tenants ayant utilisé 2
  intégrations sur le même espace et cliqué "Créer et lier tout" plusieurs fois — même
  recommandation de nettoyage que l'ancien BUG-214.

## Références

- [214](214_stepprocesstimeline_weezeventmappings_jamais_rehydrate.md) — bug voisin déjà corrigé
  (réhydratation jamais câblée), dont celui-ci est une régression fonctionnelle par un chemin
  différent (réhydratation câblée mais avec la mauvaise intégration).
- [BUG-317-02](317_02_aggregation_processevents_deletemany_non_scope_integration.md),
  [BUG-318-02](318_02_aggregation_synchronize_purge_espace_sans_scope_integration.md) — même fil
  d'investigation (multi-intégration sur un même space).
