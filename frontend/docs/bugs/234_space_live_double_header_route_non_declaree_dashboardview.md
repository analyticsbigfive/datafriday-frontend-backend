# BUG-234 — Route `space-live` : double header (route non déclarée dans les listes self-headed / rail-push de DashboardView)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (UI — bandeau superflu, comportement rail incohérent)
- **Domaine** : Live events (module Live) / Shell app (DashboardView)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-23 · **Corrigé le** : 2026-07-23 (emmanuel)
- **Fichiers** : `views/DashboardView.vue`

## Symptôme

Sur la route Live (`/spaces/:id/live`), **deux headers empilés** : l'app-bar globale de
`DashboardView` (flèche de repli + cloche/réglages) **au-dessus** du `WorkspaceAppHeader` de l'écran
(St Etienne + KPI + profil). Le header du haut est superflu — il ne doit pas s'afficher sur cet
écran, exactement comme sur `/spaces/:id` (Analyse).

## Cause racine

La route `space-live` a été ajoutée (module Live, greffe C) **sans être déclarée** dans les deux
listes de `DashboardView.vue` qui pilotent le chrome de l'app par route :

- `isSelfHeadedRouteName(name)` — routes qui rendent leur **propre** header (`WorkspaceAppHeader`) et
  pour lesquelles l'app-bar globale (`<v-app-bar v-if="!isSelfHeadedRoute">`) doit être **masquée**.
- `isRailPushRouteName(name)` — routes où le rail de navigation gauche reste en mode « push » (aligné
  sur le comportement d'Analyse).

`space-live` rend `AnalyseView` (donc `WorkspaceAppHeader`), exactement comme `space-analyse` — il
devait figurer dans ces listes dès l'ajout de la route.

## Correction

Ajout de `'space-live'` aux deux listes (juste après `'space-analyse'`, même famille Analyse) :

- `isSelfHeadedRouteName` → l'app-bar globale du haut est masquée sur `/live` → un seul header.
- `isRailPushRouteName` → le rail gauche se comporte comme sur Analyse.

## Risque de régression / à surveiller

- **Non testé en build** (règle de session : build côté dev).
- **Rappel d'insertion (module Live)** : toute nouvelle route d'écran « auto-headée » doit être
  ajoutée à ces deux listes de `DashboardView` — point non mentionné dans `11_LIVE.md` §8bis/§10.3
  (qui ne citait que `router/index.js` et `SPACE_SCREENS` de `guards.js`).

## Non concerné — état de déploiement, pas un bug

Le `404 Cannot GET /api/v1/spaces/:id/live/inventory` (et `/live-status`) observé en même temps
**n'est pas un défaut de code** : les routes existent côté backend (`spaces.controller.ts`, cf.
`backend/docs/api/LIVE_API_GUIDE.md`) mais le **serveur qui répond n'exécute pas encore ce code**
(build/déploiement à faire). Suivi comme **prérequis** dans `11_LIVE.md`, pas comme bug.

## Références

- [`docs/modules/11_LIVE.md`](../modules/11_LIVE.md) — module Live (greffe C = route `space-live`).
- `backend/docs/api/LIVE_API_GUIDE.md` — contrats backend Live.
