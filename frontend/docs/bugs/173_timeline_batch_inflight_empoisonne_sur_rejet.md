# BUG-173 — `getSpaceEventTimelineBatch` : registre in-flight jamais nettoyé sur échec → erreurs permanentes

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟠 Majeur (timelines définitivement en erreur jusqu'au reload)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/api/endpoints/space.api.js` (batch, ex-`:193-201`)

## Symptôme

Une requête batch `/spaces/:id/event-timeline?eventIds=` qui échoue (réseau, 5xx) laissait dans `_eventTimelineInflight` une promesse **rejetée** par event demandé. Tout appel ultérieur pour ces events (`.has()` → `await` la promesse rejetée) re-levait la même erreur **sans jamais retenter la requête** — timelines mortes jusqu'au reload de la page.

## Cause racine

Les entrées in-flight n'étaient supprimées que dans la boucle du chemin **succès**. La variante single-event, elle, nettoyait correctement en `finally` (`:144-146`) — asymétrie.

## Correction

2026-07-18 : nettoyage déplacé dans un `try/finally` autour de l'`await` du batch (même pattern que le single-event). Spec de non-régression : `tests/unit/spaceApiTimelineBatch.spec.js` (échec puis retry OK ; cache après succès).

## Risque de régression / à surveiller

Un awaiter concurrent qui avait déjà récupéré la promesse rejetée reçoit toujours l'erreur (correct : sa requête a échoué) ; seuls les appels SUIVANTS retentent.

## Références

- Fiche 180 (le moteur predict s'appuie désormais sur ce batch — ce fix était un prérequis)
