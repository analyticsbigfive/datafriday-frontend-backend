# BUG-317-02 — `executeProcessEvents` efface les agrégats de TOUTES les intégrations d'un event partagé avant de ne réinsérer que celle traitée

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/multi-integration-same-space`)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-14 (signalement utilisateur KOUAME Ulrich : "quand je choisis le même
  space pour 2 data-intégrations, j'ai l'impression que les données de l'une écrasent celles de
  l'autre, surtout au step 4, events et transactions")
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts:254-260` (`deleteMany` non scopé)
  - `backend/src/features/aggregation/aggregation.service.ts:262-325` (bloc `SpaceRevenueMinuteAgg`,
    `integrationClause` appliqué seulement à l'INSERT)
  - `backend/src/features/aggregation/aggregation.service.ts:378-422` (bloc
    `SpaceRevenueMinuteItemAgg`, même défaut)
  - `backend/src/features/aggregation/aggregation.service.ts:430-455` (rollup `Event.revenue` /
    `transactionCount` / `avgSpendPerTx` / `perCapita`, lit ce que le bloc ci-dessus vient de
    laisser en base)
  - `backend/prisma/schema.prisma:2849-2912` (modèles `SpaceRevenueMinuteAgg` /
    `SpaceRevenueMinuteItemAgg` — aucune colonne `integrationId`)

## Symptôme

Un `Space` a 2 `Integration` actives mappées dessus (ex. 2 instances Weezevent, ou Weezevent +
Digifood — cas d'usage explicitement permis par le modèle, voir `LocationSpaceMapping.@@unique
([tenantId, salesLocationId])`, pas de contrainte par `spaceId`). Le même `Event` DataFriday
(partagé au niveau de l'espace, pas de l'intégration — `AggregationService.processEvents`
sélectionne les `Event` par `{tenantId, spaceId}` uniquement, `aggregation.service.ts:167`) reçoit
des ventes des deux intégrations sur la même plage de dates.

Repro : cliquer "Traiter" (bouton par ligne, `StepProcessTimeline.vue:317`, ou "Tout agréger") pour
cet event depuis l'assistant de l'intégration A, puis depuis l'assistant de l'intégration B (ou
l'inverse) → à chaque exécution, le CA/nombre de transactions affichés sur l'`Event` (Revenue,
Transactions, Avg Spend/Tx, Per Capita) reflètent **seulement** la dernière intégration traitée,
comme si l'autre n'avait jamais eu de ventes.

## Cause racine

`executeProcessEvents` (appelée par le bouton "Traiter"/"Tout agréger" du wizard, qui passe bien
`integrationId = this.location.id` — voir `useTimelineProcessing.js:111-150`,
`StepProcessTimeline.vue:915,1027`, donc le paramètre arrive correctement jusqu'ici) fait, pour
chaque event :

```ts
// aggregation.service.ts:254-260
await this.prisma.spaceRevenueMinuteAgg.deleteMany({
  where: { tenantId, spaceId, weezeventEventId: event.id },   // PAS de integrationId
});
await this.prisma.spaceRevenueMinuteItemAgg.deleteMany({
  where: { tenantId, spaceId, weezeventEventId: event.id },   // PAS de integrationId
});
```

Le `deleteMany` efface **toutes** les lignes de cet event, quelle que soit l'intégration qui les a
produites. La ré-insertion qui suit (`INSERT ... SELECT ... FROM "WeezeventTransaction" t`,
lignes 287-325 et 378-422) est, elle, filtrée par `integrationClause` (`AND t."integrationId" =
${integrationId}`, ligne 263-265) **quand `integrationId` est fourni** — ce qui est le cas normal
depuis le wizard. Résultat : delete large, insert étroit → les lignes de l'intégration NON traitée
disparaissent purement et simplement, jusqu'à ce que quelqu'un relance "Traiter" pour elle aussi
(ce qui effacera alors la contribution de la première).

Le rollup qui suit immédiatement (`aggregation.service.ts:430-434`) confirme le symptôme observable
côté utilisateur :

```ts
const eventRollup = await this.prisma.spaceRevenueMinuteAgg.aggregate({
  where: { tenantId, spaceId, weezeventEventId: event.id },   // pas de integrationId non plus —
  _sum: { revenueHt: true, transactionsCount: true },          // correct EN SOI (il doit sommer
});                                                             // toutes les intégrations), mais
                                                                 // porte sur une base que le delete
                                                                 // ci-dessus vient de tronquer.
```

Cause racine structurelle : **`SpaceRevenueMinuteAgg` et `SpaceRevenueMinuteItemAgg` n'ont aucune
colonne `integrationId`** (`schema.prisma:2849-2912`) — rien dans le schéma ne permet de supprimer
"la part d'une seule intégration" sans supprimer toute la ligne, qui peut porter la contribution de
plusieurs intégrations mélangées par le grain `(minute, weezeventLocationId, weezeventMerchantId,
spaceElementId)`. `SpaceProductRevenueDailyAgg` n'est **pas** touché par ce bug précis : son upsert
est keyé sur `weezeventProductId` (`ti."productId"`, ligne 339), qui est propre au catalogue produit
de chaque intégration (`SalesProduct` est unique par `[tenantId, integrationId, externalId]`) — deux
intégrations ne peuvent jamais y entrer en collision, donc pas de delete accidentel de l'une par
l'autre sur cette table précise.

## Correction

Corrigée en code le 2026-08-14 (branche `fix/multi-integration-same-space`), pas encore testée en
environnement réel ni déployée :

1. Migration `20260814170000_add_integrationid_space_revenue_agg` (`backend/prisma/migrations/`,
   écrite à la main conformément à ADR-0002) : ajoute une colonne `integrationId TEXT` nullable à
   `SpaceRevenueMinuteAgg`/`SpaceRevenueMinuteItemAgg`/`SpaceProductRevenueDailyAgg` (cette
   dernière pour BUG-318-02), **sans toucher aux `@@unique` existants** — `weezeventLocationId`/
   `weezeventMerchantId`/`weezeventProductId` restent des cuid uniques par intégration en
   pratique, donc l'unicité de ces 3 tables ne dépendait pas de cette colonne ; elle sert
   uniquement à scoper les `deleteMany`. Backfill SQL inclus (dérive `integrationId` depuis
   `WeezeventLocation`/`WeezeventMerchant`/`WeezeventProduct` pour les lignes déjà en base).
2. `executeProcessEvents` (`aggregation.service.ts:254-260`) : le `deleteMany` des deux tables est
   maintenant scopé par `integrationId` **quand il est fourni** (`const deleteWhere: any = {
   tenantId, spaceId, weezeventEventId: event.id }; if (integrationId) deleteWhere.integrationId =
   integrationId`) — ne clobber que la part de l'intégration réellement retraitée.
3. Les 3 blocs `INSERT ... SELECT` (`SpaceRevenueMinuteAgg`, `SpaceProductRevenueDailyAgg`,
   `SpaceRevenueMinuteItemAgg`) écrivent désormais `integrationId` via `MAX(t."integrationId")`
   (agrégat scalaire, **pas ajouté au `GROUP BY`** pour ne pas risquer de scinder un groupe
   existant et provoquer un conflit "ON CONFLICT DO UPDATE command cannot affect row a second time"
   sur le rare cas de transactions sans `locationId` ni `merchantId`) ; `DO UPDATE SET
   "integrationId" = EXCLUDED."integrationId"` auto-corrige les lignes historiques à `NULL` dès
   leur prochaine réécriture.
4. Quand `integrationId` n'est PAS fourni (retraitement "toutes intégrations" — chemin qui existe
   côté service mais n'a aujourd'hui aucun point d'entrée UI, le wizard passe toujours
   `this.location.id`), le comportement large (tout effacer puis tout réinsérer pour l'event) est
   inchangé, conservé volontairement.
5. Tests : `aggregation.service.spec.ts` — assertion existante mise à jour (le `deleteMany` reçoit
   maintenant `integrationId` puisque `makeBullJob()` en fournit un par défaut) + 2 tests ajoutés
   (scoping avec/sans `integrationId`). Suite complète verte (`npx jest
   aggregation.service.spec.ts`), `tsc --noEmit` propre.

## Risque de régression / à surveiller

- Tout tenant ayant déjà utilisé 2 intégrations sur le même espace avant ce fix a potentiellement
  des `Event.revenue`/`transactionCount` sous-évalués dès aujourd'hui (ne reflétant que la dernière
  intégration traitée) — un resync complet des deux intégrations sera nécessaire après le fix pour
  retrouver les vrais totaux combinés.
- Après le fix, vérifier que `getEventStats`/`getEventBreakdown`/`getEventMinuteChart`
  (`aggregation.service.ts`, consommés par le détail event) continuent de sommer **toutes** les
  intégrations d'un event partagé (comportement voulu), et pas seulement celle passée en dernier.

## Références

- [`../modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md) — Piège n°1
  (auth multi-instance, bug voisin mais distinct : celui-ci concerne l'authentification API, pas
  l'agrégation).
- [BUG-318-02](318_02_aggregation_synchronize_purge_espace_sans_scope_integration.md) — même
  famille de cause racine (absence de colonne `integrationId` sur les tables d'agrégats), sur le
  chemin "Synchroniser" plutôt que "Traiter".
- Commentaire `BUG-014`/`BUG-015` dans `aggregation.service.ts:270-330` — bugs historiques déjà
  corrigés sur ces mêmes blocs SQL (résolution `spaceElementId`, formule HT/TTC), non liés à
  celui-ci.
