# BUG-304-02 — Live : panneau de filtres (gauche) trompeur et compteurs non scopés à l'event live

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Live events / Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur : chiffres "pas corrects" sur Types de PDV/Zones, Affluence "qui ne fait rien")
- **Fichiers** : `src/components/analyse/filters/FilterPanel.vue`, `src/store/modules/analyse.js` (`optionsBaseRecords`, `attendanceBounds`, `analysableEvents`, `filteredEvents`)

## Symptôme

Trois défauts distincts dans le panneau de filtres gauche en mode Live :
1. Configuration / Événements / Dates éditables en apparence, sans effet durable.
2. Filtres avancés (catégorie/type d'event, équipes, sponsor...) pouvaient vider tout l'écran
   silencieusement sans se réinitialiser.
3. Types de PDV / Zones / Points de vente affichaient des compteurs agrégés sur **tout
   l'historique analysable de l'espace** au lieu du seul event live (un shop ayant vendu sur toute
   la saison affichait son total saison, pas ses ventes de l'event en cours) ; Affluence affichait
   des bornes (0-55 000) calculées sur tout l'historique, sans aucun rapport avec l'event live.

## Cause racine

- (1)/(2) : `applyLiveScope()` (`AnalyseView.vue`) écrase `selectedConfigurationId`/`selectedEventIds`/
  `timeRange` à chaque tick (15s), mais `FilterPanel.vue` n'avait aucune logique conditionnelle sur
  le mode Live — panneau strictement identique à l'Analyse classique. Les Filtres avancés
  s'appliquent au niveau EVENT (`filteredEvents`, `analyse.js:829-846`) alors qu'un seul event est
  jamais en scope en Live, et rien ne les réinitialise automatiquement.
- (3) : `optionsBaseRecords` (`analyse.js:1028-1033`) est scopé à `analysableEvents` (tout
  l'historique analysable), **pas** à `filteredEvents` (le seul event live) — design intentionnel
  pour l'Analyse classique (« les options doivent rester larges pour pouvoir élargir la sélection »)
  mais qui n'a pas de sens en Live où il n'y a jamais qu'un seul event. `attendanceBounds`
  (`analyse.js:1298-1317`) calcule ses bornes sur `state.events` **sans aucun scope**, même pas
  `analysableEvents`.

## Correction

- Masqué en Live (`FilterPanel.vue`, prop `isLive`) : Configuration, Événements, Dates, Filtres
  avancés, Affluence (un curseur de plage n'a de toute façon pas de sens sur un seul event).
- Nouveau `state.isLiveRoute` (`analyse.js`), posé par `watch(isLive, ...)` dans `AnalyseView.vue`
  (suit `route.name` en continu, y compris sous `keepAlive`). `optionsBaseRecords` bascule sa base
  de `analysableEvents` vers `filteredEvents` quand `isLiveRoute` est vrai — comportement
  Analyse/Predict/EventPredict inchangé.
- Articles du menu / Type & Catégorie vérifiés déjà corrects (sourcés de
  `useAnalyseItemRecords(filteredEvents)`, donc déjà scopés au seul event live).

## Risque de régression / à surveiller

Vérifier qu'un nouveau filtre ajouté au panneau Live choisisse consciemment son scope
(`analysableEvents` large vs `filteredEvents`/event live) plutôt que de copier `optionsBaseRecords`
sans réfléchir au contexte Live. Tests : 2 nouveaux dans `analyseStore.spec.js` (scope Live vs
scope Analyse inchangé).

## Références

- `docs/modules/11_LIVE.md` §16.
- BUG-305-02 (suite : mêmes trappes dans le bandeau rouge).
