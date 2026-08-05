# BUG-305-02 — Live : bandeau rouge affiche des éléments inactifs/trompeurs

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Live events / Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur, suite de BUG-304-02)
- **Fichiers** : `src/components/analyse/AnalyseView.vue`, `src/components/analyse/filters/FilterSummary.vue`, `src/store/modules/analyse.js` (`activeFilterChips`)

## Symptôme

Quatre éléments du bandeau rouge (haut de page) restaient actifs ou visibles sans justification en
mode Live :
1. Ligne 2 du bandeau (select de période + « Comparer à »).
2. Chip "N événement(s) sélectionné(s)" avec croix de fermeture.
3. Chip "Période : Aujourd'hui" visible sans aucune UI pour l'expliquer ou le changer.
4. Bouton "Rapport J+1" activable sur un event encore en cours (pas terminé).

## Cause racine

1. Même trappe que BUG-304-02 : le select de période reste cliquable, `applyLiveScope()` l'écrase à
   chaque tick. « Comparer à » s'auto-masque déjà quand `timeRange==='all'`
   (`FilterSummary.vue:22`), mais seulement **après** détection de l'event live.
2. Chip toujours "1" (l'event live forcé), redondant avec le badge ● LIVE déjà affiché dans le
   titre ; la croix ne fait rien de durable (re-forcé au tick suivant).
3. Avant détection de l'event live, `applyLiveScope()` bascule sciemment `timeRange` sur `'today'`
   (≠ défaut `'all'`, cf. `DEFAULT_FILTERS()`) le temps que `/live-status` réponde — ce chip
   (`activeFilterChips`, `analyse.js:1386-1404`) apparaissait pendant cette fenêtre sans qu'aucune
   UI de la route Live ne permette de l'expliquer (Dates déjà masqué indépendamment de l'état de
   détection, cf. BUG-304-02).
4. `reportEvent` (`AnalyseView.vue:1361-1369`) ne vérifie que `date <= now`, pas que l'event soit
   **terminé** — un event daté d'aujourd'hui passe ce test dès sa 1re minute.

## Correction

Les 4 masqués/désactivés avec `v-if="... && !isLive"` (ou équivalent) dans `AnalyseView.vue` ; le
chip Période masqué via `!state.isLiveRoute` dans `activeFilterChips` (même flag que BUG-304-02).
Les chips légitimes (shops/zones/type PdV/menu items) ne sont pas affectés.

## Risque de régression / à surveiller

~~Le badge ● LIVE lui-même reste purement basé sur la route...~~ **Corrigé le jour même** (même
session) : l'utilisateur a effectivement rencontré le cas (badge LIVE + titre "Analyse" alors
qu'aucun event n'était dans la fenêtre de 30 min) — nouveau `liveEventDetected` (ref posée par
`applyLiveScope()` depuis la vraie réponse `/live-status`), badge conditionné dessus au lieu de la
seule route. Voir `docs/modules/11_LIVE.md` §18. Tests : 3 nouveaux dans `analyseStore.spec.js`
(pour le reste de cette fiche).

## Références

- `docs/modules/11_LIVE.md` §17.
- BUG-304-02 (même famille de trappes, panneau de filtres gauche).
