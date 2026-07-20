# BUG-221 — Trois pans de code mort issus d'un refactor incomplet de l'étape 4 (onglet Weezevent, timeline détaillée, traitement en masse)

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur (surface morte importante + le code mort gère mieux les statuts que le
  code vivant, voir BUG-215/216)
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue` (voir détail
  ci-dessous)

## Symptôme

Le module doc (`05_INTEGRATIONS_VENTES.md`) décrit l'étape 4 comme ayant 3 onglets, dont
"Événements Weezevent" avec sync des spectateurs. Le template actuel n'a en réalité que 2 onglets
vivants (`covered`/`uncovered`, fusionnés dans une vue `all`) — toute la logique du 3ème onglet
existe encore dans le script mais est **totalement inatteignable** depuis le template :

1. **Onglet "Événements Weezevent" mort** : `filteredWeezEvents` (branche sur `activeTab ===
   'registered'|'unregistered'`, valeurs que `activeTab` ne prend jamais — les clics du template
   posent `'covered'|'uncovered'|'all'`), `mappedCount`, `syncAttendees`, `syncAllAttendees`,
   `handleCreateEventFromWeez`, `openEnrichDialog` — aucun point d'appel dans le template.
   `EnrichEventDialog` est monté mais son seul déclencheur (`openEnrichDialog`) n'est jamais
   invoqué, donc il ne peut jamais s'ouvrir. `saveWeezEventMapping` n'est atteignable que via
   `handleCreateEventFromWeez`, lui-même mort — donc également inatteignable en pratique.
2. **Table de timeline minute par minute morte** (`toggleTimeline`, `loadEventTimeline`,
   `timelineShops`, `timelineArticles`, `filteredTimeline`, `timelineSummary`,
   `exportTimelineCsv`) : aucune de ces fonctions/computed n'apparaît dans le template. Fonctionnalité
   distincte de celle réellement câblée (`EventBreakdownDrawer`, via `getEventMinuteChart`), utilise
   une API différente (`getSpaceEventTimeline`) avec filtrage/export CSV côté client — probablement
   remplacée par `EventBreakdownDrawer` sans nettoyage.
3. **Traitement en masse mort** (`handleProcessAll`, `cancelProcessing`, et le composable
   `useTimelineProcessing.js::processAllEvents`, découpé par lots de 50) : aucun élément du
   template n'appelle `handleProcessAll`/`cancelProcessing` (seul `handleProcessSingle`, câblé au
   bouton "Traiter" par ligne, est atteignable). **Ironie notable** : le composable
   `processAllEvents` distingue correctement `completed` de `failed` (`r.status === 'success' ?
   'completed' : 'failed'`) — exactement ce qui manque au chemin vivant (voir BUG-215/216). Le
   meilleur code de gestion de statut de tout le fichier est donc mort.

## Cause racine

Non déterminé précisément (pas d'historique disponible), mais cohérent avec une migration
incomplète depuis une UI à 3 onglets avec traitement en masse vers l'UI actuelle en 2 onglets avec
bannière "Créer et lier tout" — l'ancien code n'a jamais été supprimé.

## Correction

Décision retenue : (b), suppression complète (voir résolution demandée dans le ticket parent —
passe de correction de bugs, pas de reprise de fonctionnalité). BUG-215/216 ont été résolus
séparément en corrigeant le chemin vivant (`handleProcessSingle`) directement, pas en réintégrant
le code mort.

Chaque suppression a été vérifiée par grep avant retrait, pour confirmer l'absence de tout point
d'appel restant dans le template et l'absence de dépendance depuis le chemin vivant
(`handleProcessSingle`/`loadTimeline`/`bulkCreateEvents`).

**Supprimé dans `StepProcessTimeline.vue` :**
- (a) Onglet "Événements Weezevent" mort : computed `filteredWeezEvents`, `mappedCount` ; méthodes
  `syncAttendees`, `syncAllAttendees`, `handleCreateEventFromWeez`, `openEnrichDialog`,
  `saveEnrichment`, `saveWeezEventMapping` ; data `enrichDialog`, `enrichingEvent`, `enrichSaving`,
  `syncingAttendees`, `attendeesSynced`, `syncingAllAttendees`, `weezEventMappingLoading` (orphelin
  après suppression de `saveWeezEventMapping`, son seul consommateur) ; le mount template
  `<EnrichEventDialog v-model="enrichDialog" ... />` et son import/enregistrement (le fichier
  `EnrichEventDialog.vue` n'a pas été supprimé, conformément à la consigne). `handleEventCreated`
  simplifiée : le paramètre `pendingWeezEventLink` et l'appel à `saveWeezEventMapping` retirés
  (plus aucune source vivante ne renseigne `pendingWeezEventLink` à une valeur non nulle depuis la
  suppression de `handleCreateEventFromWeez`).
- (b) Table de timeline minute par minute morte : méthodes `toggleTimeline`, `loadEventTimeline`,
  `timelineShops`, `timelineArticles`, `filteredTimeline`, `timelineSummary`, `exportTimelineCsv` ;
  data `expandedTimelines`, `timelineData`, `timelineLoading`, `timelineFilterShop`,
  `timelineFilterArticle` ; import `getSpaceEventTimeline` (uniquement utilisé par
  `loadEventTimeline`, retiré de l'import `@/api/endpoints/space.api`). `EventBreakdownDrawer` et
  `handleBreakdownChartTabClick` (onglet graphique) conservés intacts, `minuteChartData`/
  `minuteChartLoading` conservés (toujours utilisés par ce chemin vivant).
- (c) Traitement en masse mort : méthodes `handleProcessAll`, `cancelProcessing` (composant).
  Computed `progressPercent` retiré aussi (grep confirmé : aucun point d'appel template, dépendait
  exclusivement de `getProgressPercent()`/du composable, lui-même exclusif au chemin mort — voir
  ci-dessous).

**Supprimé dans `useTimelineProcessing.js`** (après grep confirmant l'absence de tout usage par le
chemin vivant `processSingleEvent`/`loadTimeline`) :
- fonction `processAllEvents` (chunking par 50) et son export ;
- fonction `getProgressPercent` et son export (exclusive à `processAllEvents`/au `progressPercent`
  mort du composant) ;
- refs internes `processedCount`, `totalCount` (écrites uniquement par `processAllEvents`, lues
  uniquement par `getProgressPercent`) ;
- ref `cancelled` et fonction `cancelProcessing` (le seul appelant vivant était le
  `cancelProcessing` du composant, lui-même mort ; `cancelled` n'était lu que dans
  `processAllEvents`).

**Conservé** (vérifié vivant) : `processSingleEvent`, `loadTimeline`, `summary`, `loading`,
`processing`, `error`, `hasMappings`, `events`, `unregisteredDates`, `weezeventEvents`,
`transactionStats` dans le composable ; `unmappedCount`, `patchableEventsCount`,
`bulkCreateEvents`, `saveWeezEventMapping`-successeur direct `loadWeezeventEvents` (BUG-214),
`syncWeezeventEventAttendees` (toujours appelé directement, de façon non bloquante, dans
`handleProcessSingle`) dans le composant.

## Risque de régression / à surveiller (mise à jour)

`docs/modules/05_INTEGRATIONS_VENTES.md` décrit toujours l'étape 4 avec 3 onglets — à corriger
séparément (hors scope de ce fix de bug, signalé mais pas traité ici).

## Risque de régression / à surveiller

Si l'option (a) est choisie, vérifier que `processAllEvents` n'a pas d'autres divergences avec le
chemin actuel (chunking par 50, `useSynchronization.js`) avant de le réactiver.

## Références

- BUG-215, BUG-216 (le chemin vivant a le bug de statut que le code mort n'a pas).
- `docs/modules/05_INTEGRATIONS_VENTES.md` (description à 3 onglets, à corriger — voir aussi la
  section dette technique de cet audit).
