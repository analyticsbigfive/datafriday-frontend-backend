# BUG-301-02 — Live : le poll 15s relançait tout le bootstrap catalogue de l'espace

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Live events / Analyse & agrégation (Performance)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-04 (audit proactif, pas un symptôme rapporté)
- **Fichiers** : `src/components/analyse/AnalyseView.vue` (`liveShopDetailsPoll`), `src/store/modules/analyse.js` (`loadSpace`/`useSpaceDataFetch`), `src/composables/useSpaceData.js` (`fetchSpaceData`)

## Symptôme

Aucun symptôme visible côté utilisateur — trouvé par audit du code du module Live. Chaque tick de
15s (`liveShopDetailsPoll()`) dispatchait `analyse/loadSpace`, qui relance `fetchSpaceData` : menu
items, ingrédients, packaging, produits/mappings Weezevent, pagination `/menu-components` +
fan-out détail par composant — le bootstrap catalogue complet, pas juste les ventes. Un onglet Live
laissé ouvert 10 min déclenchait ~40 exécutions complètes de ce fan-out pour ne réellement changer
que le CA par shop, charge DB multipliée par le nombre d'onglets/utilisateurs restant sur
`/spaces/:id/live` pendant un event.

## Cause racine

`liveShopDetailsPoll()` (`AnalyseView.vue`) appelait `store.dispatch('analyse/loadSpace', { spaceId,
isLive })`. Le cache 15 min (`CACHE_TTL`, `analyse.js::loadSpace`) ne bloque jamais ce dispatch : il
décide seulement si l'appel est *attendu* (chargement initial) ou lancé *fire-and-forget* en fond
(revalidation), pas s'il a lieu — donc même avec un cache frais, le bootstrap complet repart à
chaque tick.

## Correction

Nouveau chemin dédié : `fetchLiveShopSnapshot()` (`useSpaceData.js`) — 2 requêtes seulement
(`getSpaceShopGranular` + `getSpaceShopDetails`), catalogues (menu items, taxonomie, produits
Weezevent) injectés depuis le store déjà chargé plutôt que refetchés. Nouvelle action
`analyse/refreshLiveShopSnapshot` (commit limité à `SET_SHOP_GRANULAR`/`SET_MENU_ITEM_COST_MAP`/
`SET_SUMMARY`), jeton de requête anti-course. `liveShopDetailsPoll()` dispatche ce nouveau chemin au
lieu de `loadSpace`. `loadSpace`/`useSpaceDataFetch` inchangées pour tous leurs autres appelants
(chargement initial, Restock, Inventory, Logistic, EventPredict).

## Risque de régression / à surveiller

A révélé un second bug (BUG-302-02) : le périmètre réduit ne rafraîchissait plus `state.events`,
cassant l'affichage d'un event créé après le 1er chargement de la page. Corrigé dans la même
journée — voir BUG-302-02, ne pas re-retirer le fetch `getEvents` de `fetchLiveShopSnapshot` sans
recréer ce trou.

## Références

- `docs/modules/11_LIVE.md` §14.
- Tests : `useSpaceDataWaves.spec.js`, `analyseStore.spec.js`.
