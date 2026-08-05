# BUG-306-02 — Live : badge ● LIVE basé sur la route, pas sur la détection réelle d'un event

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Live events
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur : badge "● LIVE" visible alors qu'aucun event n'est en cours, ET titre affichant "Analyse" en même temps — combinaison contradictoire)
- **Fichiers** : `src/components/analyse/AnalyseView.vue`

## Symptôme

Le bandeau affichait "Auxerre : Analyse [● LIVE]" — le badge laisse croire qu'un event est
actuellement en direct, alors que le titre générique "Analyse" (pas de nom d'event) indique
justement qu'aucun event n'est sélectionné. Signalé par l'utilisateur comme "très mal vu".

## Cause racine

`isLive` (`AnalyseView.vue`) = `computed(() => route.name === 'space-live')` — purement basé sur la
route. Le badge (`v-if="isLive"`) s'affichait donc dès qu'on est sur `/spaces/:id/live`, **indépendamment**
du fait qu'un event soit réellement dans la fenêtre glissante de 30 min (`getLiveStatus`,
`spaces.service.ts`). Si le dernier event live (ex. un run QA) date de plus de 30 min, `/live-status`
renvoie `isLive:false` — `applyLiveScope()` vide alors `selectedEventIds`, d'où le titre "Analyse" —
mais rien ne redescendait cette information vers le badge, resté vrai tant qu'on ne change pas de
route.

## Correction

Nouveau `liveEventDetected` (ref), posé par `applyLiveScope()` depuis la vraie réponse de
`getSpaceLiveStatus()` (`res?.isLive && res?.eventId`), réinitialisé à `false` en quittant la route
Live (`resetLiveFiltersIfNeeded`). Badge conditionné sur `liveEventDetected` au lieu de `isLive`
(route). Le nouveau bouton "voir/modifier l'event live" (feature du même jour, cf.
`docs/modules/11_LIVE.md` §18) partage la même garde — il ne s'affiche que si un event est
réellement détecté, pas juste parce qu'on est sur la route.

## Risque de régression / à surveiller

`isLive` (route) reste utilisée ailleurs pour des besoins purement route-based (masquage du panneau
de filtres, cf. BUG-304-02/305-02) — volontairement inchangée, ne pas la confondre avec
`liveEventDetected` (détection réelle). Pas de test dédié ajouté (ref simple posée par une fonction
déjà couverte manuellement) — à ajouter si ce signal se complexifie.

## Références

- `docs/modules/11_LIVE.md` §18.
- BUG-305-02 (point laissé ouvert, fermé par cette fiche).
