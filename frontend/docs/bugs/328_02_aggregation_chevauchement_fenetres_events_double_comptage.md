# BUG-328-02 — Deux events du même space dont les plages de dates se recoupent comptent deux fois les mêmes transactions

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/event-aggregation-window-precision`) —
  résolu comme conséquence de BUG-330-02 (rattachement exact par `eventId`) et BUG-329-02 (fenêtre
  de repli qui exclut désormais `t."eventId" IS NULL`), aucun code spécifique à ce ticket.
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-14 — signalé explicitement par KOUAME Ulrich comme "un vrai problème"
  après explication du fonctionnement de l'agrégation par événement.
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts:246-260` (calcul de la fenêtre
    `eventDate`/`baseEndDate`/`nextDay`, boucle `for (const event of events)`)
  - `backend/src/features/aggregation/aggregation.service.ts:288-328, 334-363, 383-429` (les 3
    `INSERT ... SELECT` filtrés uniquement par `t."transactionDate" >= eventDate AND < nextDay`)

## Symptôme

Scénario réel donné en exemple : **Event A** commence lundi 4 à 12h, se termine mardi 5 à 2h du
matin. **Event B** commence mardi 5, se termine mercredi 6 à 1h du matin. Les deux sont dans le même
`Space`.

Comme documenté dans `Event.eventDate`/`eventEndDate` (voir BUG-329-02 pour le détail), ces heures
ne sont **jamais stockées** — seules les dates comptent :
- Fenêtre A = `[lundi 4 00:00, mercredi 6 00:00[` (tout lundi + tout mardi).
- Fenêtre B = `[mardi 5 00:00, jeudi 7 00:00[` (tout mardi + tout mercredi).

Les deux fenêtres se recoupent **entièrement sur mardi**. `executeProcessEvents` traite chaque
event dans une boucle indépendante (`for (const event of events)`), sans aucune exclusion mutuelle
entre events : chaque transaction de mardi est sélectionnée par la requête SQL de l'Event A **et**
par celle de l'Event B, et écrite dans `SpaceRevenueMinuteAgg` sous les **deux** `weezeventEventId`
différents. Le CA/nombre de transactions de mardi est donc compté deux fois si on additionne le CA
des deux events — et chaque `Event.revenue`/`transactionCount` individuel (rollup
`aggregation.service.ts:437-462`) inclut lui-même tout mardi en entier, pas seulement "sa" part
réelle de la journée.

## Cause racine

Le rattachement transaction → event se fait **uniquement par comparaison de date** (`transactionDate
>= eventDate AND < nextDay`), sans jamais utiliser `WeezeventTransaction.eventId` — une FK réelle et
précise vers `SalesEvent`, posée automatiquement pour **chaque transaction** à l'ingestion, aussi
bien côté Weezevent (`transaction-sync.service.ts:388,400`) que Digifood
(`digifood-ingestion.service.ts:131,142`). Cette FK garantit qu'une transaction n'appartient qu'à
**un seul** event — l'ambiguïté de chevauchement ne devrait pas exister pour les transactions qui la
portent. Voir BUG-330-02 pour la proposition de fix structurel basée sur cette FK.

Cause racine secondaire, indépendante : même sans chevauchement de *jours*, la fenêtre actuelle n'a
aucune granularité horaire (voir BUG-329-02) — deux events consécutifs (fin de l'un = début de
l'autre le même jour calendaire) se recoupent systématiquement sur toute la journée de transition.

## Correction

Corrigée en code le 2026-08-14, via `AggregationService.resolveEventWindow()`
(`aggregation.service.ts`, voir BUG-330-02/329-02 pour le détail) :

1. Un event lié à un `SalesEvent` (`Event.weezeventEventId`) rattache ses transactions par
   `t."eventId" = <salesEventId>` — exact, aucune ambiguïté possible même si les dates de deux
   events se recoupent.
2. Un event non lié rattache uniquement des transactions elles-mêmes non liées
   (`t."eventId" IS NULL`), sur une fenêtre par date améliorée (heure d'ouverture réelle ou dérivée
   des transactions observées, BUG-329-02) — jamais une transaction déjà revendiquée par un autre
   event via son propre `eventId`.

Résidu qui subsiste, documenté et accepté : deux events NI l'un ni l'autre liés à un `SalesEvent`
pourraient encore, en théorie, avoir des fenêtres de repli qui se recoupent sur des transactions
elles-mêmes non liées — cas résiduel, pas traité spécifiquement (nécessiterait un arbitrage
"transaction assignée à l'event le plus proche", non implémenté).

## Risque de régression / à surveiller

- Tout tenant ayant déjà des events aux dates chevauchantes sur un même space a des
  `Event.revenue`/`transactionCount`/agrégats déjà faussés (gonflés) — resync nécessaire après fix.
- Le fix doit définir un comportement explicite pour le résidu de chevauchement qui subsisterait
  malgré tout (ex. deux events manuels sans lien Weezevent, plages se touchant réellement) : ne
  jamais compter deux fois, quitte à signaler le conflit plutôt qu'à deviner silencieusement.

## Références

- [BUG-329-02](329_02_aucune_heure_capturee_evenement_buffer_pre_ouverture.md) — absence totale
  d'heure de début, prérequis pour réduire (pas éliminer) ce chevauchement.
- [BUG-330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md) — fix
  structurel recommandé (utiliser la FK `eventId` déjà posée à l'ingestion).
- [`../modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md).
- [BUG-317-02 à 321-02](317_02_aggregation_processevents_deletemany_non_scope_integration.md) —
  même fichier, même session d'audit (multi-intégration sur un même space), problème distinct.
