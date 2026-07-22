# BUG-020 — Un event "skipped" après traitement réussi garde un statut trompeur

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `aggregation.service.ts:51-70` (`getEventsTimelineStatus`), `:571-604`
  (`skipEvent`)

## Symptôme

Traiter un event avec succès, puis appeler `skip-event` dessus, puis relire `events-timeline` : le
comptage `dataPoints` et le statut affiché ne sont pas garantis cohérents.

## Cause racine

`skipEvent` créait un nouveau job log `status:'skipped'` qui **écrase** l'affichage
(`latestJobByEvent` retient le job le plus récent par event) sans jamais purger les lignes déjà
agrégées dans `SpaceRevenueMinuteAgg` pour cet event — un event traité-puis-skip gardait donc
`dataPoints > 0` sous un statut affiché "Skipped", incohérent avec le sens du mot.

## Correction

`skipEvent` purge maintenant `SpaceRevenueMinuteAgg` pour cet event (`deleteMany` scopé
`tenantId/spaceId/weezeventEventId`) dans la même transaction Prisma que la création du job log
`skipped`, pour rester cohérent en cas d'échec partiel. Retourne `purgedDataPoints` (nombre de
lignes purgées) en plus de `eventId`/`status`.

**Volontairement pas de purge de `SpaceProductRevenueDailyAgg`** : cette table est indexée par jour
calendaire (pas par `eventId`, cf. BUG-016/021) — la purger par date risquerait de supprimer les
données d'un second event légitime le même jour sur le même espace.

## Risque de régression / à surveiller

Tests ajoutés (`aggregation.service.spec.ts`, `describe('skipEvent')`) : vérifient l'appel exact du
`deleteMany` (tenantId/spaceId/weezeventEventId) et la valeur de `purgedDataPoints` retournée.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #7
