# BUG-330-02 — L'agrégation devine l'event d'une transaction par plage de dates alors qu'une FK exacte (`eventId`) existe déjà pour chaque transaction

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/event-aggregation-window-precision`)
  — root cause commune à BUG-328-02 et BUG-329-02, corrigés ensemble via
  `AggregationService.resolveEventWindow()`.
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-14 — en creusant BUG-328-02/329-02 (signalement KOUAME Ulrich sur le
  chevauchement d'events).
- **Fichiers** :
  - `backend/prisma/schema.prisma` — `SalesTransaction.eventId` (`@@index([eventId,
    transactionDate])`, `@@index([tenantId, eventId, status])`)
  - `backend/src/features/weezevent/services/sync/transaction-sync.service.ts:355-356,388,400`
    (résolution + écriture de `eventId` à chaque upsert de transaction)
  - `backend/src/features/digifood/services/digifood-ingestion.service.ts:131,142` (idem côté
    Digifood, `eventId: salesEvent?.id`)
  - `backend/prisma/schema.prisma` — `Event.weezeventEventId` (lien Event DataFriday ↔ SalesEvent,
    posé par l'auto-matching BUG-021)
  - `backend/src/features/aggregation/aggregation.service.ts:246-260,288-429` (requêtes SQL
    d'agrégation, filtrage uniquement par plage de dates)

## Symptôme

Voir BUG-328-02 pour le symptôme observable (double comptage sur chevauchement). Ce ticket porte
sur la cause racine commune et la correction structurelle.

## Cause racine

`WeezeventTransaction.eventId` (colonne physique de `SalesTransaction`) est une FK réelle vers
`SalesEvent`, **posée automatiquement pour chaque transaction à l'ingestion**, aussi bien côté
Weezevent (`transaction-sync.service.ts` — `eventDbId = eventWid ? eventIdMap.get(eventWid) : null`,
écrit en `create` ET en `update`) que côté Digifood (`digifood-ingestion.service.ts`, `eventId:
salesEvent?.id`). Deux index dédiés existent même déjà en base (`@@index([eventId,
transactionDate])`, `@@index([tenantId, eventId, status])`) — le schéma a clairement été pensé pour
que cette colonne serve à des requêtes scopées par event.

**Or `executeProcessEvents` ne la lit jamais.** La requête d'agrégation (3 blocs `INSERT ... SELECT`,
`aggregation.service.ts:288-429`) filtre exclusivement sur `t."transactionDate" >= eventDate AND <
nextDay` — une comparaison de date entre le `WeezeventTransaction` et le `Event` DataFriday, qui
n'a par ailleurs aucune notion d'heure (BUG-329-02). Résultat : le système **redécouvre par
approximation** une information qu'il possède déjà exactement.

Pourquoi ce n'est pas trivialement substituable en un seul coup :
- `eventId` pointe vers `SalesEvent` (l'event Weezevent/Digifood brut), pas directement vers
  `Event` (DataFriday). Le pont est `Event.weezeventEventId` — posé par l'auto-matching (BUG-021,
  une seule correspondance non ambiguë tenant+date) ou par la résolution manuelle
  (`PATCH :id/weezevent-link`). **`bulkCreateEvents` ("Créer et lier tout", le flux le plus utilisé
  de l'étape 4) ne le pose PAS** — il écrit dans `SalesEvent.metadata.dfEventId`, un champ jamais
  relu par l'API (voir BUG-331-02, trouvé en répondant à la question d'Ulrich "l'event de vérité
  est celui créé dans DataFriday, comment on gère les données manquantes côté Weezevent/Digifood ?"
  — la réponse : `SalesEvent` ne sert que de pont via `eventId`, jamais de source de données, mais
  encore faut-il que le pont soit réellement posé). **BUG-331-02 est donc un prérequis direct** :
  sans lui, ce fix ne bénéficierait qu'aux events liés par le matching automatique — une minorité
  en pratique — et non aux events créés/liés en masse depuis le wizard.
- Toute transaction sans `eventId` (webhook/API n'ayant pas fourni `event_id`, import CSV
  historique, données antérieures à la mise en place du champ) reste orpheline de cette méthode —
  un repli par date reste nécessaire pour ce sous-ensemble.
- Le "site as event" de Digifood (`upsertSiteAsEvent`) mériterait d'être vérifié : s'il représente
  le lieu de vente en continu plutôt qu'une occurrence datée précise, le mapping `SalesEvent` ↔
  `Event` (occurrence datée) n'est peut-être pas 1:1 dans ce cas — à confirmer avant d'appliquer
  cette même logique aux deux providers sans distinction.

## Correction

Corrigée en code le 2026-08-14 (branche `fix/event-aggregation-window-precision`) :

0. **Préalable traité** : BUG-331-02 corrigé en parallèle (`bulkCreateEvents` pose désormais
   `Event.weezeventEventId` via `resolveWeezeventLink`) + script de backfill écrit et testé en
   dry-run (`scripts/backfill-event-weezevent-link.ts`).
1. `AggregationService.resolveEventWindow()` (`aggregation.service.ts`) retourne
   `{mode:'exact', salesEventId}` quand `Event.weezeventEventId` est renseigné — les 3 blocs
   `INSERT ... SELECT` de `executeProcessEvents` filtrent alors `t."eventId" = <salesEventId>` **en
   remplacement complet** de la comparaison de dates. Élimine tout risque de double comptage pour
   ces transactions, chevauchement de dates ou non.
2. Repli par plage de dates conservé pour les transactions sans `eventId` résolu — fenêtre
   améliorée par BUG-329-02, **toujours filtrée `t."eventId" IS NULL`** en plus des bornes de
   dates : une transaction déjà revendiquée par un event (via son `eventId`) ne peut plus jamais
   être captée par la fenêtre de repli d'un autre event.
3. Migration/resync explicite : PAS fait automatiquement par ce commit — les events déjà traités
   gardent leurs anciens agrégats tant qu'un "Traiter"/"Synchroniser" n'est pas relancé. À planifier
   séparément (resync manuel ou job de fond) avant de considérer les chiffres affichés à jour.

## Risque de régression / à surveiller

- Impact large : tout consommateur des 3 tables d'agrégats (Analyse, Live, Restock, Event Predict
  via `getEventTimelineBatch`) verra ses chiffres recalculés différemment après un resync — à
  tester largement avant déploiement, pas un simple hotfix.
- Taux de transactions SANS `eventId` non mesuré en production — le repli par date reste le chemin
  dominant tant que peu d'events sont liés (voir BUG-331-02, le backfill dry-run n'a trouvé que 4
  `SalesEvent` avec un `dfEventId` historique, 0 exploitables — la base de liens exacts en
  production est probablement encore réduite).
- Sémantique du "site as event" Digifood non confirmée avec Bertrand — traité de façon identique à
  Weezevent par ce fix (le mécanisme `eventId`/`weezeventEventId` ne fait aucune distinction par
  provider), à revalider si le concept Digifood s'avère différent.

## Références

- [BUG-328-02](328_02_aggregation_chevauchement_fenetres_events_double_comptage.md) — symptôme
  direct de cette cause racine.
- [BUG-329-02](329_02_aucune_heure_capturee_evenement_buffer_pre_ouverture.md) — fix complémentaire
  (nécessaire même après celui-ci, pour le repli par date et pour l'UX de saisie).
- [BUG-331-02](331_02_bulkcreateevents_ne_pose_jamais_event_weezeventeventid.md) — **prérequis** :
  sans lui, `Event.weezeventEventId` reste `null` pour la plupart des events, ce fix n'a alors
  d'effet que sur une minorité.
- [`../modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md) — modèle
  `Event.weezeventEventId` (auto-matching BUG-021), distinction `SalesEvent` vs `Event`.
