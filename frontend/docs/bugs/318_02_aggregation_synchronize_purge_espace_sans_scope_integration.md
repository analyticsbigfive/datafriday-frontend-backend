# BUG-318-02 — "Synchroniser" purge TOUS les agrégats de l'espace sans filtre d'intégration, puis ne reconstruit qu'une seule intégration

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/multi-integration-same-space`)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-14 (signalement utilisateur KOUAME Ulrich — même fil que BUG-317-02)
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts:568-583` (`executeSynchronize`,
    "Phase 1: cleanup atomique")
  - `backend/src/features/aggregation/aggregation.service.ts:532-559` (`synchronize()`, enqueue —
    `integrationId` transite correctement jusqu'au job)
  - `frontend/src/composables/useSynchronization.js:21-50` (`startSync`)
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue:1118` (appel
    `this.startSync(this.spaceId, this.location.id)` — confirme que le wizard passe bien
    `integrationId`, le défaut est entièrement backend)

## Symptôme

Deux intégrations mappées au même espace (même contexte que BUG-317-02). Depuis l'assistant de
l'intégration B, cliquer "Synchroniser" (bouton de l'étape 4, `handleSynchronize`/`startSync`,
`StepProcessTimeline.vue:1118`) fait disparaître **toutes** les données déjà agrégées pour
l'intégration A sur cet espace (CA/minute, CA/produit/jour, CA/minute/article), pas seulement celles
de B — l'espace se retrouve avec uniquement les chiffres de B après l'opération, y compris pour des
events que A avait déjà traités et que B n'a jamais vus (aucune vente sur ces dates côté B → 0 après
sync).

## Cause racine

`synchronize(tenantId, spaceId, integrationId)` (`aggregation.service.ts:532`) enqueue correctement
un job qui porte `integrationId` (ligne 558). Mais `executeSynchronize`, qui consomme ce job,
ignore totalement ce champ dans sa phase de nettoyage :

```ts
// aggregation.service.ts:578-583
await this.prisma.$transaction([
  this.prisma.spaceRevenueMinuteAgg.deleteMany({ where: { tenantId, spaceId } }),        // pas de integrationId
  this.prisma.spaceProductRevenueDailyAgg.deleteMany({ where: { tenantId, spaceId } }),  // pas de integrationId
  this.prisma.spaceRevenueMinuteItemAgg.deleteMany({ where: { tenantId, spaceId } }),    // pas de integrationId
]);

// Phase 2: retraitement
const result = await this.executeProcessEvents(job);   // celui-ci EST scopé par job.data.integrationId
```

Contrairement à `executeProcessEvents` (BUG-317-02), où au moins l'INSERT est filtré par
`integrationId`, ici **rien n'est filtré à la purge** : les trois tables d'agrégats du space entier
sont vidées inconditionnellement, puis reconstruites en ne repassant que par
`executeProcessEvents(job)` avec le même `integrationId` que celui reçu par `synchronize()` — donc
scopé à une seule intégration. Toute intégration mappée au même espace mais différente de celle
passée perd 100% de sa contribution aux trois tables, sans qu'aucune étape ne la retraite.

C'est un cas strictement plus sévère que BUG-317-02 : celui-ci ne touchait que
`SpaceRevenueMinuteAgg`/`SpaceRevenueMinuteItemAgg` pour un seul event à la fois ; celui-ci purge
en plus `SpaceProductRevenueDailyAgg` (non affecté par BUG-317-02) et le fait pour **tout l'espace**
en un clic, pas event par event.

## Correction

Corrigée en code le 2026-08-14 (branche `fix/multi-integration-same-space`, même migration que
BUG-317-02), pas encore testée en environnement réel ni déployée :

1. `executeSynchronize` (`aggregation.service.ts:568-...`) : `integrationId` est maintenant
   destructuré depuis `job.data` (il ne l'était pas — bug distinct trouvé en corrigeant celui-ci,
   la variable était utilisée nulle part alors même que `synchronize()`/`queueAggregationJob` la
   transmettaient déjà correctement jusqu'au job).
2. Phase 1 cleanup : les 3 `deleteMany` de la transaction sont scopés par `integrationId` **quand
   il est fourni** (`const cleanupWhere: any = { tenantId, spaceId }; if (integrationId)
   cleanupWhere.integrationId = integrationId`) — ne purge plus que la part de CETTE intégration.
3. `SpaceProductRevenueDailyAgg` a désormais aussi une colonne `integrationId` (migration commune
   avec BUG-317-02), nécessaire ici puisque cette table est purgée en Phase 1 alors qu'elle ne
   l'est pas dans `executeProcessEvents`.
4. Point non traité, volontairement hors scope : `skipEvent` (`aggregation.service.ts`) a le même
   défaut de fond (`spaceRevenueMinuteAgg.deleteMany({where:{tenantId,spaceId,weezeventEventId}})`
   sans `integrationId`) mais n'accepte même pas ce paramètre aujourd'hui (DTO/route/service à
   étendre) — pas couvert par ce fix, à traiter séparément si le besoin se confirme.
5. Bouton dédié "Synchroniser toutes les intégrations" (item 4 de la piste initiale) : non fait,
   décision produit à trancher séparément — le chemin `integrationId` absent existe toujours côté
   service mais n'a aujourd'hui aucun point d'entrée UI.
6. Tests : 2 tests ajoutés dans `aggregation.service.spec.ts` (cleanup scopé avec/sans
   `integrationId`). Suite complète verte, `tsc --noEmit` propre.

## Risque de régression / à surveiller

- Tout tenant avec 2+ intégrations sur un même espace ayant déjà cliqué "Synchroniser" a
  potentiellement perdu les agrégats d'une des deux intégrations dès aujourd'hui — resync des deux
  nécessaire après le fix.
- `AggregationJobLog` (historique des jobs) ne distingue pas non plus par intégration
  (`aggregationJobLog.findMany({where:{tenantId,spaceId}})`,
  `aggregation.service.ts:33-36`/`535-539`) — un futur fix affichant "dernière synchro par
  intégration" côté UI devra en tenir compte, ce n'est pas trackable aujourd'hui.

## Références

- [BUG-317-02](317_02_aggregation_processevents_deletemany_non_scope_integration.md) — même famille
  de cause racine, sur le chemin "Traiter" plutôt que "Synchroniser". Lire celle-ci en premier pour
  le détail du problème de schéma.
- [`../modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md).
