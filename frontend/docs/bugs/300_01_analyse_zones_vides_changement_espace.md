# BUG-300-01 — Analyse : « Par zone » vide (« Aucune donnée ») après un changement d'espace sans rechargement

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse (donuts de répartition)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-05 (signalement JLH, navigation Aix → Auxerre)
- **Fichiers** : `src/store/modules/analyse.js` (`CLEAR_SPACE_KEYED_CACHES`),
  `src/components/analyse/AnalyseView.vue` (latch `allConfigsCtxRequested`),
  `src/components/analyse/charts/ShopDistributionPieChart.vue` (`areaPending`, non modifié)

## En clair

Le donut « Par zone » sait dans quelle zone se trouve chaque point de vente grâce à un contexte
chargé en arrière-plan après l'ouverture de la page. En passant d'un espace à l'autre sans
recharger, la vue n'est pas reconstruite — et le code croyait ce contexte déjà chargé, parce
qu'il l'avait été… pour l'espace précédent. Les ventes du nouvel espace n'obtenaient donc jamais
leur zone : « 0 zones », et « Aucune donnée » au lieu d'un indicateur de chargement. Le correctif
oublie le contexte de l'ancien espace au moment du changement, ce qui relance le chargement.

## Symptôme

Partir de `/spaces/cms801ihg00x15mw2jylt77rd` (Aix), naviguer vers
`/spaces/cms81a2dc001dkgsmpv7a654z` (Auxerre) via le sélecteur d'espace : donut « Par zone » =
« 0 zones / Aucune donnée pour cette répartition » (`anDonutEmpty`), définitivement. Un
rechargement complet de la page sur Auxerre corrige — c'est la navigation inter-espaces **sans
remontage de la vue** (clé de route = `route.name`, cf. BUG-285) qui casse.

Très probablement la cause racine de la remarque JLH du 2026-08-04 sur « No data for this
breakdown » (`anDonutEmpty` affiché là où un état de chargement était attendu).

## Cause racine

`shopArea` n'existe sur un record de vente **qu'après réconciliation** avec les `floorElements`
du contexte « All Configurations », chargé en DIFFÉRÉ après la phase 2
(`AnalyseView.requestDeferredAllConfigsContext`). Chaîne à trois maillons au changement d'espace :

1. **Garde « déjà chargé » trompée** (le point dur) — `requestDeferredAllConfigsContext` teste
   `configShopContext.configId === null && floorElements.length > 0` : après Aix, ce contexte
   contient les éléments… d'Aix. `configShopContext` n'était jamais purgé au `loadSpace`
   (commentaire explicite `analyse.js` : « loadSpace ne reset que le cache builder2 ») →
   la fonction latchait `allConfigsCtxRequested = true` SANS dispatcher. La réconciliation
   joignant par ids d'éléments, les shops d'Auxerre ne matchaient jamais → aucun `shopArea`.
2. **Latch vue** — `allConfigsCtxRequested` : un reset existait déjà (watcher `loading`,
   « nouveau cycle de chargement ») mais il ne servait à rien tant que la garde 1 relatchait
   aussitôt sans dispatch.
3. **Mauvais état affiché** — `configContextSettled` restait `true` depuis Aix →
   `areaPending` = false → `anDonutEmpty` (« Aucune donnée ») au lieu du squelette.

## Correction

Branche `fix/bug-290-01-eventpredict-config-stockup`, 2026-08-05.

- `analyse.js` — `CLEAR_SPACE_KEYED_CACHES` (commis uniquement au CHANGEMENT d'espace, un seul
  appelant, gardé `prevSpaceId !== spaceId`) purge désormais aussi : `configShopContext` (vierge),
  `configContextSettled=false`, `configContextError=null`, `configContextLoadingId=null`, et
  **bump de `configContextReqId`** — sans ce bump, un `loadAllConfigsShopContext` de l'ancien
  espace encore en vol commiterait ses `floorElements` par-dessus le contexte vierge (les actions
  vérifient `stale()` sur ce jeton).
- `AnalyseView.vue` — reset immédiat de `allConfigsCtxRequested` dans le watcher
  `route.params.spaceId` (à côté des purges BUG-285). Le déclencheur existant (watcher
  `enriching`, fin de phase 2) relance ensuite le différé ; la garde voit un contexte vide et
  dispatche.
- Test : `tests/unit/analyseStore.spec.js` — la mutation purge le contexte et bump le jeton.

## Risque de régression / à surveiller

- **Anti-race** : enchaîner deux espaces rapidement pendant le chargement du premier — les zones
  affichées doivent être celles du dernier espace (c'est le rôle du bump de jeton).
- Aller-retour A → B → A : les zones de A doivent revenir (le contexte se recharge, pas de cache).
- Cas protégé inchangé : édition d'une zone dans le Builder puis retour sur Analyse — le
  non-court-circuit « déjà chargé » du dispatch par config (commentaire `analyse.js`) n'est pas
  touché ; la purge n'intervient qu'au changement d'espace.
- `areaPending` retrouve son comportement voulu (squelette pendant le chargement) sans
  modification : `configContextSettled` repart à false.

## Références

- BUG-285 (purges au changement d'espace sans remontage — même famille, ce bug en est un trou).
- Remarque JLH 2026-08-04 « No data for this breakdown » (`anDonutEmpty`, DonutChartCard).
- `docs/modules/` — module Analyse.

JLH
