# BUG-195 — Analyse : donut « Par zone » affiché VIDE tant que le contexte PdV différé n'est pas chargé

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (aucune donnée fausse — mais l'écran affiche un donut blanc que
  l'utilisateur lit comme « il n'y a pas de zones », alors que la dimension est encore en route)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (retour utilisateur : « sur la page analyse, le graphe zone est vide par défaut »)
- **Fichiers** : `src/components/analyse/charts/ShopDistributionPieChart.vue:138` (`byArea`),
  `src/components/analyse/charts/DonutChartCard.vue` (aucun état loading/vide),
  `src/store/modules/analyse.js` (`configShopContext`, `configContextLoading`),
  `src/components/analyse/AnalyseView.vue:914-943` (`requestDeferredAllConfigsContext`)

## Symptôme

Au premier affichage de `/spaces/:spaceId` (mode Analyse **comme** mode Predict — même écran), la
3e carte de la rangée « Répartition des PdV » — **« Par zone »** — est vide : donut blanc, aucune
légende, sous-titre « 0 zones ». Les deux autres donuts (« Répartition des PdV », « Par type »)
sont peuplés normalement. Quelques secondes plus tard, les zones apparaissent — sans que rien
n'ait signalé l'attente.

## Cause racine

Deux faits qui se combinent :

1. `shopArea` **n'existe pas** sur un record de vente brut. Il est posé par la réconciliation, à
   partir des `FloorElements` du contexte configuration :

   ```js
   // src/utils/analyseReconciliation.js:395-398
   const shopArea = element
     ? textOf(element.floorName) || textOf(element.area) || textOf(record.shopArea)
     : textOf(record.shopArea)
   ```

2. Sur le **landing par défaut**, `selectedConfigurationId` vaut `null` (« All Configurations » —
   cf. `resolveConfigSelectionAfterLoad`, `analyse.js:355-358`). `useSpaceDataFetch` ne dispatche
   alors **aucun** contexte (`if (preserved) dispatch('loadConfigShopContext', preserved)`,
   `analyse.js:1830`) : l'union toutes-configs est **volontairement différée** par `AnalyseView`
   après le premier rendu (décision perf « différer seulement », `AnalyseView.vue:914-943`), avec
   repli `setTimeout` 3 s.

Pendant toute cette fenêtre, `configShopContext.floorElements` est `[]` → tous les records ont
`shopArea` vide → `groupBy` les jette (`if (!k) continue`) → `byArea` est vide. Contrairement à
`byType`, qui a une sentinelle de repli (`UNATTACHED_SHOP_KEY`), la zone n'en a pas : c'est la
**seule** des 3 dimensions qui peut légitimement se retrouver à zéro.

`DonutChartCard` n'avait ni état loading ni état vide : il rendait le `Doughnut` avec un dataset
vide, d'où le disque blanc.

Point clé : `configContextLoading` **ne suffit pas** à piloter un skeleton — il reste `false`
pendant tout le différé (avant le dispatch), c'est-à-dire précisément la fenêtre du bug.

## Correction

Appliquée le 2026-07-20 sur `feat/postEventInventory`.

1. **Store** — nouveau flag `configContextSettled` (`analyse.js`), `false` au départ, passé à
   `true` sur **chaque** chemin terminal de `loadConfigShopContext` / `loadAllConfigsShopContext`
   (succès, vide, erreur, retour anticipé), toujours sous la garde anti-race `!stale()`. Il
   distingue « pas encore tenté » de « chargé, réellement vide » — ce que ni
   `configContextLoading` ni `floorElements.length` ne savent faire seuls.

2. **`DonutChartCard.vue`** — prop `loading` (défaut `false`, les 2 autres usages sont inchangés) :
   skeleton anneau + 3 lignes de légende (même shimmer que `SpacePredictView`), et **état vide
   explicite** (`anDonutEmpty`) quand `labels` est vide hors chargement, au lieu d'un donut blanc.

3. **`ShopDistributionPieChart.vue`** — `areaPending` branché sur le seul donut zone :

   ```js
   const areaPending = computed(() => {
     const st = store.state.analyse
     if (byArea.value.labels.length || !props.records.length) return false
     if (st.configContextError) return false
     return st.configContextLoading || !st.configContextSettled
   })
   ```

   Le skeleton ne remplace **qu'un donut vide** : jamais de flash par-dessus des zones déjà
   affichées lors d'un changement de configuration.

Clés i18n ajoutées (FR + EN) : `anDonutLoading`, `anDonutEmpty`.

## Risque de régression / à surveiller

- **Skeleton bloqué** : `configContextSettled` n'est jamais remis à `false` — délibéré. Le latch
  `allConfigsCtxRequested` de `AnalyseView` est réinitialisé à chaque cycle `loading` true→false
  (`AnalyseView.vue:959-967`), donc un chargement à froid repasse toujours par un loader qui pose
  le flag ; le remettre à `false` au changement d'espace risquait au contraire un skeleton
  permanent si le différé était court-circuité par le latch.
- Contrepartie assumée : au **changement d'espace** dans la même session, la fenêtre différée
  affiche l'état vide plutôt que le skeleton (le flag reste `true`). Cosmétique.
- Espace sans `FloorElements` portant `floorName`/`area` : zone légitimement vide → désormais
  message `anDonutEmpty` au lieu d'un disque blanc.
- Le skeleton peut durer jusqu'à ~3 s + fetch (repli `setTimeout` du différé). C'est la durée
  réelle de l'attente, pas une régression.
- Pas de test unitaire : logique de présentation dans un composant. `analyseStore.spec.js` et
  `analyseFiltersState.spec.js` passent (41 tests).
- **Non reproduit en navigateur** dans cette session (pas de `pnpm dev`) — à valider manuellement.

## Références

- [`../modules/00_INDEX.md`](../modules/00_INDEX.md) — domaine Analyse & agrégation.
- `src/utils/analyseReconciliation.js` — origine de `shopArea`.

---

Rédaction : **JLH**, 2026-07-20.
