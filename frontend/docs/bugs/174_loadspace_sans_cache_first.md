# BUG-174 — `/analyse` : chaque re-mount re-payait la phase 1 complète (pas de cache-first)

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟡 Mineur/perf (rendu initial — objectif 300ms)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/analyse.js` (`loadSpace`, state `spaceCachedAt`)

## Symptôme

Revenir sur `/analyse` (navigation interne, re-mount) re-déclenchait systématiquement les 4 requêtes de phase 1 (`space`, `configurations`, `shop-details`, `events`) en **bloquant** l'affichage (loading + skeletons), même si le store contenait déjà les données du même espace chargées quelques secondes plus tôt. La convention projet (28/34 stores : `cachedAt` + `isCacheValid` 15 min, cf. `CLAUDE.md:79-80`) n'était pas appliquée au module analyse.

## Cause racine

`loadSpace` inconditionnel : aucun horodatage de fraîcheur dans le state.

## Correction

2026-07-18 : **stale-while-revalidate** — `loadSpace` accepte `spaceId` ou `{spaceId, force}` ; si le même espace est en store et la phase 1 date de < 15 min : rendu immédiat depuis le store (ni loading ni skeleton) + revalidation silencieuse en arrière-plan (les données fraîches remplacent réactivement). Nouveau state `spaceCachedAt` + mutation, horodaté en fin de phase 1. Compose avec le cache Redis 60s de shop-details côté backend (fiche back 92).

## Risque de régression / à surveiller

La revalidation en arrière-plan préserve la fraîcheur (pas de fenêtre de staleness au-delà d'un aller-retour réseau). `force: true` disponible pour les appelants qui exigent un rechargement bloquant. Vérifier en staging : re-mount de la vue = contenu instantané, marqueurs `[perf] phase1` absents du chemin bloquant.

## Références

- `CLAUDE.md` (convention TTL 15 min), fiche back 92
