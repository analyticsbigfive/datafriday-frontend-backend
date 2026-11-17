# Page Analyse, orchestration du chargement (rapport perf, partie 01)

Statut du rapport: PARTIEL. Le côté frontend (orchestration, store, composables, client HTTP) est lu et cité. Le côté
backend (contrôleurs, services, RPC SQL, index, Redis) n'a PAS été lu: toutes les colonnes backend sont "non vérifié".
Les durées citées viennent des commentaires du code (marquées "commentaire"), aucune n'est mesurée.
Chemins relatifs à la racine du dépôt. Les numéros de ligne précédés de "~" sont approximatifs.

## 1. Fiche de la page

| Élément | Valeur | Preuve |
|---|---|---|
| Route | `/spaces/:spaceId`, nom `space-analyse` | `frontend/src/router/index.js:206-214` |
| Composant | `AnalyseView.vue`, import dynamique (lazy) | `frontend/src/router/index.js:208` |
| meta | `{ title: 'Analyse' }`. Pas de `permission`, pas de `keepAlive` dans la meta de cette route | `frontend/src/router/index.js:213` |
| Garde | `beforeEnter: spaceEntryGuard`: `auth/initialize` si non initialisé, redirection login, `can('front.fb.analyse')` sinon premier écran autorisé | `frontend/src/router/guards.js:210-232` (environ) |
| keepAlive | Les commentaires parlent d'une instance qui survit au changement d'espace ("route keepAlive, key = route.name"). Le mécanisme réel (layout parent) n'a pas été lu | `AnalyseView.vue:2587-2590`. Non vérifié |
| Fichiers | `AnalyseView.vue` 3331 lignes, `store/modules/analyse.js` 2451, `composables/useSpaceData.js` 527, `api/endpoints/space.api.js` 702, `useAnalyseItemRecords.js` 295, `useTransactionBaskets.js` 228, `useShopPerformance.js` 190, `AnalyseAppHeader.vue` 960, `AnalyseSkeletonVeil.vue` 58, `filters/FilterPanel.vue` 1331 (+ 7 autres fichiers dans `filters/`) | `wc -l` |

Le chunk AnalyseView embarque de façon statique une quarantaine d'imports (graphes, tables, drawer Comparaison, Rapport J+1)
sauf `EventPredictView` qui est asynchrone (`AnalyseView.vue:884-962` et `:901`). Taille réelle du chunk: non mesurée.

## 2. Arbre des composants (niveau orchestration seulement)

Les panneaux, graphes, tables, comparaison et rapport J+1 sont traités par un autre agent. Ici seuls les composants qui
pilotent des chargements. Le caractère monté/différé de chaque enfant dépend du template, qui n'a pas été lu: non vérifié.

