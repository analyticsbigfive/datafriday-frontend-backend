# Rapport perf 10b: Builder v2 et Space Menu (liste + détail shop)

Statut: complet. Lecture seule, aucune mesure réelle, aucune exécution (jest/build/serveur non lancés).

# PARTIE A. Builder v2 (`/spaces/:spaceId/builder`)

## A1. Fiche de la page
- Route `SpaceBuilder2`, path `/spaces/:spaceId/builder`, composant chargé en lazy (`() => import(...BuilderPage.vue)`), meta `{ title: 'Builder v2', permission: 'space.edit' }`, pas de keepAlive, pas de beforeEnter (frontend/src/router/index.js:220-225). Commentaire du routeur: pas de keep-alive car autosave granulaire (index.js:216-218).
- BuilderPage.vue (14 lignes) est un shell: rend `BuilderWorkspace` avec `:key="spaceId"` (BuilderPage.vue:1-5). BuilderWorkspace.vue 218 lignes.
- Dossier builder2: ~9500 lignes au total (wc -l).

## A2. Arbre des composants
Constat structurant: le "rendu 3D" du Builder n'est PAS du WebGL. C'est une projection isométrique calculée à la main et dessinée en SVG (IsoView.vue:18-368, fonctions `toIsometric`/`drawBox` aux lignes 430-436 et 561-570). Aucune bibliothèque 3D (three, babylon) dans frontend/package.json (grep: seule `lucide-vue-next` est trouvée, package.json:25), aucun import dynamique de moteur 3D. Le coût 3D est donc du JS + DOM SVG, pas du GPU/chargement de bibliothèque.

| Composant | Fichier | Lignes | Rôle | Monté / différé | Données reçues |
|---|---|---|---|---|---|
| BuilderPage | builder2/BuilderPage.vue | 14 | shell de route, `:key="spaceId"` | lazy par le routeur (router/index.js:223) | route.params.spaceId |
| BuilderWorkspace | builder2/BuilderWorkspace.vue | 218 | grille 3 volets, loader, erreur, état vide | monté à l'ouverture; imports statiques de tous les panneaux (BuilderWorkspace.vue:92-98) | store par espace (`provide('builderStore')`) |
| BuilderHeader | components/BuilderHeader.vue | 288 | en-tête + ConfigSelector | monté tout de suite | store |
| ZonePanel + PalettePanel | components/panels | 340 + 163 | liste des zones, palette d'outils | monté seulement quand `bootstrapped` et configs > 0 (v-else, BuilderWorkspace.vue:42-48) | store |
| IsoView | components/iso/IsoView.vue | 745 | vue "3D" SVG isométrique | monté dès l'état prêt, sauf plein écran plan (`v-if="!isPlanFullscreen"`, :55) | zones/éléments du store |
| PlanCanvas | components/canvas/PlanCanvas.vue | 808 | plan 2D SVG, drag/resize/dessin | monté dès l'état prêt | zone active + éléments visibles |
| InspectorPanel ou ElementListPanel | inspector/InspectorPanel.vue 296, panels/ElementListPanel.vue 495 | | volet droit: inspecteur si un élément est sélectionné, sinon liste d'éléments | `v-if` / `v-else` (:62-63), les 2 sont des imports statiques | selectedElement |
| Sections d'inspecteur (Inventory 506, StorageInventory 779, Staff 362, ...) | inspector/sections | ~3000 au total | édition par élément | n'existent qu'après sélection d'un élément (non vérifié: lazy interne à InspectorPanel) | élément + config active |
| Dialogues Zone/Delete* | dialogs | ~900 | | différés (ouverts à la demande, non vérifié) | |

Taille du dossier builder2: environ 9500 lignes (wc -l). Les 7 composants lourds sont importés statiquement dans BuilderWorkspace.vue:92-98, mais ils sont déjà dans le chunk lazy de la route (router/index.js:223), donc pas dans le bundle principal.

