# Plan — chargement par étapes d'Analyse / Prédire + dé-duplication `market-prices` & `shop-items`

> Demandé le 2026-07-20. Chaque lot est indépendant et livrable seul. Tous les `fichier:ligne`
> ci-dessous ont été relevés dans le code réel de `feat/postEventInventory`.

## Suivi

| Lot | Statut | Notes |
|---|---|---|
| A — dédup in-flight `market-prices` / `packaging` | 🟢 Fait (2026-07-20) | `tests/unit/inventoryCatalogCoalescing.spec.js` (5 tests) |
| D — phase 2 en vagues | 🟢 Fait (2026-07-20) | 2 vagues au lieu de 3 (voir note § Lot D) ; `tests/unit/useSpaceDataWaves.spec.js` (4 tests) |
| B — cache `buildConfigShopEntry` | 🟢 Fait (2026-07-20) | cache de **Promise** ; un batch en échec n'est pas mémorisé ; `tests/unit/analyseConfigShopEntryCache.spec.js` (6 tests) |
| C — unifier les 2 pipelines `shop-items` | ⚪ À faire | étape 0 = diff des shapes |

Fiche associée aux lots A + D + B : [BUG-198](bugs/198_chargement_analyse_dedup_catalogues_et_phase2_en_vagues.md).

> ⚠️ **Le vrai blocage n'était aucun de ces lots.** Une fois A/D/B livrés, la page restait bloquée
> ~1 min sur « Loading the catalog… » et le donut « Par zone ». Cause : `shop-items` renvoyait
> **5,6 Mo** parce que `getConfigShopMenuItemsLight` sélectionnait `picture` **par ligne
> d'assignation** — une photo base64 de 915 ko × 15 PdV = 13 Mo, pour une donnée que le front
> n'a jamais lue. C'était un **payload**, pas une orchestration.
> Voir [BUG-199](bugs/199_shop_items_photo_base64_dupliquee_par_pdv.md).
> Leçon pour la suite de ce plan : mesurer la taille des réponses avant d'optimiser leur
> séquencement.

## 1. Constat

### Ce qui part au chargement de `/spaces/:spaceId`