| Composant ou composable | Fichier | Lignes | Rôle | Monté à l'ouverture ou différé | Données reçues |
|---|---|---|---|---|---|
| AnalyseView | `frontend/src/components/space-workspace/analyse/views/AnalyseView.vue` | 3331 | Orchestrateur: auth, chargement espace, filtres, KPI | Monté | route.params.spaceId, store `analyse` |
| useSpaceData (fetchSpaceData) | `frontend/src/composables/useSpaceData.js` | 527 | Chargement 2 phases (critique puis enrichissement) | Appelé via `analyse/useSpaceDataFetch` (import dynamique, `analyse.js:1815`) | spaceId |
| useAnalyseItemRecords x2 | `frontend/src/composables/useAnalyseItemRecords.js` | 295 | Timeline grain summary par event (principal + comparaison) | Principal au setup (watch immediate). Comparaison vide tant que `comparisonMode` est off (`AnalyseView.vue:1465`) | filteredEvents |
| useTransactionBaskets | `frontend/src/composables/useTransactionBaskets.js` | 228 | Paniers par transaction | Au setup (watch immediate) | filteredEvents |
| useShopPerformance | `frontend/src/composables/useShopPerformance.js` | 190 | Taux de transactions par PdV | Mode partagé: aucun fetch (`useShopPerformance.js:148-151`, appel `AnalyseView.vue:1899-1920`) | records déjà en mémoire |
| useArticleDimensions | `frontend/src/composables/useArticleDimensions.js` | 70 | Dimensions article (marque, industriel, fournisseur) | Au setup si permission `stats.financial.view` (`AnalyseView.vue:~1060-1066`) | spaceId |
| useAnalyseDataset | `frontend/src/composables/useAnalyseDataset.js` | 675 | Dataset d'export, agrégation CPU en idle, aucun réseau | Watch immediate, planifié en idle après les 3 chargements (`useAnalyseDataset.js:644-657`, `AnalyseView.vue:2010-2014`) | records en mémoire |
| useAnalyseTimeline | `frontend/src/composables/useAnalyseTimeline.js` | 144 | Courbe minute d'un event | Sur clic (appelle `getSpaceEventTimelineBatch` grain minute). Détail non lu | event cliqué |
| AnalyseAppHeader, FilterPanel, filters/, AnalyseSkeletonVeil | `.../analyse/*` | 960 / 1331 / n.a. / 58 | Entête, filtres, voile de chargement | NON LU | non vérifié |

## 3. Appels API, composant par composant

Légende: "Bloque" = bloque le premier rendu. Colonnes backend (contrôleur/service, tables/RPC, Redis, payload): non vérifié
pour toutes les lignes sauf mention contraire. Cache front = ce qui est lisible dans le code front.

