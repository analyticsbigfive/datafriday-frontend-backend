# BUG-026 — Bulk-create du wizard ne reporte pas la taxonomie vers l'Event créé

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `StepProcessTimeline.vue:1173-1211` vs `CreateEventDialog.vue:499-514`

## Symptôme

Un `SalesEvent` enrichi via `EnrichEventDialog` (catégorie/équipes/performer) perd cette
information si l'événement est ensuite créé via le bulk du wizard plutôt qu'un par un.

## Cause racine

La création manuelle (`CreateEventDialog.vue`) copie eventType/category/subcategory/tickets ; la
création en masse (`bulkCreateEvents`) ne copie que nom/dates/spaceId.

## Correction

Aucune à ce jour — aligner `bulkCreateEvents` sur la création manuelle.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #3