## A3. Appels API
Un seul appel au premier affichage du Builder lui-même, plus un appel de référentiel dans IsoView/PlanCanvas.

| Déclencheur | Méthode + URL | Fonction front | Séquentiel / bloque | Cache front | Backend | SQL | Redis | Payload | Coût probable |
|---|---|---|---|---|---|---|---|---|---|
| onMounted de BuilderWorkspace via `useBuilderBootstrap` | GET `/builder-v2/spaces/:spaceId/state` | builder2.api `getBuilderState` (api/endpoints/builder-v2.api.js:19-22), appelé par `bootstrap()` (builderStore.js:158-175) | bloque le rendu au 1er montage (`loading && !bootstrapped` => spinner plein écran, BuilderWorkspace.vue:15-17). Aux montages suivants: refresh en arrière-plan sans spinner, mais avec barre d'activité (useBuilderBootstrap.js:15-19) | Map `stores` par espace en mémoire (builderStore.js:27-33): l'état survit à la navigation, mais le bootstrap est refait à chaque montage (useBuilderBootstrap.js:15-19). Pas de TTL, pas de localStorage | BuilderV2Controller.getBuilderState (builder-v2.controller.ts:42-50) -> BuilderV2ZoneService.getBuilderState (services/builder-v2-zone.service.ts:30-73) -> `builderStatePayload` (builder-v2.queries.ts:20-123) | 1 requête SQL géante: CTE sp + zone_rows + cfg; par élément ~8 sous-requêtes corrélées (ElementPerformance, ElementStaff, ElementInventory groupés par config, ConfigurationElement, EXISTS + sous-select sur WeezeventLocationShopMapping avec jointure `OR` sur WeezeventLocation, 2 COUNT DISTINCT sur MenuAssignment) | AUCUN cache Redis sur cette lecture (grep "cache|redis" dans le contrôleur et les services: seul `invalidateSpaceCache` en écriture, builder-v2-support.service.ts:169-175) | proportionnel au nombre d'éléments x configs: inclut TOUTES les lignes d'inventaire, de staff et de performance de TOUTES les configs (queries.ts:49-71), même si le front n'affiche que la config active. Taille réelle non mesurée | moyen à haut sur gros espace (stade): 1 passage SQL + reshape JS (zone.service.ts:43-60) + sérialisation JSON |
| onMounted IsoView (:403) et PlanCanvas (:449) | dispatch Vuex `departments/fetchDepartments` | | non bloquant | module Vuex departments (TTL 15 min d'après la convention frontend/CLAUDE.md, non relu ici) | non vérifié | | | petit | bas (doublon d'appel dispatché 2 fois, le cache Vuex doit dédupliquer: non vérifié) |
| Sortie du Builder (onBeforeUnmount) | dispatch `spaceShops/invalidateForSpace` + `analyse/invalidateSpaceCaches` (useBuilderExitInvalidation.js:7-12) | | invalidation de caches, pas de réseau | | | | | | bas, mais force le rechargement des pages Analyse etc. |
| Geste (drag/resize) | PATCH `/builder-v2/elements/:id` (header If-Match) | `patchElement` (builder-v2.api.js:~62), file `createMutationQueue` (useMutationQueue.js:22-119) | non bloquant, sérialisé, debounce 500 ms, coalescé par clé `el:<id>` (builderStore.js:285), 3 retries sur 5xx | | element.service.patchElement (services/builder-v2-element.service.ts:93-170): `updateMany` (1 RTT) puis `findFirst` avec `include` performances+staffPositions+inventoryItems (:151-154), puis, si capacity change, findMany memberships + UPDATE capacités | UPDATE SpaceElement, SELECT SpaceElement + 3 relations | invalidation Redis non bloquante `invalidateSpaceCache` à CHAQUE patch (support.service.ts:172-175, element.service.ts:168) | la réponse renvoie l'élément sérialisé complet (perf+staff+inventaire de toutes les configs) alors que le front ne lit que `version` (builderStore.js:283) | bas à moyen |

