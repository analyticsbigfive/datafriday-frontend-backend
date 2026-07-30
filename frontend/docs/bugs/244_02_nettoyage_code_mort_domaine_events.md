# BUG-244-02 — Nettoyage de code mort confirmé du domaine Événements (fichiers, exports API, clés i18n)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements / Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28 (audit ciblé du domaine Événements, confirmé par grep exhaustif
  avant suppression)
- **Fichiers** : voir liste ci-dessous

## Symptôme

Plusieurs fichiers/exports/clés i18n liés au domaine Événements étaient déjà connus comme morts
dans la documentation existante (`docs/modules/02_ANALYSE.md`, `docs/modules/07_EVENEMENTS.md`,
BUG-133, BUG-152, BUG-221) mais jamais effectivement supprimés :

1. `components/EventRevenueByShopChart.vue`, `components/EventTimelineChart.vue` — doublons
   top-level (Options API, imports `../ui/*`, prototype React porté) de
   `components/analyse/charts/{EventRevenueByShopChart,EventTimelineChart}.vue` (les versions
   réellement importées par `AnalyseView.vue`/`EventPredictView.vue`). Diagnostiqués morts dans
   `docs/modules/02_ANALYSE.md` ("Code mort confirmé"), jamais supprimés.
2. `components/{Attendees,AvgTransaction,Cost,PerCap,Transactions,TransformationRate}ByEventChart.vue`
   (6 fichiers, même origine prototype React, props `eventPerformanceData`/`onClose`) — remplacés
   fonctionnellement par `components/analyse/charts/GenericByEventChart.vue`, paramétré par
   `initialMetric`. Zéro importeur pour chacun des 6.
3. `components/EventTypesPanel.vue`, `components/EventTypesView.vue`,
   `components/EventsImportWizard.vue` — reliquats de l'arbre mort raciné à `appCopy.vue` (déjà
   documenté dans `docs/modules/07_EVENEMENTS.md`) : BUG-152 avait supprimé 8 fichiers de cet arbre
   mais pas ces 3-là (`EventTypesPanel`→`EventTypesView`, tous deux morts, utilisant en plus la
   "dead zone" `src/ui/` et l'ancien client `utils/eventApi.js` ; `EventsImportWizard`, doublon
   fonctionnel obsolète de `components/events/drawers/CsvImportDrawer.vue`).
4. `utils/eventTypeDiagnostics.js` — mort par transitivité (seul consommateur `EventTypesView.vue`,
   lui-même supprimé au point 3).
5. `api/endpoints/event.api.js` : `getEvent(id)`, et les sections "EVENT REVENUE"/"SPONSORS"
   (`calculateEventRevenue`, `getEventRevenueSummary`, `calculateUnregisteredEventRevenue`,
   `saveEventRevenueCalculation`, `getEventRevenueCalculation`, `getEventSponsors`) — jamais
   importées ailleurs dans `src/`. Les 5 premières sont déjà documentées comme mortes dans
   `docs/modules/07_EVENEMENTS.md` et référencées par BUG-133 (bouton UI "Calculer le revenu" déjà
   retiré) ; elles restent aussi dupliquées dans le monolithe legacy `utils/api.js:858-918`
   (elles-mêmes orphelines, hors scope de ce fix — `utils/api.js` n'est touché que par Restock).
6. 14 clés i18n `intgEnrichEvt*` (×2 locales, `translations.js`) — résidu de la suppression
   d'`EnrichEventDialog.vue` par BUG-221 (le composant a été retiré mais pas ses clés de
   traduction).

## Cause racine

Plusieurs vagues de nettoyage successives (BUG-133, BUG-152, BUG-221) ciblées sur un symptôme
précis à chaque fois, sans repasse exhaustive sur l'ensemble des fichiers "Event*" du dépôt —
laissant des reliquats hors du périmètre exact de chaque fix.

## Correction

Suppression pure des 12 fichiers listés aux points 1-4, des exports morts listés au point 5 (dans
`event.api.js` uniquement — `utils/api.js` non touché), et des clés i18n du point 6. Chaque
suppression a été reconfirmée par un grep frais immédiatement avant retrait (zéro importeur
restant), pas seulement sur la base de l'audit initial.

## Risque de régression / à surveiller

- `node --check` propre sur `event.api.js` et `translations.js` après édition.
- Suite `pnpm test:unit` ciblée (`events.unit.spec.js`, `events.integration.spec.js`) : 94/94
  verts après ce nettoyage.
- Non buildé (`pnpm build`) dans cette session — à vérifier par vous que rien d'autre n'importait
  ces fichiers via un chemin non couvert par les tests unitaires (ex. import dynamique).

## Références

- `docs/modules/02_ANALYSE.md` ("Code mort confirmé")
- `docs/modules/07_EVENEMENTS.md` ("Code mort de ce domaine")
- [[152_appcopy_arbre_orphelin_duplique_domaine_evenements]]
- [[133_eventslist_bouton_calculer_revenu_mort]]
- [[221_stepprocesstimeline_pans_code_morts_refactor_incomplet]]