| Étape | Où | Contenu | Bloquant ? |
|---|---|---|---|
| Phase 1 | `src/composables/useSpaceData.js:71` | 4 endpoints en parallèle : space, configurations, `shop-details` (shops + events, **sans** granular), events | ✅ attendue |
| Phase 2 | `src/composables/useSpaceData.js:170` | **UN SEUL `Promise.all` de 9 endpoints** : menu-items, `shop-details?granular=1`, product-types, product-categories, weezevent-products, weezevent-product-mappings, ingredients, menu-components (paginé + fan-out détail concurrency 5, `:245`), packagings | ⛔ background |
| Hors phases | `AnalyseView.vue:1487` | `inventory/loadMarketPrices` (fire-and-forget) | non |
| Hors phases | `analyse.js` / `AnalyseView.vue:893-948` | contexte PdV (`loadConfigShopContext` ou l'union `loadAllConfigsShopContext`) | non |

Le « tout en même temps » que tu as observé, c'est le `Promise.all` de phase 2 : l'écran attend
que **le plus lent** (le granular) arrive pour lever `enriching`, alors que les dimensions légères
(taxonomie, menu-items) suffiraient à peupler filtres et camemberts.

### Doublons réels

1. **`market-prices`** — `inventory/loadMarketPrices` (`store/modules/inventory.js:256`) ne garde
   que sur `cachedAt` (`isMarketPricesCacheValid`), **sans dédup in-flight**. Appelé par
   `AnalyseView.vue:1487` (fire-and-forget), `SpaceInventoryView.vue:1457`,
   `SpaceRestockView.vue:2042` et `:3121`, `useMarketPrices.ensureLoaded`. Deux appels concurrents
   passent tous les deux la garde → **2× `GET /market-prices`**, requête qui coûte ~60 s à froid
   (le commentaire du code le dit lui-même).

2. **`shop-items` — deux pipelines parallèles, deux caches différents** :

   | Pipeline | Endpoint | Consommateurs | Cache |
   |---|---|---|---|
   | Batch | `getConfigShopMenuItemsLight` (`menu.api.js:472`) | `fetchNestShopMenus` → `buildConfigShopEntry` (Analyse), `useInventoryData.js:232` | **aucun cache de résultat** |
   | Per-shop | `getShopMenuItems` (`menu.api.js:509`) via `shopMenuItems/fetchForShop` | `EventPredictView.vue:3838`, `SpaceRestockView.vue:2486`, `SpaceMenusPanel.vue:1513`, fallback `useInventoryData.js:249` | 15 min + coalescing in-flight (`shopMenuItems.js:9,34`) |

   Conséquence : ouvrir Analyse puis Event Predict retélécharge **les mêmes menus** par l'autre
   endpoint, sans jamais toucher le cache de l'autre pipeline.

3. **Union toutes-configs** — `loadAllConfigsShopContext` = `N configs × buildConfigShopEntry`
   (pool 3). ✅ **Déjà traité** par [BUG-197](bugs/197_analyse_predict_config_par_defaut_et_dedup_contexte.md) :
   depuis la pré-sélection d'une config par défaut, ce chemin ne part plus qu'à la demande
   explicite de « Toutes les configurations ».

## 2. Plan — 4 lots indépendants

### Lot A — dédup in-flight sur `market-prices` *(quick win, ~30 lignes)*

Reprendre **le motif déjà en place dans le repo** : la `Map inflight` de `shopMenuItems.js:9`.
L'appliquer à `inventory/loadMarketPrices`, et à `loadPackagingTypes` qui a exactement la même
forme (`inventory.js:291`).

- **Critère de succès** : ouvrir Analyse puis Inventory en < 2 s → **une seule** ligne
  `💰 loadMarketPrices — GET /market-prices …` dans la console.
- **Risque** : nul (dédup pure, aucun changement de shape ni de sémantique de cache).

### Lot B — cache de résultat pour `buildConfigShopEntry`

`buildConfigShopEntry` (`analyse.js:265`) est une fonction pure **sans cache** : chaque appel
refait `getConfiguration` + assignation + le batch shop-menu-items.

- Map module-level `Map<`${spaceId}:${configId}`, { entry, cachedAt }>`, TTL 15 min (aligné sur le
  reste du store).
- **Invalidation obligatoire** dans `resetBuilder2SubtypesCache()` — déjà appelé par `loadSpace`
  (`analyse.js:1724`) — sinon on sert des PdV/zones périmés au retour du Builder. C'est
  exactement pour cette raison que la dédup de BUG-197 s'est limitée au vol en cours.
- **Bénéfice** : `loadAllConfigsShopContext` réutilise ce que `loadConfigShopContext` a déjà
  chargé ; aller-retour Analyse ↔ Event Predict gratuit ; switch de config A → B → A = 0 requête
  au 3ᵉ.
- **Critère de succès** : A → B → A ne produit que 2 séries de requêtes.

#### Réalisé le 2026-07-20

Cache de **Promise** (pas de résultat) → dédup aussi les appels concurrents. TTL : aucun — la
durée de vie est la session de page, purgée par `resetConfigShopEntryCache()` appelé en tête de
`loadSpace`, juste à côté de `resetBuilder2SubtypesCache()`. C'est ce point de purge qui rend le
cache sûr (retour du Builder → remount AnalyseView → `loadSpace` → refetch).

Piège trouvé en écrivant les tests : `buildConfigShopEntry` **avale tous ses propres échecs**
(chaque fetch a son `.catch`). Un blip réseau sur le batch shop-items produit donc un contexte
qui « réussit » avec zéro article — le mémoriser aurait figé des PdV sans menu pour toute la
session, là où l'ancien code retentait au dispatch suivant. D'où le flag `_batchFailed`, remonté
de `fetchNestShopMenus` jusqu'au wrapper de cache, qui refuse de mémoriser ces builds-là.

### Lot C — unifier les deux pipelines `shop-items` *(le plus risqué)*

Deux options :

1. **(recommandé)** faire écrire au batch : `fetchNestShopMenus` (`analyse.js:140-195`) commit ses
   lignes dans le store `shopMenuItems` (clé `${shopId}::${configId}`). EventPredict / Restock /
   SpaceMenusPanel lisent alors le cache au lieu de refetch per-shop — **aucun changement d'API
   côté consommateurs**, un seul point d'écriture.
2. faire passer EventPredict / Restock par le batch — plus de code touché, plus de surface de
   régression.

⚠️ **Étape 0 non négociable** : diff des deux shapes. Le batch est documenté « id / nom /
catégorie seulement », le per-shop renvoie la structure complète. Si un consommateur a besoin du
full, hydrater son cache avec du partiel produit un **bug silencieux** (champs manquants, pas
d'erreur). Si les shapes divergent : ne remplir le cache batch que pour les champs communs et
garder un flag `partial: true` que `fetchForShop` sait compléter.

### Lot D — découper la phase 2 en 3 vagues

Aujourd'hui un seul `Promise.all` de 9 endpoints. Proposition — chaque vague commit dès qu'elle
arrive (`onEnrichment` devient multi-appels) :

| Vague | Contenu | Débloque |
|---|---|---|
| **2a — dimensions** (léger) | product-types, product-categories, menu-items | filtres article + camemberts type/catégorie |
| **2b — ventes détaillées** (lourd) | `shop-details?granular=1` | graphes CA ; **c'est ici que `SET_ENRICHING(false)` doit passer**, pas plus tard |
| **2c — coûts / recettes** | ingredients, menu-components (+ fan-out détail), packagings, weezevent-products, weezevent-product-mappings | marge, Event Predict, Stock up |

**2c est le vrai candidat au lazy** : rien dans Analyse/Prédire ne l'affiche tant qu'on n'ouvre
pas la marge ou Event Predict. Le déclencher à l'ouverture plutôt qu'au load retire ~4 requêtes
(dont un fan-out paginé) du chemin de chargement.

- **À auditer avant** : tous les lecteurs de `state.components` / `state.ingredients` /
  `state.packagings` doivent tolérer le vide (aujourd'hui garanti par le `Promise.all`).
- **Critère de succès** : temps jusqu'au 1ᵉʳ camembert peuplé, et nombre de requêtes au landing.

#### Réalisé le 2026-07-20 — 2 vagues, pas 3

Découverte en implémentant : les 3 catalogues recette **ne sont pas indépendants** du reste. Ils
alimentent `resolveComponentRefs(normalizedMenuItems, { ingredients, components, packagings })`,
dont la sortie **est** le `menuItems` renvoyé par la phase 2. Un lazy complet (vague déclenchée à
l'ouverture de Restock) changerait donc la shape de `state.analyse.menuItems` — trop risqué en
l'état.

Compromis retenu, sans perte de données :

- **2a** = menu-items + granular + taxonomie + Weezevent produits/mappings → `onEnrichment` est
  appelé ICI, donc `SET_ENRICHING(false)` et la levée des skeletons n'attendent plus la vague
  recette. `menuItems` y est déjà normalisé (`normalizeMenuItem`), juste pas encore résolu.
- **2b** = ingredients + menu-components (pagination + fan-out détail concurrency 5) + packaging →
  2ᵉ `onEnrichment`, qui **raffine** `menuItems` (refs catalogue résolues) et ajoute
  `ingredients`/`components`.

`menuItemCostMap` est calculé en 2a (la résolution des refs ne touche aucun champ de coût) — la
marge n'attend donc plus non plus. Le chemin legacy sans callback retourne toujours l'objet
complet fusionné.

La 3ᵉ vague « dimensions » du plan initial (taxonomie séparée du granular) n'a pas été faite :
`enrichGranularMenuDimensions` a besoin des DEUX, les séparer ne gagnerait qu'un aller-retour.

**Reste à faire pour un vrai lazy** : auditer les lecteurs de `state.analyse.components` /
`.ingredients` (Restock F6, Stock up) et déterminer s'ils peuvent déclencher 2b eux-mêmes.

## 3. Ordre recommandé

**A** (isolé, immédiat) → **D-2c** (plus gros gain : sort ~4 requêtes du chemin critique) →
**D-2a/2b** → **B** → **C** (garder pour la fin, dépend du diff de shapes).

**Ce que je ne toucherais pas** : la phase 1. 4 requêtes en parallèle, c'est déjà le chemin
critique minimal pour un premier rendu.

---

Rédaction : **JLH**, 2026-07-20.