Autres mutations (create/duplicate/delete zone ou élément, PUT performance/staff/inventory par config, GET staff-suggestions, GET/PUT menu-item-sales-input, memberships, configs): déclenchées à la demande par les sections d'inspecteur, endpoints listés dans builder-v2.controller.ts:54-340; non analysées une à une.

## A4. Cascade au premier affichage
- t0: navigation, import lazy du chunk BuilderPage (router/index.js:223). Guard permission `space.edit` seulement (meta), pas de beforeEnter.
- t1: montage de BuilderWorkspace, header + barre d'activité + spinner plein écran (`loading && !bootstrapped`). `useBuilderBootstrap.onMounted` lance GET `/builder-v2/spaces/:spaceId/state` (useBuilderBootstrap.js:15-19).
- t1 (parallèle, après rendu de IsoView/PlanCanvas, donc APRES t2): `departments/fetchDepartments`. Comme IsoView/PlanCanvas ne sont pas montés avant `bootstrapped`, ce fetch démarre APRES le GET state, en cascade (non vérifié si le store departments est déjà chaud via l'app shell).
- t2: réponse du state, `hydrate()` (builderStore.js:177-210) reconstruit 4 index; première grille 3 volets.
- t3: IsoView `nextTick(fitToScene)` (IsoView.vue:705) et PlanCanvas `fitToView` (PlanCanvas.vue:499): deux calculs de cadrage après le premier rendu, donc un second rendu SVG.
Chemin critique: un seul GET lourd (state) puis rendu SVG de tous les étages. Pas de cascade API à plusieurs niveaux.

## A5. Problèmes de performance
1. GET `/builder-v2/spaces/:id/state` sans cache Redis, payload qui embarque performance/staff/inventaire de TOUTES les configs pour TOUS les éléments, + ~8 sous-requêtes corrélées par élément (builder-v2.queries.ts:20-123). Le front n'utilise l'inventaire/staff que de la config active, et seulement pour l'élément sélectionné. Impact: haut sur les gros espaces. Pages concernées: Builder, et indirectement chaque re-bootstrap (409, montage).
2. Bootstrap refait à CHAQUE montage même si le store est déjà hydraté (useBuilderBootstrap.js:15-19): coût identique au premier chargement, caché sous la barre d'activité. Impact moyen.
3. Re-bootstrap complet sur tout 409 (builderStore.js:288-289) = nouvel appel du GET lourd. Impact bas à moyen (rare).
4. Rendu SVG iso recalculé en entier à chaque mouvement de souris pendant le pan: `panOffset` est lu dans le template (IsoView.vue:37) et les fonctions `drawBox`/`drawRoundedBox`/`getGridH/V` sont appelées DANS le template (IsoView.vue:43-60 grille: `getGridH(i-1)` x4 par ligne x 20 lignes x2, :246-301 dalles/plafonds par étage), donc chaque `mousemove` en pan (handlePanMove, :665-670) relance toute la fonction de rendu, y compris la reconstruction de tous les paths de tous les éléments. Aucun throttle/rAF. Impact moyen (fluidité du pan/zoom sur plan chargé).
5. Pendant un drag d'élément dans le plan 2D, chaque `pointermove` appelle `store.patchElementLocal` (usePlanInteractions.js:113, 131) qui remplace `state.elements[id]`: invalide `zoneToFloor` pour `sortedFloors`, `forecourt` et `externalMerch` (3 recalculs de `store.visibleElementsOfZone`, qui fait `Object.values(state.elements).filter(...)` O(éléments) par zone, builderStore.js:114-124 et IsoView.vue:457-471) et re-rend IsoView entier + PlanCanvas.visibleElements (PlanCanvas.vue:597-603) + ElementListPanel. Pas de rAF. Impact moyen.
6. `feDropShadow` appliqué à l'étage sélectionné (IsoView.vue:31-33, :241): filtre SVG coûteux à repeindre pendant le pan. Impact bas.
7. PATCH d'autosave: la réponse sérialise l'élément avec ses 3 relations pour toutes les configs (element.service.ts:151-154, 169) alors que seul `version` est lu (builderStore.js:283); 2 requêtes DB (updateMany + findFirst include) au lieu de 1 + `invalidateSpaceCache` Redis à chaque patch. Coalescing 500 ms déjà en place (useMutationQueue.js:22), ce qui limite le coût. Impact bas.
8. Listes non virtualisées: ElementListPanel (495 lignes) rend tous les éléments de l'espace sans virtualisation (non relu en détail, non vérifié); PlanCanvas rend tous les `visibleElements` de la zone (:255) et ~(width/5 + length/5) lignes de grille (:230, :241). Impact bas tant que l'espace a < quelques centaines d'éléments.
9. Doublon `departments/fetchDepartments` dispatché dans IsoView (:403) et PlanCanvas (:449) + `buildTools` recalculé dans 2 computed (IsoView.vue:404, PlanCanvas.vue:450). Impact bas.

## A6. Recommandations
| Action | Gain | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Frontend: ne pas refaire un bootstrap complet si le store est hydraté et récent (TTL ou ETag), ou le faire sans bloquer et sans re-hydrater si rien n'a changé | évite 1 GET lourd par retour sur la page | cohérence avec builder v1/autre onglet (commentaire useBuilderBootstrap.js:15-19) | S | useBuilderBootstrap.js |
| Frontend: calculer la géométrie iso dans des `computed` (pas dans le template) et séparer le groupe pan/zoom (transform) du groupe de contenu pour que le pan ne relance pas `drawBox`; ou composant enfant mémoïsé pour les éléments | pan fluide | faible | M | IsoView.vue |
| Frontend: throttler `patchElementLocal` pendant le drag avec requestAnimationFrame | moins de recalculs iso pendant le drag | faible | S | usePlanInteractions.js |
| Frontend: indexer les éléments par zone dans le store (`elementsByZone` computed) au lieu de `Object.values(...).filter` à chaque appel | O(1) par zone | faible | S | builderStore.js:114-124 |
| Backend: alléger le state, charger inventaire/staff/performance par élément à la sélection (endpoint dédié) ou ne renvoyer que la config active | payload et SQL divisés, surtout stades | change le contrat front (hydrate, sections) | L | builder-v2.queries.ts, zone.service.ts, sections inspecteur |
| Backend: cache Redis court (invalide par `invalidateSpaceCache` déjà appelé en écriture) sur GET state | lectures répétées quasi gratuites | invalidation à vérifier (autre builder, Weezevent mapping) | M | zone.service.ts, space-cache.service |
| Backend: PATCH élément qui renvoie seulement `{id, version}` (ou RETURNING version) | -1 requête, -payload par autosave | contrat front (seul `version` lu) | S | element.service.ts:93-170 |
| SQL/index: vérifier EXPLAIN de builderStatePayload, notamment la jointure `OR` sur WeezeventLocation (queries.ts:82-84) et les index MenuAssignment(elementId, enabled), ElementInventory(elementId), ElementStaff(elementId) | selon plan | | S | migrations |

## A7. Points non vérifiés
- Taille réelle de la réponse GET state sur un gros espace (stade) et son temps SQL (EXPLAIN ANALYZE non fait).
- Index existants sur MenuAssignment, ElementInventory, ElementStaff, WeezeventLocationShopMapping.
- Contenu de ElementListPanel, InspectorPanel (chargement différé des sections), StorageInventorySection (779 lignes) et leurs appels API propres (staff-suggestions, menu-item-sales-input, inventory).
- Comportement du store Vuex `departments` (cache, dédoublonnage des 2 dispatch).
- FPS réel du pan/drag, aucun profil navigateur.

---

# PARTIE B. Space Menu (`/menu-fb/space-menus`) et détail shop

## B1. Fiche des pages
- `/menu-fb/space-menus`, nom `space-menus`, composant `SpaceMenuView` importé en lazy (`const SpaceMenuView = () => import(...)`, frontend/src/router/index.js:40), meta `{ title: 'Space Menu', keepAlive: true, permission: 'menu.fb.spaceMenu' }` (index.js:395-399). SpaceMenuView.vue: 1007 lignes.
- `/menu-fb/space-menus/:spaceId/shops/:shopId`, nom `shop-detail`, composant `ShopDetailView` lazy (index.js:41), meta `{ title: 'Shop detail', permission: 'menu.fb.spaceMenu' }`, pas de keepAlive (index.js:402-406). ShopDetailView.vue: 781 lignes.
- Autres vues du dossier: SpaceMenuItemView.vue (287), SpaceMenuShopView.vue (317); drawers: ShopDetailEditDrawer, ShopMenuItemsDrawer, SpaceMenuEditShopDrawer, SpaceMenuShopsDrawer.

## B2. Arbre des composants
| Composant | Fichier | Lignes | Rôle | Monté / différé | Données reçues |
|---|---|---|---|---|---|
| SpaceMenuView | components/menu-fb/views/space-menus/views/SpaceMenuView.vue | 1007 | page: sélecteurs espace/config, bascule shop/menu, drawers | route lazy (router/index.js:40), keepAlive | état local (Options API) |
| SpaceMenuShopView | views/SpaceMenuShopView.vue | 317 | grille des shops | monté si `viewMode === 'shop'` (SpaceMenuView.vue:124-137) | shops, filteredShops |
| SpaceMenuItemView | views/SpaceMenuItemView.vue | 287 | matrice item x shop | monté seulement si `viewMode === 'menu'` (SpaceMenuView.vue:140-156), donc différé | menuItemsByCategory, menuAssignmentMap |
| ShopMenuItemsDrawer, SpaceMenuEditShopDrawer | drawers | non mesuré | tiroirs | importés statiquement (SpaceMenuView.vue:243-244), contenu ouvert à la demande (`drawerOpen`) | selectedShop |
| ShopDetailView | views/ShopDetailView.vue | 781 | détail d'un shop (route séparée `shop-detail`) | route lazy (router/index.js:41), pas de keepAlive | route params spaceId, shopId, query config |

## B3. Appels API
### SpaceMenuView (`/menu-fb/space-menus`)
| Déclencheur | Méthode + URL | Fonction front | Séquentiel / bloque | Cache front | Backend | SQL | Redis | Coût |
|---|---|---|---|---|---|---|---|---|
| mounted + activated (SpaceMenuView.vue:829-852) | GET `/spaces/light` | `getSpacesLight` (api/endpoints/space.api.js:565), `loadSpaces` (:539-557) | 1er maillon de la chaîne, bloque tout le reste (espace non sélectionné) | aucun (état local, rappelé à chaque mounted) | spaces.controller.ts:138-160 -> spaceCrudService.getSpacesLight | non lu | Redis 60 s (description du contrôleur, spaces.controller.ts:141) | bas |
| watcher `selectedSpaceId` (:431-451) | GET `/spaces/:id/configurations` via `spaceConfigurations/fetchForSpace` | `getSpaceConfigurations` (space.api.js:49-52) | 2e maillon, séquentiel | module Vuex SANS cache (« stateless », store/modules/spaceConfigurations.js:11-13): refait à chaque changement d'espace | non lu en détail; TTL Redis configs 30 s (space-cache.service.ts:17) | non lu | 30 s | bas |
| watcher `selectedConfigId` (:458-468) | GET `/spaces/:id/shops?configId=` via `spaceShops/fetchForSpace` | `getSpaceShopList` (space.api.js:108-116) | 3e maillon séquentiel: shops n'arrivent qu'après espaces puis configs; chemin critique de la liste | module Vuex spaceShops: Map cache TTL 15 min par `spaceId::configId` + single-flight (store/modules/spaceShops.js:3-9, 36-58), mais `forceRefresh: true` dans activated() (SpaceMenuView.vue:840-842) | space-shops.controller.ts:45 -> SpaceShopsService.getSpaceShops (services/space-shops.service.ts:45-99) | une requête `spaceShopsPayload` (spaces.queries.ts:5-): CTE avec 4 branches floor/forecourt/externalmerch/zone (UNION), DISTINCT ON, LEFT JOIN LATERAL pour menuItemsCount | Redis 30 s, clé par tenant+espace+config (service.ts:50-54, space-cache.service.ts:16); invalidée à CHAQUE autosave du Builder (support.service.ts:172) | moyen |
| viewMode = 'menu' ou changement d'espace en mode menu (:449-456) | GET `/space-menu/space/:spaceId/items` | `getSpaceMenuItemsWithAvailability` (menu.api.js:586), `loadMenuItemsForSpace` (:588-608) | parallèle avec la matrice; spinner `menuItemsLoading` | aucun | space-menus.controller.ts:459 -> SpaceMenuAvailabilityService.getSpaceMenuItems (caches Map locales par requête uniquement, service:190-248) | calcul de disponibilité serveur (ingrédients, fournisseur, livraison): non lu en détail | aucun Redis trouvé (grep "redis" ne trouve que space-menu-configuration.service.ts) | moyen à haut (calcul par item, non mesuré) |
| viewMode = 'menu' + config (:455, 466) | GET `/space-menu/:spaceId/:configId` | `getSpaceMenuConfiguration` (menu.api.js:470-473), `loadMenuAssignmentsForConfig` (:622-636) | parallèle | aucun | space-menu-configuration.service.ts:35-: `spaceElement.findMany` avec `menuAssignments` imbriqué (:52-70, :125, :211) | SpaceElement + MenuAssignment, matrice complète config | Redis importé (:3), clés dupliquées de MenuItemsService (:21): lecture cache non confirmée | moyen |
| Clic sur un shop (drawer) | selon ShopMenuItemsDrawer (non lu) | | | store `shopMenuItems` | | | | non vérifié |

Le commentaire du code confirme que la page a déjà été optimisée: 1 seul appel `/space-menu/:spaceId/:configId` pour toute la matrice au lieu d'un `/space-menu/shop/:shopId` par shop (SpaceMenuView.vue:616-621), et suppression du fetch shops non scopé (:443-447). Il n'y a donc PAS de N+1 par shop au chargement de la liste.

### ShopDetailView (`/menu-fb/space-menus/:spaceId/shops/:shopId`)
| Déclencheur | Méthode + URL | Fonction front | Séquentiel / bloque | Cache front | Backend | Coût |
|---|---|---|---|---|---|---|
| watcher `shopId` immediate (ShopDetailView.vue:352-357) -> `load()` (:478-510) | GET `/space-menu/shop/:shopId?configId=` | `getShopMenuItems` (menu.api.js:534) | `Promise.all` avec le suivant (parallèle), bloque le rendu: skeleton 6 cartes (:54) | AUCUN (appel direct, pas de store; `shopMenuItems` store non utilisé ici) | space-menus.controller.ts:24 -> ShopMenuService: « tous les produits assignés au shop avec leurs ingrédients, composants et packaging, structure complète imbriquée » (description Swagger du contrôleur) | haut |
| idem | GET `/space-menu/shop/:shopId/items?configId=` | `getShopAvailableMenuItems` (menu.api.js:551) | parallèle | AUCUN | space-menus.controller.ts:221 | moyen |
Le premier appel sert surtout à l'en-tête du shop (nom, type, image, notes) d'après `normalizeShop(shopData)` (:496-498) alors que le second fournit déjà la liste des items et leur statut (commentaire :478-480). L'usage réel de `shopRes.menuItems` n'a pas été vérifié (:510+ non lu).

## B4. Cascade au premier affichage
SpaceMenuView, chaîne STRICTEMENT séquentielle de 3 requêtes avant d'afficher les shops:
- t0: lazy import du chunk, mounted -> `applyRouteQuery()` puis `loadSpaces()` (SpaceMenuView.vue:829-832).
- t1: GET `/spaces/light` répond -> `selectedSpaceId = spaceOptions[0].id` (:547-549) (si pas de deep-link).
- t2: watcher `selectedSpaceId` -> `loadConfigurationsForSpace` -> GET `/spaces/:id/configurations` (pas de cache front).
- t3: `selectedConfigId` fixé (:577) -> watcher -> GET `/spaces/:id/shops?configId=` (cache Vuex 15 min, Redis 30 s) -> `rawShops` -> grille.
- t4 (mode menu seulement): 2 requêtes parallèles `/space-menu/space/:id/items` et `/space-menu/:id/:configId`.
Chemin critique de la liste: 3 RTT en cascade (light -> configurations -> shops). Au retour sur la page (keepAlive): `activated()` relance `forceRefresh: true` sur les shops (contourne le cache 15 min) (:836-851).
ShopDetailView: t0 mount -> t1 `load()` 2 requêtes parallèles -> rendu; pas de cascade, pas de cache.

## B5. Problèmes de performance
1. Cascade séquentielle spaces/light -> configurations -> shops (3 RTT) au premier affichage de Space Menu (SpaceMenuView.vue:547-549, 559-586, 458-464). Impact moyen (somme de 3 latences). Le commentaire de space.queries (getSpaceShops) cite des RTT pooler de 200 ms à 1 s (support.service.ts:~157, cité pour d'autres endpoints): non mesuré ici.
2. `spaceConfigurations/fetchForSpace` sans cache front (spaceConfigurations.js:11-13): rappelé à chaque changement d'espace et à chaque ouverture. Impact bas.
3. `activated()` force un refresh des shops (`forceRefresh: true`, SpaceMenuView.vue:840-842) à chaque retour sur la page keepAlive, ce qui contourne le cache Vuex 15 min; côté Redis le TTL n'est que 30 s et la clé est purgée à chaque autosave du Builder (support.service.ts:172). Impact moyen.
4. ShopDetailView: `GET /space-menu/shop/:shopId` renvoie l'arbre complet (ingrédients, composants, packagings) pour chaque item (Swagger du contrôleur) alors que la page appelle déjà `/shop/:shopId/items` pour la liste; doublon probable. Pas de cache front, 2 appels à chaque ouverture et à chaque retour. Impact moyen à haut selon le nombre d'items. Non vérifié: usage réel de `shopRes.menuItems`.
5. `GET /space-menu/space/:spaceId/items` calcule la disponibilité (ingrédients, fournisseurs, espace) à chaque appel, sans cache Redis trouvé (SpaceMenuAvailabilityService, caches Map locales par requête seulement). Appelé à chaque passage en mode menu et à chaque `activated()` en mode menu (SpaceMenuView.vue:449, 844-846). Impact moyen à haut, non mesuré.
6. `/space-menu/:spaceId/:configId` parcourt tous les SpaceElement de la config avec leurs MenuAssignment (service:52-70); `loadMenuAssignmentsForConfig` relancé à chaque `activated()` et changement de config (:455, 466, 847-849). Impact moyen.
7. Pas de virtualisation: grille de shops (SpaceMenuShopView), matrice items x shops (SpaceMenuItemView, `menuItemsByCategory` trié par `localeCompare`, SpaceMenuView.vue:425-427), `displayedMenuItems` et `attachedMenuItems` dans ShopDetailView (v-for :142, :190). Impact bas à moyen selon la taille des menus (matrice item x shop = produit cartésien visible en DOM). Contenu des deux vues enfants non lu en détail.
8. La requête SQL des shops (spaces.queries.ts:5-) agrège 4 sources (Floor, Forecourt, ExternalMerch, Zone/ConfigurationElement) avec DISTINCT ON et LATERAL: l'écran a un cache Redis 30 s mais rien ne prouve que le plan est bon sur gros espace (EXPLAIN non fait). Impact moyen potentiel.
9. Lien Builder -> Space Menu: chaque PATCH d'autosave du Builder purge Redis `spaces:shops:*`, `configs`, `shopdetails` de l'espace (space-cache.service.ts:61-75), donc le premier affichage de Space Menu/Analyse après une session de Builder repasse par le SQL complet. Impact bas à moyen.

## B6. Recommandations
| Action | Gain | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Frontend: lancer en parallèle configurations et shops quand le deep-link ou le dernier espace est connu; mémoriser le dernier espace/config (localStorage) pour ne pas attendre `/spaces/light` | -1 à -2 RTT sur le chemin critique | cohérence si l'espace est supprimé | M | SpaceMenuView.vue |
| Frontend: ajouter un cache TTL au module `spaceConfigurations` comme `spaceShops` | supprime 1 appel aux allers-retours | invalidation à la création de config (builder) | S | store/modules/spaceConfigurations.js |
| Frontend: `activated()` ne force le refresh que si le cache a plus de N secondes ou si une invalidation est signalée | moins de requêtes au retour sur la page | données un peu moins fraîches | S | SpaceMenuView.vue:836-851 |
| Frontend: ShopDetailView lit le store `shopMenuItems` / cache TTL et n'appelle `/shop/:shopId` (arbre complet) que si nécessaire; ou tirer l'en-tête du shop depuis la liste déjà en cache | -1 appel lourd par ouverture | vérifier l'usage de `shopRes.menuItems` | S à M | ShopDetailView.vue:478-510 |
| Frontend: virtualiser ou paginer la matrice item x shop et les cartes d'items si le nombre dépasse un seuil | DOM allégé | UX | M | SpaceMenuItemView.vue, ShopDetailView.vue |
| Backend: cache Redis court + invalidation sur `/space-menu/space/:spaceId/items` et sur `/space-menu/shop/:shopId/items` | lectures répétées quasi gratuites | invalidation à brancher sur les changements de recettes/fournisseurs | M | space-menu-availability.service.ts |
| Backend: endpoint léger d'en-tête de shop (sans arbre de recette) ou paramètre `light` | payload divisé | contrat | S | space-menus.controller.ts:24 |
| Backend: découpler la purge Redis du Builder (ne purger `shops` que si nom/type/adhésion changent, pas à chaque déplacement x/y) | meilleur taux de hit | oubli d'invalidation | M | builder-v2-support.service.ts:172, space-cache.service.ts |
| SQL/index: EXPLAIN de `spaceShopsPayload` et de `getMenuConfiguration`; vérifier index ConfigurationElement(configId), MenuAssignment(elementId, configId), SpaceElement(zoneId) | selon plan | | S | migrations |

## B7. Points non vérifiés
- Contenu de SpaceMenuShopView, SpaceMenuItemView, ShopMenuItemsDrawer, SpaceMenuEditShopDrawer (computed `shops`/`filteredShops`/`menuItemsByCategory` lignes 312-428 de SpaceMenuView non lus en détail).
- Usage de `shopRes.menuItems` dans ShopDetailView après la ligne 510, et computed `displayedMenuItems`.
- Backend: ShopMenuService (`GET shop/:shopId` et `shop/:shopId/items`), cache Redis éventuel, requêtes Prisma imbriquées; getSpacesLight et GET `/spaces/:id/configurations` côté SQL.
- Durées réelles (Network), taille des réponses, EXPLAIN sur Config/Floor/Zone/ConfigurationElement/MenuAssignment.
- Aucune mesure n'a été faite: toutes les durées citées viennent des commentaires du code.
