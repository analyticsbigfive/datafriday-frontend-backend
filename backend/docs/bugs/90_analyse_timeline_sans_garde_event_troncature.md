# BUG-90 — `/analyse/timeline/:eventId` : eventId jamais vérifié, troncature LIMIT silencieuse

- **Statut** : 🟢 Corrigé (garde) / ⚪ Diagnostiqué (flag de troncature)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/analyse/analyse.service.ts:106-` (getTimeline)

## Symptôme

1. Un `eventId` inconnu (typo, event d'un autre tenant) renvoyait silencieusement `[]` — indiscernable d'un event réel sans vente.
2. L'agrégat minute×merchant×produit est plafonné `LIMIT 5000` : un gros événement rend des données minute **partielles sans aucun signal** (ni flag, ni log).

## Cause racine

La requête raw filtre `t.tenantId + t.eventId` mais ne vérifie jamais que l'event (WeezeventEvent, modèle `SalesEvent`) existe pour le tenant. Le shape de réponse (array nu) ne permet pas de porter un flag `truncated` sans breaking change.

## Correction

2026-07-18 : garde d'existence `salesEvent.findFirst({ id, tenantId })` → 404 explicite ; log `warn` serveur quand `rows.length === limit` (troncature). Le flag de réponse `truncated` reste À FAIRE (breaking change du shape — à trancher si un consommateur réel apparaît ; l'endpoint n'a actuellement **aucun consommateur front**, cf. fiche front 172).

## Risque de régression / à surveiller

Un client qui sondait des eventIds inexistants reçoit désormais 404 au lieu de `[]`. Spec ajoutée (`analyse.service.spec.ts`).

## Références

- BUG-89 (même module), fiche front 172
