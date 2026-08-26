# BUG-367-02 — Le badge "Agrégé" survivait à la purge des data points (statut basé sur l'historique de jobs, pas sur les données actuelles)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (contradiction visuelle, aucune donnée fausse affichée — juste
  trompeur sur l'état réel)
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en testant BUG-366-02 sur "Le Mans FC vs Brest" :
  "j'ai cliqué sur démapper mais visuellement rien ne s'est passé après un état de loading. En
  actualisant, juste les datapoints qui ont disparu. Alors ça sert à quoi au juste ?"
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts:83-107`
  (`getEventsTimelineStatus`) ; `frontend/src/components/integration/wizard/StepProcessTimeline.vue:317-326`
  (bouton "Démapper")

## Symptôme

Après "Démapper" (BUG-366-02) : les data points passent bien à "—" (les lignes
`SpaceRevenueMinuteAgg` sont purgées), mais le badge de statut reste "Agrégé" (vert) et le bouton
"Démapper" reste affiché — comme si rien n'avait changé. Contradiction visuelle : un event
"Agrégé" avec 0 point de donnée n'a aucun sens.

## Cause racine

`aggregationStatus` (`getEventsTimelineStatus`) était calculé uniquement depuis le dernier
`AggregationJobLog` de l'event (`job?.status || 'pending'`), jamais recroisé avec le nombre de
data points ACTUELLEMENT présents (`dataPointsByEvent`). Le job "completed" d'avant le Démapper
reste en historique (la purge ne supprime que les agrégats, pas les logs de jobs) — donc le badge
continue de refléter "a été agrégé un jour", pas "a des données valides maintenant". Même défaut
de fond que le symptôme originel de toute cette investigation (Nantes-Rodez, Le Mans FC : "Agrégé"
+ "—" data points, déjà vu plusieurs fois cette session sans jamais corriger la cause structurelle).

Le bouton "Démapper" lui-même n'avait aucune condition d'affichage — restait visible même sur un
event déjà délié (`weezeventEventId` déjà `null`), un no-op qui n'avait plus de sens à proposer.

## Correction

- `getEventsTimelineStatus` : un job `completed` avec `dataPoints === 0` est reclassé `pending`
  plutôt que `completed` — le statut suit désormais l'état actuel des données, pas seulement le
  dernier job en historique.
- Le bouton "Démapper" ne s'affiche plus que si `item._raw?.weezeventEventId` existe — une fois
  délié, la ligne redevient visuellement identique à un event jamais lié (statut "Non traité",
  boutons "Traiter"/pas de "Démapper") — cohérent avec la promesse de BUG-366-02 ("redevient comme
  un event jamais lié").

Test ajouté (`aggregation.service.spec.ts`) : job `completed` + 0 data point → statut `pending`.
Suite complète : 63/63 passent.

## Risque de régression / à surveiller

- Ce même mécanisme de contradiction (statut basé sur job history seul) a pu produire des faux
  "Agrégé" ailleurs dans la session avant d'être compris comme un défaut structurel — pas
  d'audit exhaustif fait pour vérifier qu'aucun autre endroit de l'app ne s'appuie sur
  `aggregationStatus` sans le recroiser avec `dataPoints`.
- Pas testé en conditions réelles (pas de serveur de dev lancé pendant ce fix).

## Références

- [BUG-366-02](366_02_demapper_detachait_event_du_space_au_lieu_du_lien.md) — le bouton dont le
  test a révélé cette contradiction.
