# BUG-339-03 — Réco logistique & inventaire : miroirs de la fenêtre de vente non alignés sur le fix 339-02 (double comptage de la consommation entre matchs consécutifs)

- **Statut** : 🟢 Corrigé le 2026-08-19 (branche `fix/analyse-page-load-perf`) — JLH
- **Sévérité** : 🟠 Important (chiffres de réconciliation post-event faux pour les matchs
  consécutifs — même famille de données que 339-02, mais écran de réco, pas la page Analyse)
- **Domaine** : Logistique / Inventaire / Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-19 — revue systématique des « miroirs » documentés de la fenêtre
  de vente après le fix BUG-339-02, pendant la planification des correctifs (JLH)
- **Fichiers** :
  - `backend/src/shared/utils/event-window.util.ts` (`computeEventSalesWindow` — NOUVELLE
    fonction pure partagée, extraction à l'identique de la logique du fix 339-02)
  - `backend/src/features/spaces/spaces.service.ts` (`resolveEventSalesScope` — refactoré pour
    appeler la fonction partagée, comportement inchangé, les 4 tests 339-02 passent sans
    modification)
  - `backend/src/features/logistics/logistics.service.ts` (`deriveEventConsumption` — miroir
    corrigé)
  - `backend/src/features/inventory/inventory.service.ts` (`getPostEventBaseline` — miroir
    corrigé)

## Symptôme

Pour deux events consécutifs (ex. Stade Jean Bouin : "PFC - RC Lens" finit le 15/02 à 03h00,
"SFP-Toulouse" commence le 15/02), la réconciliation post-event et l'indice de comptage
post-event comptaient les ventes de la tranche minuit → 03h00 du 15/02 dans les DEUX matchs —
exactement le double comptage corrigé côté page Analyse par BUG-339-02, mais resté actif dans
ces deux écrans.

## Cause racine

`deriveEventConsumption` (logistics) portait un commentaire « MIROIR de
`SpacesService.getEventTimelineBatch` … toute clause modifiée ici doit l'être là-bas » — et
`getPostEventBaseline` (inventory) était à son tour « miroir exact de la fenêtre de
deriveEventConsumption » (règle métier du 2026-07-30 : la fenêtre des mouvements doit être
identique à celle des ventes). Le fix 339-02 a resserré la fenêtre côté
`resolveEventSalesScope` (spaces.service.ts) mais les deux miroirs calculaient toujours
`eventDate → eventEndDate + 1 jour` en local.

## Correction implémentée (2026-08-19)

La logique de fenêtre du fix 339-02 est extraite en fonction pure partagée
`computeEventSalesWindow(event, allSpaceEvents, spaceTimezone)` dans
`event-window.util.ts` (fonction pure et non méthode de service : `spaces.service` importe
déjà `LogisticsService`, l'injection inverse créerait une dépendance circulaire) :

- `windowEnd` = heure de fin réelle (`eventEndTime` ?? `showTime` dernière session, via
  `combineDayAndLocalTime`), repli jour calendaire entier (+1 jour) ;
- `windowStart` = minuit du jour de début, avancé à l'heure de fin du dernier voisin finissant
  ce jour-là (seuls les voisins finissant avant la fin de l'event courant comptent) ;
- `null` si fenêtre vide ou event-conteneur (`MAX_EVENT_SPAN_DAYS`, désormais exporté par le
  util).

Les trois consommateurs l'appellent :

- `resolveEventSalesScope` : refactor pur, comportement identique (un id `WeezeventEvent`
  passe par la même fonction avec `eventEndTime`/`sessions` null et sans voisins → repli
  historique, comme avant) ;
- `deriveEventConsumption` : charge en plus `Space.timezone` + les events voisins de l'espace
  (dans le `Promise.all` existant) et remplace la fenêtre locale. Fenêtre `null`
  (event-conteneur / fenêtre vide) → **repli historique jour entier**, le comportement d'avant
  ce fix (la réco d'un conteneur ne doit pas devenir subitement vide) ;
- `getPostEventBaseline` : `movementsBefore` = `windowEnd` de la fenêtre partagée, même repli
  historique si `null` — ventes et mouvements parlent toujours de la même période (règle
  métier 2026-07-30 préservée).

Différence assumée avec la page Analyse : `resolveEventSalesScope` EXCLUT les events sans
fenêtre (ils disparaissent du batch), tandis que logistics/inventory replient sur le jour
entier — un écran de réco doit rester calculable même pour un event mal borné.

Tests : `event-window.util.spec.ts` (8 cas : PFC/SFP, repli sans heure de fin, repli
`showTime`, deux events le même jour, voisin sans heure de fin, event-conteneur → null, garde
voisin finissant après la fin). Mocks des specs logistics/inventory complétés
(`event.findMany`, `space.timezone`). Suites logistics/inventory/spaces : aucune nouvelle
régression (les 5 échecs `readyForSale`/`createPostEventReconciliation — meta`/`findAll`
préexistent sur HEAD propre, vérifié par stash).

## Risque de régression / à surveiller

- Même vigilance que 339-02 : un event d'un seul jour avec `eventEndTime` avant minuit perd
  les ventes entre son heure de fin et minuit dans la réco aussi — conforme à la règle métier,
  à surveiller (QUESTIONS_A_BERTRAND si ça remonte).
- La réco post-event d'events déjà validés avant ce fix a été calculée avec l'ancienne
  fenêtre — les instantanés archivés ne sont pas recalculés.

## Références

- [BUG-339-02](339_02_analyse_event_revenue_double_compte_fenetre_jour_entier.md) — le fix
  d'origine côté page Analyse, règle métier détaillée.
- [BUG-339-04](339_04_analyse_total_kpi_bascule_source_shop_vs_item.md) — bug frère découvert
  dans la même passe (total KPI qui saute pendant le chargement).
