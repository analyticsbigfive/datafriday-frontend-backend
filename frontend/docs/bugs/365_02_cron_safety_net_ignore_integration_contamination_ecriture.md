# BUG-365-02 — Le filet de sécurité cron regroupe par space seul, pas par intégration : contamination à l'écriture entre 2 intégrations d'un même space (PFC/SFP)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business (CA faussé entre deux clubs partageant un stade,
  irréversible côté lecture une fois écrit)
- **Domaine** : Analyse & agrégation / Live events
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, cas pratique "Stade Jean Bouin" (PFC + SFP,
  2 intégrations Weezevent sur le même space) : "le step 4 fausse les calculs; aussi, sur analyse
  l'un s'affiche et l'autre non"
- **Fichiers** : `backend/src/features/weezevent/services/weezevent-cron.service.ts:106-172`
  (`triggerLiveAggregationSafetyNet`)

## Symptôme

Deux events de deux intégrations différentes mappées au même space, le même jour calendaire
(vérifié en base : "PFC-Dijon (fem)"/"SFP-Montauban" le 06/09/2025, "PFC-Le Havre (fem)"/
"SFP-Cardiff" le 06/12/2025) — CA faux sur l'un et/ou l'autre.

## Cause racine

`triggerLiveAggregationSafetyNet` (`@Cron(EVERY_5_MINUTES)`, filet de rattrapage si le
déclenchement post-webhook a été manqué, BUG-109) regroupait les events "en direct" **par space
seul**, jamais par intégration, et appelait `queueAggregationJob` **sans `integrationId`** :

```ts
const eventIdsBySpace = new Map<string, string[]>();
// ... regroupe uniquement par e.spaceId
await this.queueService.queueAggregationJob({ type: 'process-events', tenantId, spaceId, jobLogId, eventIds });
// pas de integrationId
```

Sans `integrationId`, `AggregationService.executeProcessEvents` :
1. `resolveSeasonContainerEventIds(tenantId, undefined)` détecte les conteneurs de saison des
   **deux** intégrations à la fois (PFC et SFP).
2. La clause de matching (`integrationClause`) devient vide — **aucun filtre par intégration** sur
   les transactions candidates.
3. Pour un event PFC dont la fenêtre chevauche celle d'un event SFP le même jour (portes/fin
   différentes mais periods qui se recoupent), des transactions **SFP** peuvent être insérées dans
   `SpaceRevenueMinuteAgg`/`ItemAgg` taguées avec le `weezeventEventId` de l'event **PFC** (et
   inversement) — le tag lui-même devient faux à l'écriture.

**Contrairement à BUG-146-01** (qui filtre déjà la LECTURE — `getEventTimelineBatch` — par tag
exact plutôt que par simple recoupement de dates), aucun filtre en lecture ne peut corriger une
donnée déjà mal taguée à l'écriture. Le déclenchement manuel ("Tout agréger" dans le wizard) n'est
PAS affecté — il passe toujours `this.location.id` comme `integrationId` — seul ce filet de
sécurité automatique en était dépourvu.

## Correction

Résout l'intégration réelle de chaque event via son lien `Event.weezeventEventId →
SalesEvent.integrationId`, et regroupe les jobs par **(space, intégration)** au lieu de (space)
seul — un job distinct est mis en queue par intégration, chacun avec son `integrationId` propre.
Un event pas encore lié (`weezeventEventId` null) reste sans `integrationId` (comportement
inchangé pour ce cas : le repli `t."eventId" IS NULL` de l'agrégation ne dépend pas de
l'intégration).

Test ajouté (`weezevent-cron.service.spec.ts`) : 2 events de 2 intégrations différentes sur le même
space → 2 jobs distincts avec leur `integrationId` propre (avant le fix : 1 seul job, `eventIds`
mélangés, `integrationId` absent). Suite complète : 16/16 passent.

## Risque de régression / à surveiller

- Les données déjà mal taguées par ce cron avant le fix (si le bug a eu l'occasion de se
  déclencher sur un tenant avec 2+ intégrations Weezevent en direct simultanément) ne sont **pas**
  corrigées rétroactivement — nécessiterait un ré-agrégation complète (delete + recompute par
  event, déjà idempotent) des spaces concernés. Aucune preuve trouvée dans les logs pour Stade
  Jean Bouin spécifiquement (`AggregationJobLog` n'a aucune entrée `trigger: 'live-safety-net'`
  pour ce space à la date du fix) — latent, pas confirmé matérialisé sur ce cas précis.
- Un `Event` lié à un conteneur de saison (`weezeventEventId` = id de saison, pas de match) résout
  correctement son `integrationId` via ce même mécanisme (le conteneur appartient bien à UNE seule
  intégration) — pas de cas particulier nécessaire.
- N+1 requête `salesEvent.findMany` évitée : un seul appel batché par tenant (`IN (linkedEventIds)`), pas par event.

## Références

- [BUG-109](../../../backend/docs/bugs/109_aggregation_jamais_declenchee_automatiquement.md) —
  introduit ce filet de sécurité cron, sans le défaut de scoping découvert ici.
- BUG-146-01 (spaces.service.ts, `resolveEventSalesScope`/`getEventTimelineBatch`) — protection
  côté LECTURE (filtre par tag exact) déjà en place, insuffisante seule car ne peut pas corriger
  une écriture déjà mal taguée.
- [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) — même
  tenant/space (Stade Jean Bouin, PFC/SFP), bug distinct découvert dans la même famille
  d'investigation multi-intégrations.