| # | Déclencheur | Méthode + URL | Fonction front | Séquence / bloque | Cache front | Coût probable (commentaires) |
|---|---|---|---|---|---|---|
| 1 | Garde de route | `auth/initialize` si non initialisé | `guards.js:~217` | Séquentiel, avant le chargement du composant | store auth | non vérifié |
| 2 | `ensureAuthAndLoad` (mount) | Supabase `getSession()` | `AnalyseView.vue:2642` | Séquentiel, bloque le skeleton (`initialLoadPending`) | session locale | Local en principe. Un refresh de token réseau n'est pas exclu: non vérifié |
| 3 | idem | GET `/preferences` | `getUserPreferences` (`frontend/src/utils/api.js:1356`) via `apiFetch` (fetch + dédup GET, `utils/api.js:51-91`), appelé en `AnalyseView.vue:2653` | Séquentiel après 2, AVANT `loadSpace`. Bloque. Le résultat ne sert qu'à poser le preset de période (`:2654-2655`) | aucun | 1 aller-retour. Backend non lu |
| 4 | `loadSpace` puis `fetchSpaceData` t0 | GET `/spaces/:id/shop-details?page=1&limit=200&granular=1` (RPC `get_space_shop_details`) | `getSpaceShopGranular` (`space.api.js:86-99`), lancé en `useSpaceData.js:116` | Parallèle à la phase 1. Attendu en vague 2a (`:226`). Ne bloque pas le premier rendu, bloque la levée de `enriching` | aucun côté front. Le store est lui en cache-first 15 min (`analyse.js:1715-1723`) mais la revalidation relance cet appel (`:1763`) | "15-20 s sur un gros espace" (commentaire `useSpaceData.js:5-7`). Cache serveur 60 s: non vérifié |
| 5 | Phase 1 | GET `/spaces/:id` | `getSpace` (`space.api.js:16`) | Parallèle (Promise.all `useSpaceData.js:124-150`), bloque le premier rendu | aucun | "~1-2 s" pour la phase 1 (commentaire `:11`) |
| 6 | Phase 1 | GET `/spaces/:id/configurations` | `getSpaceConfigurations` (`space.api.js:49`) | idem | aucun | idem |
| 7 | Phase 1 | GET `/events?spaceId&limit=200&excludeSimulated=true` | `getEvents` (`frontend/src/api/endpoints/event.api.js:22-29`) | idem. Plafond 200 events | aucun | idem |
| 8 | Vague 2a | GET `/menu-items?page=1&limit=150&spaceId=`, puis pages 2..N | `getAllMenuItems` (`frontend/src/api/endpoints/menu-item.api.js:36-64`) | Démarre APRÈS la phase 1 (voir 4.). Page 1 séquentielle puis pages 2..N en parallèle non bornées (`:52-61`) | aucun | dépend de la taille du catalogue: non vérifié |
| 9 | Vague 2a | GET product-types, GET product-categories | `getProductTypes`, `getProductCategories` (`useSpaceData.js:227-228`) | Parallèle, après phase 1 | aucun | non vérifié |
| 10 | Vague 2a | Produits Weezevent avec `catalogSpaceId` | `getWeezeventProducts(null,null,null,true,{catalogSpaceId})` (`useSpaceData.js:235`) | Parallèle, après phase 1 | aucun | Commentaire: un essai avec `spaceId` annulait la requête après plus d'une minute (`:229-234`) |
| 11 | Vague 2a | Mappings produit Weezevent, NON scopé à l'espace | `getProductMappings()` (`useSpaceData.js:241`) | Parallèle, après phase 1 | aucun | Retourne le tenant entier (commentaire `:236-240`). Taille: non vérifié |
| 12 | Fin de phase 1 (events arrivés) | GET `/spaces/:id/event-timeline?eventIds=..&granularity=summary` | `getSpaceEventTimelineBatch` (`space.api.js:318-401`), appelé par `useAnalyseItemRecords.js:121` | Paquets de 30 (`space.api.js:244`), 2 en vol par endpoint (`:245`), plafond 100 events (`useAnalyseItemRecords.js:20`). Non bloquant pour le layout, mais la bande KPI attend TOUS les paquets (`sourceState`, `:258-264`) | Cache session API (LRU, `_SESSION_CACHE_MAX = 30`, `space.api.js:142`: voir problème 7) + cache composable, vidé à l'unmount (`AnalyseView.vue:2541-2546`) | Pré-agrégat "0,2 à 0,3 s par paquet" (commentaire `space.api.js:238-242`) |
| 13 | idem, en parallèle de 12 | GET `/spaces/:id/transaction-baskets?eventIds=..` | `getSpaceTransactionBasketsBatch` (`space.api.js:419-483`), appelé par `useTransactionBaskets.js:104` | Paquets de 6 (`space.api.js:257`), pas de grain summary. 17 paquets pour 100 events. La bande KPI attend tous les paquets (`useTransactionBaskets.js:192-206`, `AnalyseView.vue:1917-1919`) | Cache session API (LRU) + cache composable vidé à l'unmount | Commentaire: 2,0 Mo JSON pour UN event Jean Bouin (4 782 lignes), 42 Mo pour un paquet de 30 (`space.api.js:247-256`) |
| 14 | idem (par paquet reçu) | `ensureEventCosts` puis `loadEventCostsInBatches(spaceId, ids, getEventCosts)` par lots de 100 | `analyse.js:1790-1806`, déclenché `useAnalyseItemRecords.js:~96` | Parallèle du fetch, mais chaque paquet attend `costsReady` avant d'être appliqué (`:~103`). HORS portillon global | store `menuItemCostByEvent` (events déjà connus non redemandés, `analyse.js:1793`) | non vérifié (endpoint `analyse-rendement`) |
| 15 | Setup (si permission) | GET article-dimensions | `getArticleDimensions` (`useArticleDimensions.js`) | Parallèle, hors portillon | Cache module par espace, sans TTL, une requête par espace | non vérifié |
| 16 | `onMounted` | `seasons/fetchAll` | `AnalyseView.vue:2552` | Fire-and-forget, `.catch(() => {})` | store, "cache 15 min" (commentaire `:2551`) | non vérifié |
| 17 | Après `loadSpace` | `inventory/loadMarketPrices` (catalogue prix global tenant) | `AnalyseView.vue:2670` | Fire-and-forget. Ne bloque pas, mais part au moment où les paquets lourds démarrent | SWR store inventory (commentaire `:2667-2669`) | "~60 s à froid" (commentaire `:2667`). Inutile pour Analyse (sert à Inventory/Logistic/Restock) |
| 18 | Différé (fin 2a, ou 3 s après fin de phase 1) | `loadAllConfigsShopContext`: par config, `getConfiguration` (si floors absents en mémoire), `spaceShops/fetchForSpace`, `getConfigShopMenuItemsLight`; plus 1 fois `getBuilderState(spaceId)` | `analyse.js:2067-2120`, `buildConfigShopEntry` `:272-353`, `fetchNestShopMenus` `:136-195` | Pool de 3 configs (`analyse.js:2089-2091`). Non bloquant | Cache de résultat par (espace, config), purgé à chaque `loadSpace` (`analyse.js:1749`, `:371-376`) | "~2-3 requêtes par config" (commentaire `analyse.js:1921`) |
| 19 | Sélection d'une config (clic, URL `?config=`) | `loadConfigShopContext` (mêmes appels pour une config) | `analyse.js:1990-2060`, watch `AnalyseView.vue:1592-1611` | Non bloquant | idem 18, dédup sur le vol en cours | idem |

