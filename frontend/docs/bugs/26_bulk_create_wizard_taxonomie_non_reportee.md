# BUG-026 — Bulk-create du wizard ne reporte pas la taxonomie vers l'Event créé

- **Statut** : 🟢 Corrigé (caduc — constaté le 2026-07-22)
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

2026-07-22 : constaté que la prémisse du bug n'existe plus. `EnrichEventDialog.vue` — le seul
mécanisme qui pouvait attacher catégorie/équipes/performer à un `weezEvent` avant bulk-create — a
été supprimé le 2026-07-20 (commit `46823f2`, refactor Data Integration) comme code mort : son
unique déclencheur n'était jamais invoqué, il n'était de toute façon jamais ouvrable dans l'UI
vivante. Un `weezEvent` ne porte donc plus aucune donnée de taxonomie à un stade quelconque avant
`bulkCreateEvents` (`StepProcessTimeline.vue:1209-1215`) — il n'y a plus rien à perdre, et rien de
réel à copier depuis `weezEvent` (contrairement à `CreateEventDialog.vue`, dont les champs
`eventTypeId`/`eventCategoryId`/etc. viennent d'un formulaire rempli par l'utilisateur, pas de
Weezevent). Aligner les deux payloads enverrait uniquement des champs `undefined`, sans effet.
Aucune action de code nécessaire ; fiche conservée pour la trace historique de la disparition du
scénario.

## Risque de régression / à surveiller

Si une future fonctionnalité réintroduit un moyen d'attacher une taxonomie à un `weezEvent` avant
bulk-create (nouvel enrichissement, mapping automatique...), revérifier que `bulkCreateEvents` la
reporte bien vers l'`Event` créé.

## Références

- `docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #3
