# BUG-179 — Getters analyse : ré-itération des tableaux complets à chaque changement de filtre

- **Statut** : ⚪ Diagnostiqué (fix ciblé à planifier, instrumentation en place). **Maj
  2026-08-03** : la vague de quick wins BUG-284 en réduit la douleur sans faire les index —
  clics segments coalescés 150 ms (une seule vague de recalculs par accalmie), cache item-level
  gelé/`shallowRef` (plus de Proxy dans les passes), contexte de réconciliation singleton
  (mémos 1× au lieu de 3×), animations Chart.js 200 ms. Le chantier index `Map` par
  eventId/menuItemId/shopId décrit ci-dessous reste entier ; à déclencher si le freeze persiste
  sur les machines cibles. Références de lignes ci-dessous partiellement périmées :
  `itemLevelRecords` vit désormais vers `AnalyseView.vue:619-623` (plus :545-597).
- **Sévérité** : 🟡 Mineur/perf (réactivité des filtres sur gros volumes)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/analyse.js:789-1148` (`reconciledShopGranularData`, `filteredShopGranularData`, famille `options*`/`unique*`), `src/components/analyse/AnalyseView.vue:545-597` (`itemLevelRecords`)

## Symptôme

Chaque changement de filtre re-parcourt l'intégralité des records granular : `filteredShopGranularData` applique ~8 prédicats + `normalizeStr` par record ; une dizaine de getters d'options (`salesShopNames/Types/Areas`, `unique*` ×11) refont chacun leur `map`/`filter`/`Set` sur les mêmes tableaux. Vuex mémoïse, mais tout touch au state invalide la chaîne entière. Le code s'auto-instrumente déjà (`[perf] reconcile…` > 100ms, `analyse.js:804`).

## Cause racine

Getters écrits par accrétion, sans index partagés (par eventId/menuItemId/shop).

## Correction

Aucune cette session (store de 2273 lignes fortement couplé — un refactor sans test runtime réel dépassait le budget de risque de l'audit ; retombé en ⚪ selon l'ordre de dégradation prévu). Plan de fix ciblé : construire des `Map` d'index (par eventId / menuItemId / shopId) recalculées au changement des **records** seulement, et faire des getters de filtre des lookups ; cibler d'abord les 2-3 getters les plus chers mesurés via les marqueurs `[perf]` existants.

## Risque de régression / à surveiller

Le fix devra prouver la parité sur `filteredShopGranularData` (le getter le plus consommé — nourrit charts + tables + KPIs).

## Références

- Marqueurs `[perf]` : `analyse.js:804, 1934, 2150`