Backend (aucune ligne lue): contrôleurs et services `spaces`, `analyse`, `events`, `menu-items`, `weezevent`, `mappings`,
`preferences`; migration `*shop_details_rpc*` (une migration non suivie existe dans le dépôt:
`backend/prisma/migrations/20261102120000_shop_details_rpc_include_unmapped_locations/`, non lue); index de `schema.prisma`;
caches Redis. Tout est à lire dans une passe dédiée.

Client HTTP (lu, `frontend/src/api/client.js`): timeout 60 s (`:18`), intercepteur de requête qui récupère la session
(`:124-131`), retry unique sur 429 avec `Retry-After` (`:206-216`), retry unique d'un GET sur timeout si `/health` répond
en moins de 5 s (`:221-234`). `getUserPreferences` n'utilise PAS ce client mais un autre chemin (`utils/api.js`).

## 4. Cascade au premier affichage

Durées: aucune mesurée. Les ordres de grandeur sont ceux des commentaires.

- t0, navigation: `spaceEntryGuard` (`auth/initialize` si besoin), chargement du chunk AnalyseView. Au setup, avant `onMounted`:
  `useArticleDimensions` lance GET article-dimensions (#15); `useAnalyseItemRecords` et `useTransactionBaskets` tirent leur
  watch immediate avec `filteredEvents` vide, donc sans requête sur une première visite.
- t1, `onMounted` (`AnalyseView.vue:2548`): `ensureAuthAndLoad` met `initialLoadPending = true` (skeleton), `seasons/fetchAll`
  part en parallèle (#16), la toolbox est remise à `analyse`.
- t2: `await supabase.auth.getSession()` (#2).
- t3: `await GET /preferences` (#3). BLOQUANT et SÉQUENTIEL: rien d'autre ne part avant son retour, y compris le shop-details
  granular qui est pourtant l'appel le plus long.
- t4: `loadSpace` (`SET_LOADING`), import dynamique de `useSpaceData`, puis en parallèle: granular (#4, démarre ici) et phase 1
  (#5, #6, #7).
- t5, fin de phase 1: commit espace, configs, events; `loading = false`, premier rendu avec skeletons de graphes
  (`enriching` toujours vrai). Au même instant:
  - la vague 2a démarre (#8 à #11, 5 familles de requêtes). Seul le granular avait été lancé plus tôt (`useSpaceData.js:422-428`
    puis `:223`);
  - `filteredEvents` devient non vide: `useAnalyseItemRecords` envoie jusqu'à 4 paquets timeline (#12), `useTransactionBaskets`
    jusqu'à 17 paquets (#13), `ensureEventCosts` part (#14). Les 21 paquets passent par un portillon de 2 requêtes en vol;
  - `loadSpace` rend la main, `inventory/loadMarketPrices` part (#17).
  Charge simultanée à t5: granular en cours, 5 requêtes catalogue, 2 paquets batch, costs, article-dimensions, market prices,
  seasons, soit une dizaine de requêtes. Protocole HTTP/2 ou HTTP/1.1 (limite de 6 connexions): non vérifié.
- t6, environ t5 + 3 s ou fin de la vague 2a: `requestDeferredAllConfigsContext` (`AnalyseView.vue:1613-1666`) lance l'union
  "All Configurations" (#18), pool de 3 configs, en plein pic de chargement.
- t7, retour du granular (commentaire: 15-20 s sur un gros espace): `normalizeAndEnrichGranular` sur le thread principal
  (`useSpaceData.js:269`), `SET_SHOP_GRANULAR`, `SET_ENRICHING false` (`analyse.js:1868`): les graphes shop-level sortent du
  skeleton.
- t8: la bande KPI sort du skeleton quand timeline ET paniers ont tenté tous les events du périmètre (`useAnalyseItemRecords.js:258-264`,
  `useTransactionBaskets.js:192-206`).
- À l'arrivée du contexte PdV (t6 à t8), `reconciliationCtx` change: les lignes déjà réconciliées sont toutes re-mappées
  (`useAnalyseItemRecords.js:208-215`, commentaire `:201-207`).
- Fin: `useAnalyseDataset` planifie son agrégation en idle une fois `chartsLoading`, `itemRecordsLoading` et `basketsLoading`
  retombés (`AnalyseView.vue:2010-2014`).

Chemin critique: t3 (preferences) puis t4 (démarrage du granular), puis max(granular, [phase 1 puis 21 paquets via 2 slots]).
Lequel domine n'est pas mesuré. Le commentaire donne 15-20 s pour le granular et "0,2 à 0,3 s par paquet" pour la timeline
summary, mais aucune durée pour les paquets paniers.

## 5. Problèmes de performance

1. Chaîne séquentielle getSession, puis /preferences, puis loadSpace (`AnalyseView.vue:2642-2665`). La requête /preferences
   (qui ne sert qu'à poser un preset de période) retarde le démarrage du granular de 15-20 s (commentaire) et de toute la
   phase 1. Impact: haut (se paie à chaque ouverture). Pages: Analyse (le chemin est propre à cette vue).
2. Le granular shop-details est le plus long appel du chargement (commentaire `useSpaceData.js:5-7`) et il est rejoué à CHAQUE
   revisite, même quand le store est jugé frais, car la revalidation d'arrière-plan relance `useSpaceDataFetch` en entier
   (`analyse.js:1759-1766`). Le gain du cache-first est donc côté affichage seulement, pas côté charge backend. Impact: haut.
   Pages: Analyse, et toute vue qui dispatch `loadSpace` (Live, Restock, EventPredict, non traitées ici).
3. Paniers sans grain summary: 17 paquets de 6 events pour 100 events (`space.api.js:257`), 2,0 Mo par event sur Jean Bouin et
   42 Mo pour 30 events (commentaire `space.api.js:247-256`). Ordre de grandeur extrapolé, non mesuré: jusqu'à environ 4 800
   lignes par event, donc de l'ordre de 480 000 objets gelés en mémoire pour 100 events (`useTransactionBaskets.js:92`, copie
   `{...r}` par ligne). C'est une des deux sources que la bande KPI attend en entier. Impact: haut.
4. Portillon global de 2 requêtes en vol (`space.api.js:266-283`), partagé en FIFO entre timeline et paniers à priorité
   identique: la file `low` existe (`:270`) mais aucun des 2 appelants de `_fetchBatchChunked` ne l'utilise (`space.api.js:385`,
   `:469`, paramètre `priority` par défaut `'high'` en `:285`). Temps total des 21 paquets ≈ somme des durées / 2. Le portillon
   ne couvre pas les costs, article-dimensions, market prices, catalogues, contexte PdV, qui se disputent le backend et le
   navigateur. Le plafond par endpoint (2) est redondant avec le plafond global (2). Impact: haut.
5. Vague 2a non lancée à t0: seul le granular l'est. menu-items, types, catégories, produits Weezevent et mappings
   attendent la fin de la phase 1 (`useSpaceData.js:124-150` puis `:428` et `:223-242`) alors qu'ils ne dépendent que de
   `spaceId`. Impact: bas tant que le granular domine, moyen sinon (espaces où le granular est rapide). Pages: Analyse, Live.
6. `ensureEventCosts` hors portillon et bloquant pour l'application de chaque paquet (`useAnalyseItemRecords.js:~96-103`):
   un retard de cet endpoint retarde toute la timeline même si ses paquets sont arrivés. Impact: moyen. Backend non lu.
7. Revisite: (a) le skeleton réapparaît pendant getSession + /preferences même quand le store est frais, car
   `initialLoadPending` reste vrai pendant ces attentes (`AnalyseView.vue:2637`, `:2682`, `loading` au `~:1070`); (b) les
   caches des composables sont vidés à l'unmount (`:2541-2546`) et le cache session de l'API est un LRU de 30 entrées
   (`space.api.js:142`, `:153`). Les clés étant par event, il ne peut pas garder 100 events: environ 70 events seraient
   redemandés à chaque retour. À CONFIRMER: seules les lignes 142 et 153 de `_lru*` ont été vues, pas les lignes 137-160
   en entier. Impact: moyen à haut sur les retours dans la page. Pages: Analyse.
8. `inventory/loadMarketPrices` déclenché à chaque montage Analyse (`AnalyseView.vue:2670`), requête "~60 s à froid" (commentaire
   `:2667`), pour un catalogue que cette page n'utilise pas. Part au moment du pic. Impact: moyen (charge DB/backend, pas de
   blocage direct). Pages: Analyse.
9. Contexte "All Configurations": `spaceShops/fetchForSpace` est dispatché dans CHAQUE `buildConfigShopEntry`
   (`analyse.js:141`) alors que la liste de PdV de l'espace est la même pour toutes les configs; la dédup éventuelle est dans le
   store `spaceShops`, non lu. Le cache de résultat est purgé à chaque `loadSpace` (`analyse.js:1749`), donc rejoué à chaque
   visite. Impact: moyen. Pages: Analyse (aussi Event Predict qui partage le store).
10. Re-réconciliation en plein chargement: quand le contexte PdV arrive (t6-t8), `reconciliationCtx` change et toutes les
    lignes déjà chargées sont re-mappées (`useAnalyseItemRecords.js:208-215`), sur le thread principal et en même temps que
    l'arrivée des paquets. Impact: moyen, non mesuré.
11. Travail CPU thread principal sur de gros volumes: `normalizeAndEnrichGranular` (`useSpaceData.js:269`), watcher
    `soldItemOptionRecords` qui reparcourt les records et dispatch à chaque changement de source (`AnalyseView.vue:1672-1692`),
    `useAnalyseDataset` en idle (`:2014`). Impact: inconnu, à profiler.
12. `getAllMenuItems`: page 1 séquentielle puis pages 2..N toutes en parallèle sans plafond (`menu-item.api.js:52-61`), au
    moment du pic réseau. Impact: bas à moyen selon la taille du catalogue (non vérifié).
13. `getProductMappings()` non scopé à l'espace (`useSpaceData.js:241`): charge tout le tenant. Impact: moyen possible (taille
    non vérifiée).
14. Pas d'annulation réseau: l'`abortController` des composables ne fait que jeter les résultats (`useAnalyseItemRecords.js:~75-77`),
    il n'est pas passé à axios, et les workers de `_fetchBatchChunked` ne testent pas l'annulation (`space.api.js:290-307`).
    Un changement de filtre pendant le chargement laisse les paquets en file occuper les 2 slots. Atténué par la dédup
    `inflight` (`space.api.js:341-343`). Impact: bas à moyen.
15. Incohérence de client HTTP: `/preferences` passe par le monolithe `utils/api.js` (fetch maison, sans les intercepteurs
    retry/401 de `client.js`). `frontend/CLAUDE.md` indique que ce fichier est un legacy réservé à Restock. Impact: bas.
16. Périmètre par défaut "12 mois glissants" (commentaire `AnalyseView.vue:2651`) plafonné à 100 events pour les chargements
    item-level (`useAnalyseItemRecords.js:20`): le volume réel d'events par espace n'est pas connu. Non vérifié.

## 6. Recommandations

Les gains ne sont pas chiffrés (aucune mesure). Ils sont exprimés en nature de gain.

### Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Lancer `/preferences` en parallèle (au t0) ou appliquer le preset depuis un cache local (localStorage) puis revalider; ne plus l'attendre avant `loadSpace` | Supprime 1 aller-retour avant tout appel de données; démarre le granular plus tôt | Si le preset arrive après le commit des events, le périmètre change et les paquets sont redemandés. À éviter en posant le preset avant le commit des events | S | `frontend/src/components/space-workspace/analyse/views/AnalyseView.vue:2635-2684` |
| Lancer les 5 familles de requêtes de la vague 2a avant la phase 1, comme le granular | Moins de latence cumulée sur les gros catalogues | Plus de requêtes simultanées au t0 | S | `frontend/src/composables/useSpaceData.js:116-150`, `:223-242` |
| Retirer `inventory/loadMarketPrices` du montage Analyse (le laisser à Inventory) ou le différer après la fin des chargements | Retire une requête annoncée à 60 s à froid du pic de chargement | Cache Inventory moins chaud à l'ouverture suivante | S | `AnalyseView.vue:2666-2670` |
| Donner une priorité `low` aux paniers ou les lancer après la timeline; ou les laisser hors chemin critique de la bande KPI tant qu'aucun filtre intra-event ne les exige | Les paquets timeline légers passent d'abord, la bande KPI sort plus tôt | À étudier: les paniers sont la seule source de TX/MIN et du panier moyen (`AnalyseView.vue:1750-1790`). Dépendance exacte de `kpiSourceState` non lue | M | `frontend/src/api/endpoints/space.api.js:285`, `:469`; `useTransactionBaskets.js` |
| Inclure `ensureEventCosts` dans le portillon (ou le fusionner avec le premier paquet) et ne pas bloquer l'application des paquets dessus | Évite qu'un endpoint lent bloque la timeline | Coût de repli (coût actuel) appliqué si en retard | M | `useAnalyseItemRecords.js:~93-103`, `analyse.js:1790-1806` |
| Sortir `spaceShops/fetchForSpace` de la boucle par config (une fois pour toute l'union) | Retire N-1 requêtes identiques potentielles | Aucun si la liste est bien commune aux configs | S | `analyse.js:141`, `:2088-2100` |
| Déclencher le contexte "All Configurations" après la fin des chargements (`sourceState` prêts) plutôt qu'à 3 s | Évite la re-réconciliation complète en plein chargement et le pic réseau | Filtres type/zone disponibles plus tard | S | `AnalyseView.vue:1613-1666` |
| Conserver les caches de composables lors d'un retour sur le même espace (ou porter le LRU API à au moins 100) après avoir confirmé la taille réelle du LRU | Retour dans la page sans re-télécharger ~70 events | Mémoire (BUG-285 documenté à l'origine de l'éviction, `space.api.js:137`) | M | `AnalyseView.vue:2541-2546`, `space.api.js:137-155` |
| Ne pas relancer le granular en revalidation si le store a moins de N minutes | Réduit la charge backend sur les revisites | Données plus anciennes affichées | S | `analyse.js:1759-1766` |
| Borner la concurrence des pages 2..N de `getAllMenuItems` | Lisse le pic réseau | Chargement du catalogue plus lent sur gros tenant | S | `menu-item.api.js:52-61` |

### Backend et SQL (hypothèses à valider après lecture du code et EXPLAIN, rien n'a été lu)

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Ajouter un grain `summary` à `transaction-baskets` (comme `event-timeline`), cf. commentaire BUG-386-02 | Payload paniers divisé fortement, moins de paquets, moins de risque mémoire (instance 512 Mo citée en `space.api.js:253`) | Les calculs TX/MIN et pic exigent la minute (`space.api.js:247-249`): prévoir deux grains | L | `backend/src/features/spaces` (non lu) |
| Évaluer le coût de `get_space_shop_details` en granular (EXPLAIN ANALYZE), son cache Redis (60 s annoncés) et l'opportunité d'un pré-agrégat comme pour la timeline | Réduit le chemin critique de 15-20 s (commentaire) | À mesurer | L | migration `*shop_details_rpc*`, `backend/prisma/schema.prisma` (non lus) |
| Vérifier les index des tables lues par les RPC/endpoints listés (events, transactions, agrégats minute) | À mesurer | Écriture plus lente si index en trop | M | `backend/prisma/schema.prisma`, `backend/prisma/migrations/*` (non lus) |

## 7. Points non vérifiés

- TOUT le backend: contrôleurs, services, RPC `get_space_shop_details` (migration la plus récente, index présents), caches
  Redis et TTL, tailles de réponse, pour les 19 appels du tableau 3 (spaces, analyse, events, menu-items, weezevent, mappings,
  preferences, analyse-rendement, builder-v2, configurations, spaceShops).
- Le cache serveur de 60 s sur shop-details granular (information du brief, non revue dans le code).
- `AnalyseAppHeader.vue`, `FilterPanel.vue` et `filters/*`, `AnalyseSkeletonVeil.vue`: non lus (appels réseau éventuels, coût
  de rendu, conditions d'affichage du voile).
- Le template d'`AnalyseView.vue`: quels enfants sont montés d'emblée ou différés (`v-if`, onglets, drawers).
- Le mécanisme keepAlive réel (layout parent) et donc ce qui se passe à la revisite (remontage ou réactivation).
- `useSpaceData` en revisite: ordre des chargements quand le store est déjà peuplé (les composables item-level tirent-ils au
  setup avec `filteredEvents` non vide?).
- Lignes 137-160 de `space.api.js` (définition exacte de `_lruGet/_lruSet`): le plafond de 30 entrées est vu par grep seulement.
- Définition de `filteredEvents` et du nombre réel d'events dans le périmètre par défaut (12 mois), `kpiSourceState`
  (`AnalyseView.vue:~1750-1800`): savoir si la bande KPI attend vraiment les paniers quand le rollup `Event.revenue` est utilisé.
- `useAnalyseTimeline`, `useRendementWidgets` (203 lignes, appels via store?), `useComparisonForm`, `seasons/fetchAll`,
  `inventory/loadMarketPrices` (URL, cache, backend).
- À mesurer dans le navigateur: Network (protocole h2 ou HTTP/1.1, waterfall), taille réelle des réponses shop-details,
  event-timeline summary et transaction-baskets sur un gros espace, temps de `normalizeAndEnrichGranular`, coût de la
  re-réconciliation, taille du chunk `AnalyseView`.
- Le fichier non suivi `backend/prisma/migrations/20261102120000_shop_details_rpc_include_unmapped_locations/` n'a pas été lu.
