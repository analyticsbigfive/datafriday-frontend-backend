# BUG-130-01 — `getEventTimelineBatch` : MAX à un seul niveau écrase les merchants → timeline réelle plate

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business (la timeline réelle d'un event passé est fausse — elle alimente aussi le scoring Event Predict via les events sources)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-17
- **Fichiers** : `src/features/spaces/spaces.service.ts:1353` (`getEventTimelineBatch`), `src/features/aggregation/aggregation.service.ts:385` et `src/features/spaces/services/space-aggregation.service.ts:351` (les deux writers de `SpaceRevenueMinuteItemAgg`)

## Symptôme

Sur Event Predict, la carte « Actual timeline » d'un event passé affiche une courbe **plate à une
valeur quasi constante** (~20 € par minute) sur toute la journée, avec très peu de séries visibles.
Observé le 2026-08-17 sur l'event « Test Live Inventory » (espace Auxerre) en revenant de la page
post-event inventory.

Contexte de reproduction : la page post-event inventory se cale volontairement sur le **dernier
event passé** et réécrit `?event=` dans l'URL (`SpaceInventoryView.resolveEventContext`,
`frontend/src/views/SpaceInventoryView.vue:1628-1651`) ; au retour vers Event Predict, c'est donc
cet event passé qui s'ouvre et sa timeline réelle qui s'affiche. **Ce basculement-là est un
comportement voulu, pas un bug** — le bug est le contenu de la courbe.

## Cause racine

Régression du commit perf `8bd792a` (« pre-aggregate event × minute × shop × item revenue for
getEventTimelineBatch ») : la lecture de `SpaceRevenueMinuteItemAgg` faisait

```
MAX(mem."itemsCount"), MAX(mem."transactionsCount"), MAX(mem."revenueHt")
```

avec un `GROUP BY` (event, minute locale, shop, article) qui écrase à la fois
`weezeventEventId` **et** `weezeventMerchantId` (et la distinction entre locations non mappées).

Le MAX avait une raison d'être : les deux pipelines d'écriture taguent `weezeventEventId` avec des
conventions différentes (id `Event` DataFriday dans `aggregation.service.ts`, id `WeezeventEvent`
brut dans `space-aggregation.service.ts` — cf. BUG-123-01), donc quand les deux ont écrit pour la
même fenêtre on obtient deux lignes **jumelles** portant les mêmes valeurs, et SUM les compterait
en double.

**L'hypothèse « les lignes du groupe portent la même valeur » est fausse dès que le groupe fusionne
autre chose que le tag writer** : deux merchants (caisses) d'un même PdV qui vendent le même
article à la même minute sont des lignes distinctes de l'agrégat
(`weezeventMerchantId` fait partie du `@@unique`, `prisma/schema.prisma:2922`) et des ventes
légitimement distinctes. MAX n'en garde qu'une → chaque minute est plafonnée à la plus grosse
ligne au lieu du total → la courbe s'aplatit en plateau, d'autant plus visiblement que le PdV a de
caisses en parallèle.

## Correction

`getEventTimelineBatch` réécrit en **agrégation à deux niveaux** (même fichier, requête unique) :

1. CTE `dedup` : `MAX(...)` par (event, minute brute, `spaceElementId`, `weezeventLocationId`,
   `weezeventLocationName`, **`weezeventMerchantId`**, `weezeventProductId`) — seul
   `weezeventEventId` est écrasé, donc seules les jumelles writer-tag sont dédupliquées ;
2. niveau affichage : `SUM(...)` par (event, minute locale, shop, article) — merchants et
   locations distincts s'additionnent de nouveau.

`getSpaceEventTimeline` (wrapper du batch, :1184-1186) hérite du fix. Pas de filtre
`integrationId` en lecture : des lignes d'intégrations différentes couvrent des transactions
disjointes (clause `t."integrationId"` côté écriture), la SUM externe est le bon traitement — et
le commentaire du schéma (`schema.prisma:2911-2913`) réserve explicitement `integrationId` au
scoping des `deleteMany`.

Tests : `spaces.service.spec.ts` — nouveau `describe('getEventTimelineBatch')` (structure SQL
deux niveaux + mapping du shape front).

### Requête de vérification (lecture seule, à exécuter à la main)

Sur l'event concerné, mesurer l'écart MAX vs SUM et la présence de lignes multi-merchant :

```sql
SELECT "minute", "weezeventLocationId", "weezeventProductId",
       COUNT(*)                          AS lignes,
       COUNT(DISTINCT "weezeventMerchantId") AS merchants,
       COUNT(DISTINCT "weezeventEventId")    AS tags_writer,
       SUM("revenueHt")                  AS somme,
       MAX("revenueHt")                  AS maxi
FROM "SpaceRevenueMinuteItemAgg"
WHERE "tenantId" = :tenant AND "spaceId" = :space
  AND "minute" >= :event_date AND "minute" < :window_end
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY somme - maxi DESC
LIMIT 50;
```

`merchants > 1` (ou plusieurs locations) avec `somme > maxi` = ventes écrasées par l'ancien MAX ;
`tags_writer > 1` avec `somme = 2 × maxi` = jumelles writer-tag (le cas que le MAX interne
continue de dédupliquer).

## Risque de régression / à surveiller

- **Double comptage writer-tag** : si les jumelles des deux writers n'atterrissent pas sur la
  **même minute**, ni MAX ni SUM ne les rapproche. Les deux writers utilisent des expressions
  différentes (`date_trunc('minute', t."transactionDate")` vs
  `DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC')`, `transactionDate` étant un
  `DateTime` sans fuseau — `schema.prisma:1463`) : identiques seulement si le serveur Postgres est
  en UTC. À vérifier (`SHOW TimeZone`) — sinon fiche dédiée sur l'alignement des writers.
- Après déploiement, le front garde l'ancien résultat en cache session
  (`_eventTimelineCache`, `frontend/src/api/endpoints/space.api.js:126-160` — pas de TTL, pas
  d'invalidation) : **recharger la page** avant de juger.
- La fenêtre de lecture reste la **journée calendaire entière** de l'event (comportement
  historique assumé, chevauchements compris — commentaire :1337-1345) : l'axe 00:00→23:59
  n'est pas un bug de cette fiche → question produit posée (QUESTIONS_A_BERTRAND #49).
- Produits non mappés : le mapper (:1404-1418) n'émet aucun nom brut → séries droppées côté
  front (`EventTimelineChart.resolveSeriesKey`) → sous-comptage silencieux de l'affichage.
  Défaut distinct, hors périmètre de cette fiche.
- `@@unique` de `SpaceRevenueMinuteItemAgg` n'inclut pas `integrationId` → collision d'upsert
  possible entre intégrations partageant un espace (famille BUG-317-02/320-02), hors périmètre.

## Références

- Commit d'origine de la régression : `8bd792a` (perf event-timeline-item-agg).
- [BUG-125-01](125_01_event_timeline_groupby_placeholder_fuseau_500.md) (même requête, fuseau),
  BUG-270 (sémantique du champ `minute`), BUG-123-01 (conventions d'id des writers).
- `frontend/docs/QUESTIONS_A_BERTRAND.md` #49 (fenêtre journée vs heures de l'event).

---

JLH
