# BUG-226 — Chargement Analyse : catalogues globaux fetchés en double + phase 2 monolithique + contexte PdV sans cache

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (perf de chargement — `GET /market-prices` coûte ~60 s à froid et
  partait 2× ; les graphes attendaient une pagination + un fan-out qui ne les concernent pas ;
  le contexte PdV d'une config était rebâti à chaque demande)
- **Domaine** : Analyse & agrégation / Stock
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (demande utilisateur : « plutôt que de charger tout en même
  temps, peut-on faire un chargement par étapes & éviter de charger plusieurs fois shop items et
  market price »)
- **Fichiers** : `src/store/modules/inventory.js` (`loadMarketPrices`, `loadPackagingTypes`),
  `src/composables/useSpaceData.js` (`loadEnrichment`), `src/store/modules/analyse.js`
  (`useSpaceDataFetch`, callback `onEnrichment`, `buildConfigShopEntryCached`, `fetchNestShopMenus`)
- **Plan de référence** : [`../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md`](../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md)
  (lots A, D et B)

## Symptôme

1. Ouvrir Analyse puis Inventory/Réarmement en moins de quelques secondes déclenchait **deux**
   `GET /market-prices` — requête dont le code note lui-même qu'elle coûte ~60 s à froid.
2. Les graphes d'Analyse (skeletons pilotés par `enriching`) attendaient la fin d'un unique
   `Promise.all` de 9 endpoints, dont la pagination `/menu-components` **et** son fan-out de
   détails par composant (concurrence 5) — données qui n'alimentent que Restock / Stock up.

## Cause racine

### Lot A — pas de dédup in-flight sur les catalogues globaux

`isMarketPricesCacheValid` (`inventory.js:58`) ne teste que `marketPricesCachedAt`, jamais « une
requête est déjà partie ». Deux dispatchs concurrents — `AnalyseView.vue:1487` (fire-and-forget)
et `SpaceInventoryView.vue:1457` / `SpaceRestockView.vue:2042` (awaited) — passaient donc tous les
deux la garde avant que le premier n'ait commité. Idem `loadPackagingTypes`.

À noter : le même module avait **déjà** le motif correct pour `loadInventory` (`_loadInFlight`),
et `shopMenuItems.js:9` a une `Map inflight` complète. Les catalogues globaux étaient les seuls à
ne pas l'avoir.

### Lot D — phase 2 monolithique

`useSpaceData.loadEnrichment` faisait un seul `Promise.all` de 9 endpoints, puis `onEnrichment`
une seule fois → `SET_ENRICHING(false)` (donc la levée des skeletons) attendait **le plus lent**.

## Correction

Appliquée le 2026-07-20 sur `feat/postEventInventory`.

### Lot A

Map module-level `_catalogInFlight` (`'marketPrices' | 'packagingTypes' → Promise`), hors du state
Vuex (une Promise dans un state réactif est un anti-pattern — c'est la raison documentée dans
`shopMenuItems.js`). La requête est stockée à son lancement, supprimée dans le `finally` (donc
aussi en cas d'échec : pas de blocage définitif).

5 tests : `tests/unit/inventoryCatalogCoalescing.spec.js` (coalescing, libération après succès,
libération après échec, packaging, clés distinctes).

### Lot D — phase 2 en 2 vagues

| Vague | Contenu | Effet |
|---|---|---|
| **2a** | `/menu-items` + `shop-details?granular=1` + taxonomie + produits/mappings Weezevent | `onEnrichment` appelé ICI → `SET_ENRICHING(false)`, les graphes peignent |
| **2b** | `/ingredients` + `/menu-components` (paginé + fan-out détail) + `/packaging` | 2ᵉ `onEnrichment` avec le **delta recette** uniquement |

`menuItemCostMap` est calculé en 2a (la résolution des refs catalogue ne touche aucun champ de
coût) → la marge n'attend plus non plus.

**Pourquoi 2 vagues et pas 3** (le plan en prévoyait 3) : les catalogues recette ne sont pas
indépendants — ils alimentent `resolveComponentRefs(normalizedMenuItems, {...})`, dont la sortie
**est** le `menuItems` retourné. Un lazy complet changerait la shape de `state.analyse.menuItems`.
La 3ᵉ vague « dimensions » (taxonomie séparée du granular) n'apporterait qu'un aller-retour :
`enrichGranularMenuDimensions` a besoin des deux.

Deux pièges traités dans la foulée :

- **Le fallback d'erreur effaçait la vague 2a.** `catch → onEnrichment({ menuItems: [], … })`
  était inoffensif quand rien n'était encore peint ; avec 2a affiché, un throw en 2b (hors des
  `.catch` par endpoint : `import()` dynamique, `resolveComponentRefs`) blanchissait les menu
  items déjà à l'écran. Le fallback envoie désormais `{}` — lève le skeleton, n'écrase rien.
- **Double réconciliation.** Réémettre le `chartsPayload` complet en 2b recommittait
  `shopGranularData` / taxonomie / Weezevent à l'identique → toute la chaîne
  `reconciledShopGranularData` recalculait une 2ᵉ fois sur un gros espace. 2b n'envoie que
  `menuItems` (refs résolues) + `ingredients` + `components`.

Le callback store (`analyse.js`, `useSpaceDataFetch`) est devenu **présence-aware** : il ne commit
que les clés réellement fournies. Sans ça, le delta de 2b remettait taxonomie et suppliers à `[]`.

4 tests : `tests/unit/useSpaceDataWaves.spec.js` (2 émissions, 2a n'attend pas les recettes, échec
2b non destructif, chemin legacy sans callback complet).

### Lot B — cache de résultat de `buildConfigShopEntry`

La fonction était **pure et sans cache** : chaque appel refaisait `getConfiguration` + le batch
`getConfigShopMenuItemsLight`. L'union « All Configurations » rechargeait donc la config déjà
chargée en mono-config, et un aller-retour A → B → A repayait A.

Cache de **Promise** (`configShopEntryCache`, clé `${spaceId}::${configId}`) → il dédup aussi les
appels concurrents. Pas de TTL : la durée de vie est la session de page, purgée par
`resetConfigShopEntryCache()` appelé en tête de `loadSpace`, juste à côté de
`resetBuilder2SubtypesCache()`. C'est ce point de purge qui rend le cache sûr — revenir du Builder
remonte AnalyseView → `loadSpace` → refetch. (BUG-225 avait refusé une dédup « déjà chargé »
précisément faute d'un tel point.)

**Piège trouvé en écrivant les tests** — et corrigé dans la foulée : `buildConfigShopEntry` avale
**tous ses propres échecs** (chaque fetch a son `.catch`). Un blip réseau sur le batch shop-items
renvoie donc un contexte qui « réussit » avec zéro article. Le mémoriser aurait figé des PdV sans
menu pour toute la session, là où l'ancien code (sans cache) retentait au dispatch suivant.
`fetchNestShopMenus` remonte désormais un flag `batchFailed` → `_batchFailed` sur l'entrée → le
wrapper de cache refuse de mémoriser ces builds-là. Le `.catch` du wrapper reste comme filet pour
une évolution qui laisserait remonter une vraie exception.

6 tests : `tests/unit/analyseConfigShopEntryCache.spec.js` (même config 2×, A→B→A, union
réutilisant le mono-config, appels concurrents, batch en échec non mémorisé puis succès mémorisé,
purge → refetch).

## Risque de régression / à surveiller

- **Invariant croisé affaibli** : `state.analyse.menuItems` se remplit en 2a alors que
  `state.analyse.components` / `.ingredients` restent `[]` jusqu'à 2b. Vérifié par grep :
  `components`/`ingredients` du store analyse **n'ont aucun lecteur** hors leurs mutations
  (Restock / EventPredict passent par leurs propres stores) ; les lecteurs de `menuItems`
  (`MenuItemsByShopTable`, `reconciledShopGranularData`, `regeneratePredictions`) utilisent
  `id`/`name`/`picture`/`spaceIds`/taxonomie, jamais `mi.components`. Fenêtre inerte aujourd'hui —
  **à re-vérifier si un écran Analyse se met à lire les recettes**.
- Entre 2a et 2b, `menuItems` porte des composants aux refs non résolues (noms manquants). Avant,
  il était `[]` sur toute la durée — strictement mieux, mais l'état intermédiaire est nouveau.
- `onEnrichment` est maintenant multi-appels : tout nouveau consommateur de `fetchSpaceData` doit
  être idempotent (documenté en tête de `useSpaceData.js`).
- **Lot B — objets partagés** : `floorElements` et `assignmentItemsByShop` mis en cache sont les
  MÊMES références que celles commitées dans `configShopContext` (le merge de
  `loadAllConfigsShopContext` ne fait que les repousser dans de nouvelles collections, il ne les
  mute pas). Vérifié par lecture : rien ne mute `el.shopType` après le build. Une mutation
  ultérieure d'un `floorElement` depuis le state écrirait dans le cache — à surveiller.
- **Lot B — portée du cache** : purgé à CHAQUE `loadSpace`, y compris ceux re-dispatchés par
  d'autres écrans (overlay Event Predict). Conservateur et volontaire : c'est le même cycle que
  `resetBuilder2SubtypesCache`. Les gains visés (switch de config, union réutilisant le
  mono-config) n'impliquent pas `loadSpace`.
- **Non reproduit en navigateur** (pas de `pnpm dev` dans cette session). À valider :
  une seule ligne `💰 loadMarketPrices — GET /market-prices …` en console sur Analyse → Inventory,
  `phase 2a ✅` apparaissant nettement avant `phase 2b ✅`, et un switch de configuration A → B → A
  ne produisant que 2 séries de logs `🍽️ contexte PdV cfg`.

## Références

- [`../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md`](../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md) — lots B
  (cache `buildConfigShopEntry`) et C (unifier les 2 pipelines `shop-items`) restent à faire.
- [BUG-225](225_analyse_predict_config_par_defaut_et_dedup_contexte.md) — la pré-sélection d'une
  configuration a déjà sorti l'union toutes-configs du chemin par défaut.

---

Rédaction : **JLH**, 2026-07-20.
