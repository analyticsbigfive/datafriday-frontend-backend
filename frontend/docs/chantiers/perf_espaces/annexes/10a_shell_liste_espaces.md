# 10a. Shell commun des pages d'espace + liste des espaces

Chemins relatifs à la racine du dépôt. Preuves au format fichier:ligne. Les durées citées viennent des commentaires du code, jamais mesurées ici.
Ce qui n'a pas été lu est marqué "non vérifié" (voir section 7). Aucune écriture dans le dépôt.

## 1. Fiche de la page

### 1.1 Shell commun (chargé pour toutes les pages d'espace)
| Fichier | Lignes | Rôle |
|---|---|---|
| frontend/src/main.js | 20 | bootstrap Vue: router, store, vuetify, directive `can`, CSS bootstrap complet + index.css + style.css + styles/workspace-ui.css (main.js:1-20) |
| frontend/src/App.vue | 564 | racine `<v-app>`: router-view + RouteTransitionLoader, GlobalConfirmDialog, Toaster, 2x SyncJobFloatingWidget, GlobalLiveIndicator (App.vue:1-34) |
| frontend/src/views/DashboardView.vue | 1260 | layout parent de `/dashboard` (barre, drawer, menu), `RouterView` + keep-alive (DashboardView.vue:313-335) |
| frontend/src/router/index.js | 687 | routes, `beforeEach` permission, `afterEach` titre / robots / chunk reload |
| frontend/src/router/guards.js | 273 | guards d'accès |
| frontend/vue.config.js | 195 | build, PWA workbox, splitChunks |
| frontend/src/store/modules/spaces.js | 71 | cache Vuex de la liste des espaces (TTL 15 min, spaces.js:3) |
| frontend/src/store/modules/auth.js | 798 | `initialize`, `fetchCurrentUser`, permissions |
| frontend/src/composables/useGlobalLiveIndicator.js | 126 | singleton SSE `/live/stream` |
| frontend/src/store/modules/serverNotifications.js | 156 | notifications serveur |
| frontend/src/components/space-workspace/shared/ | 6 .vue à la racine (DeltaPill 110, EventTimelineChart 947, KpiCard 207, LiveInventoryPanel 858, LogisticMovementDialog 601, LogisticSimulateSaleDialog 361) + sous-dossier `live-inventory/` | composants partagés, appels réseau non vérifiés |

### 1.2 Routes
| Route | Nom | Composant | Garde | Meta |
|---|---|---|---|---|
| `/dashboard` | dashboard | DashboardView (lazy, router/index.js:18) | `requireOrganization` (index.js:186) | redirect `/spaces` (index.js:188) |
| `/spaces` | spaces | SpaceListView (lazy, index.js:19) | `spacesListEntryGuard` (index.js:194) | keepAlive: true (index.js:195) |
| `/spaces-overview` | spaces-overview | SpacesOverviewView (lazy, index.js:201) | aucune | keepAlive: true (index.js:202) |
| `/spaces/:spaceId` | space-analyse | AnalyseView (lazy) | `spaceEntryGuard` (index.js:211) | PAS de keepAlive (index.js:212) |
| `/spaces/:spaceId/predict` | space-predict | SpacePredictView | via `beforeEach` | keepAlive, `front.fb.eventPredict` (index.js:231) |
| `/spaces/:spaceId/inventory`, `/pre-inventory` | space-inventory, space-pre-inventory | SpaceInventoryView (2 instances) | `beforeEach` | keepAlive, `front.fb.spaceInventory` (index.js:238, 248) |
| `/spaces/:spaceId/logistic`, `/restock`, `/live` | | | `beforeEach` | keepAlive (index.js:255, 262, 279) |
| `/spaces/:spaceId/builder`, `/pos`, `/cost-tracking` | | | `beforeEach` | sans keepAlive (index.js:224, 287, 295) |

`SpacesOverviewView.vue` (46 lignes): enveloppe de `components/SpacesPage.vue` (1718 lignes, non lu) avec 11 callbacks sur 14 réduits à `noop` (SpacesOverviewView.vue:3-15).

## 2. Arbre des composants
| Composant | Fichier | Lignes | Rôle | Monté ou différé | Données |
|---|---|---|---|---|---|
| App | frontend/src/App.vue | 564 | racine | eager (app.js) | store |
| RouteTransitionLoader | frontend/src/components/RouteTransitionLoader.vue | 213 | loader de transition | monté toujours (App.vue:5) | non vérifié |
| GlobalConfirmDialog | frontend/src/components/GlobalConfirmDialog.vue | non lu | dialogue global | monté toujours | non vérifié |
| Toaster (vue-sonner) | lib | | toasts | monté toujours + CSS importé (App.vue:37-38) | |
| SyncJobFloatingWidget x2 | frontend/src/components/SyncJobFloatingWidget.vue | 296 | widget sync Weezevent et Digifood | monté toujours (App.vue:16, 21) | commentaire: "s'auto-active via localStorage" (App.vue:14); appels non vérifiés |
| GlobalLiveIndicator | frontend/src/components/common/GlobalLiveIndicator.vue | 38 | ouvre le SSE global | monté toujours (App.vue:31) | userId |
| DashboardView | frontend/src/views/DashboardView.vue | 1260 | barre + drawer + RouterView | lazy, chargé à l'entrée dans `/dashboard` | auth, spaces |
| NotificationBell, LiveBadge | components/NotificationBell.vue, components/common/LiveBadge.vue | non lus | en-tête | import statique dans DashboardView (DashboardView.vue:344-345) | |
| SpaceListView | frontend/src/components/spaces/views/SpaceListView.vue | 1140 | liste `/spaces` | lazy | store spaces |
| SpaceStats | .../spaces/widgets/SpaceStats.vue | 213 | bandeau totaux | monté à l'ouverture (SpaceListView.vue:11) | props sommées côté client (SpaceListView.vue:398-408), `v-can stats.financial.view` |
| SpaceItem (par carte) | .../spaces/widgets/SpaceItem.vue | 456 | carte d'espace | une instance par carte visible (SpaceListView.vue:166) | `space` |
| SpaceCreateDrawer, SpaceDeleteDialog, SpaceMobileFilterSheet | .../spaces/drawers, dialogs | non lus | création / suppression / filtres mobile | import STATIQUE dans SpaceListView (SpaceListView.vue:298-300), `v-if="canEditSpace"` pour le drawer (l.233) | |
| SpacesPage | frontend/src/components/SpacesPage.vue | 1718 | contenu de `/spaces-overview` | lazy via la vue | non vérifié |

## 3. Appels API, composant par composant

### 3.1 Démarrage à froid (auth) : séquentiel, bloque la 1re navigation
| Déclencheur | Appel | Fonction front | Séq./Par. | Cache front | Backend | Coût |
|---|---|---|---|---|---|---|
| 1re navigation, guard `requireOrganization` si `auth/isInitialized` faux (guards.js:19-21) | `supabase.auth.getSession()` | `getSessionOnce` dédupliqué (lib/supabase.js:32-37), appelé par `auth/initialize` (auth.js:555) | lecture locale du stockage, refresh possible | Promesse partagée | Supabase | bas |
| idem, enchaîné | GET `/onboarding/status` | `checkOnboardingStatus` (auth.js:568), dédupliqué (auth.js:292) | SÉQUENTIEL, attendu | store auth | `backend/src/features/onboarding/onboarding.controller.ts` (non lu en détail) | non vérifié |
| idem, enchaîné après le statut si `hasOrganization` | GET `/me` | `fetchCurrentUser` (auth.js:569-570, 498), dédupliqué (auth.js:492) | SÉQUENTIEL, attendu, erreur ignorée | store auth (rôle, permissions, isOwner, isSuperAdmin: auth.js:514-528) | `backend/src/features/me/me.controller.ts` (non lu) | non vérifié |

`checkOnboardingStatus` pose déjà tenant, rôle et permissions depuis `/onboarding/status` (auth.js:296-313), puis `/me` les réécrit (auth.js:517-528): redondance partielle, `/me` apporte le profil, `isOwner`, `isSuperAdmin`.
Navigations suivantes: `isInitialized` vrai, plus aucun appel. `onAuthStateChange` ne rappelle pas ces deux endpoints pour le même utilisateur déjà résolu (auth.js:591-599).
L'intercepteur Axios appelle `getSessionOnce()` (api/client.js:130-131) sur la branche sans jeton en mémoire (condition exacte non lue).

### 3.2 Guards et `beforeEach`
| Guard | Réseau | Preuve |
|---|---|---|
| `router.beforeEach` (routes avec `meta.permission`) | `auth/initialize` seulement si non initialisé, ensuite lecture du getter `auth/can` | index.js:626-643 |
| `requireOrganization`, `requireOwner`, `requireSuperAdmin`, `guestOnly` | idem, aucun appel après l'init | guards.js:10-86, 130-149 |
| `onboardingGuard` | `checkOnboardingStatus` si pas d'organisation dans le store | guards.js:107-117 |
| `spaceEntryGuard` | aucun (getter `can`) | guards.js:215-233 |
| `spacesListEntryGuard` | `spaces/fetchSpaces` ATTENDU, seulement à l'atterrissage (`from.name` vide ou login/signup/reset-password/onboarding), sinon `next()` direct | guards.js:238-273 |
| `requireGuestPinSession` | `guestPin/restore`, "revalide toujours contre le backend" (commentaire), à chaque navigation invité | guards.js:172-176 |

`requireOrganization` est un `beforeEnter` du parent `/dashboard` (index.js:186): selon la sémantique vue-router 4 (non vérifiée dans node_modules), il ne se rejoue pas en naviguant entre enfants.

### 3.3 Liste des espaces `/spaces` (SpaceListView)
| Déclencheur | Appel | Fonction front | Séq./Par. | Cache front | Contrôleur + service backend | Tables / SQL | Cache Redis | Payload | Coût |
|---|---|---|---|---|---|---|---|---|---|
| `mounted` (SpaceListView.vue:506-508) et guard d'atterrissage (guards.js:262) | GET `/spaces?limit=100` | `getAllSpaces` (api/endpoints/space.api.js:547-552) via `spaces/fetchSpaces` (spaces.js:43-53) | bloque l'affichage (skeleton `v-if="loading"`, SpaceListView.vue:111) seulement si le cache est vide ou expiré | Vuex `spaces.list`, TTL 15 min (spaces.js:3, 16-17); bouton rafraîchir force (SpaceListView.vue:69) | `backend/src/features/spaces/spaces.controller.ts:127` puis `services/space-crud.service.ts:123-231` | `space.findMany` + `space.count` en parallèle (l.157-200, 24 colonnes + `_count` configs et pinnedByUsers), puis `revenueSummary.getSummaries` (l.201) : lecture Redis par espace, calcul SQL des manquants sur `SeasonSpace`, `Season`, `SpaceRevenueMinuteAgg`, `SpaceElement`, `Event` (space-revenue-summary.queries.ts:22-62) | liste complète `spaces:list` NON utilisée pour ce appel (l.136: seulement `page===1 && limit===10 && !search && accès complet`); résumés CA par espace: TTL 5 min (space-revenue-summary.service.ts:17) | jusqu'à 100 espaces x ~30 champs + 7 champs financiers | moyen |
| `mounted` de chaque `SpaceItem` (SpaceItem.vue:231-233, 206-215) | GET `/spaces/:id/live-status` | `getSpaceLiveStatus` (space.api.js:31-34) | N appels parallèles (un par carte visible), uniquement si `canLive` | aucun (la carte ne lit pas le singleton SSE pour l'init, `isLive` local) | `space-analytics.controller.ts:204-233` puis `spaceShopsService.getLiveStatus` (non lu) | non vérifié | non vérifié | petit | moyen (N requêtes) |
| clic poubelle (suppression) | GET mapping + DELETE | `_cleanupSpaceMappings` (SpaceListView.vue:461-466) | à la demande | | | | | | bas |

La pagination de la liste est côté client (`currentPage`, `pageCount`: SpaceListView.vue:497-503); la taille de page n'a pas été lue, donc le nombre exact de `SpaceItem` montés est non vérifié.

### 3.4 Shell permanent (App.vue, monté pour toutes les pages)
| Déclencheur | Appel | Fonction front | Séq./Par. | Cache | Backend | Coût |
|---|---|---|---|---|---|---|
| `watch auth/userId immediate` (App.vue:71-75) | GET notifications | `serverNotifications/startPolling` -> `fetch` (serverNotifications.js:129-132, 77-81) | en fond, erreurs silencieuses | store, pas de TTL | `backend/src/features/notifications` (non lu) | bas |
| `watch auth/userId immediate` (GlobalLiveIndicator.vue:19-23) | SSE GET `/live/stream` (une seule connexion pour tous les espaces) | `useGlobalLiveIndicator().start` (useGlobalLiveIndicator.js:85-90) | permanent, tant qu'authentifié | singleton module (useGlobalLiveIndicator.js:33-34) | `backend/src/features/live/live.controller.ts:33` (`@Sse('stream')`) | connexion longue (une par onglet) |
| message SSE `kind: notification` | GET notifications | `onNotification` -> `serverNotifications/fetch` (GlobalLiveIndicator.vue:27) | par signal | | | bas |
| message SSE avec `spaceId` | GET `/spaces/:id/live-status` | `verifySpace` (useGlobalLiveIndicator.js:62-74) | throttle 30 s par espace (l.27, 64) | Map `lastSeenBySpace`, fenêtre 30 min (l.22) | idem 3.3 | par message, borné |
| SSE coupé | poll GET notifications toutes les 30 s | `setStreamConnected(false)` (serverNotifications.js:140-142) | timer | | | bas |
| `setInterval` prune | aucun réseau, 60 s | useGlobalLiveIndicator.js:23, 89 | | | | bas |

### 3.5 DashboardView (menu, drawer)
- Aucun appel réseau au montage, seul `spaces/fetchSpaces` à l'ouverture du drawer Settings (DashboardView.vue:610-616), servi par le cache Vuex TTL 15 min.
- Menu: `visibleMainNavigation` et `visibleSettingsNavigation` sont des computed qui filtrent `MAIN_NAVIGATION` / `SETTINGS_NAVIGATION` par `can()` (DashboardView.vue:537-599), sans réseau. Le groupe "Edit space" lit `spaces/spaces` (l.554-562).
- Keep-alive: `<keep-alive v-if="route.meta.keepAlive" :key="keepAliveScope" :max="6">` avec `:key="route.name"` pour l'enfant (DashboardView.vue:325-327). Sinon `<component :key="route.path">` (l.334). `keepAliveScope` = dernier `spaceId` vu (l.470, 623-625): changer d'espace change la clé du keep-alive, donc vide tout le cache.
- La note du code précise que clé `fullPath` remontait la vue entière avec "loadSpace + loadAll, ~17 s de backend" (commentaire DashboardView.vue:328-333, durée du code, non mesurée ici).

### 3.6 composants space-workspace/shared/
Non lus ligne à ligne. Tailles ci-dessus. Aucun appel confirmé, voir section 7.

## 4. Cascade au premier affichage (atterrissage sur `/spaces`, cache froid)
| t | Événement | Bloque |
|---|---|---|
| t0 | téléchargement `app.js` + `chunk-vendors` + `vendor-vuetify` (+ CSS bootstrap complet, main.js:10) ; parse | tout |
| t1 | `createApp.mount` ; App monte aussitôt RouteTransitionLoader, Toaster, 2 SyncJobFloatingWidget, GlobalLiveIndicator (App.vue:1-34) | |
| t2 | 1re navigation: `requireOrganization` -> `auth/initialize` -> getSession (local) | rendu de la route |
| t3 | GET `/onboarding/status` (attendu) | rendu |
| t4 | GET `/me` (attendu, après t3) | rendu |
| t5 | `spacesListEntryGuard` (atterrissage): GET `/spaces?limit=100` attendu (guards.js:262) | rendu |
| t6 | résolution des composants lazy DashboardView + SpaceListView (ordre standard vue-router 4: guards puis chunks, non vérifié dans node_modules; le préchargement par défaut de Vue CLI peut les avoir déjà en cache) | rendu |
| t7 | mount DashboardView, SpaceListView: cache Vuex valide donc pas de second GET (spaces.js:45); SpaceItem x N: N GET `/live-status` si `canLive` | skeleton non bloquant |
| t7' | en parallèle: userId connu -> GET notifications + ouverture SSE `/live/stream` (déclenchés dès t4, car `auth/userId` est posé à `initialize`) | non bloquant |
Chemin critique: t2 -> t3 -> t4 -> t5 -> t6 (4 allers-retours réseau séquentiels, plus le téléchargement des chunks lazy si non préchargés).
Navigation interne ultérieure (hors atterrissage): aucun appel dans les guards; le coût vient uniquement de la page cible. Retour sur `/spaces` ou `/spaces-overview`: composant gardé vivant (keepAlive), pas de remontée (pas de hook `activated` lu dans SpaceListView, `mounted` unique, SpaceListView.vue:506).

## 5. Problèmes de performance
1. **`GET /spaces?limit=100` n'est jamais servi par le cache Redis de liste.** Le cache n'est appliqué que pour `page===1 && limit===10 && !search && accès complet` (space-crud.service.ts:136), alors que le front demande toujours `limit: 100` (space.api.js:552). Chaque expiration du TTL Vuex de 15 min (spaces.js:3), chaque bouton rafraîchir (SpaceListView.vue:69), chaque atterrissage à froid refait findMany + count + lecture Redis par espace (+ SQL pour les espaces dont le résumé 5 min a expiré). Le commentaire du front le dit lui-même ("uncached (at limit>10)", space.api.js:562). Impact moyen. Pages: `/spaces`, atterrissage mono-espace (redirigé), groupe "Edit space".
2. **Cascade auth séquentielle sur le chemin critique.** `/onboarding/status` puis `/me`, attendus l'un après l'autre (auth.js:568-570), puis `/spaces` (guards.js:262), avant même que les chunks lazy de Dashboard et de la liste soient demandés. Une latence réseau multipliée par 3 à 4 sur chaque ouverture de l'application. `/onboarding/status` renvoie déjà rôle et permissions (auth.js:296-313). Impact haut sur le premier affichage. Toutes les pages.
3. **N appels `/spaces/:id/live-status` au montage des cartes** (SpaceItem.vue:206-233) alors qu'un SSE global unique existe déjà et que le singleton expose `isSpaceLive` (useGlobalLiveIndicator.js:102-104). L'initialisation par carte rejoue donc ce que le flux sait déjà, et `verifySpace` rappelle le même endpoint sur chaque message SSE (useGlobalLiveIndicator.js:62-82). Impact moyen. Page: `/spaces`.
4. **Analyse (`space-analyse`) n'est pas en keep-alive** (index.js:212) alors que 33 routes le sont (commentaire DashboardView.vue:315-317): chaque retour sur Analyse depuis un autre outil remonte la vue et relance son chargement. Le coût réel de ce chargement relève de l'agent Analyse (non vérifié ici). Impact haut possible. Pages: Analyse.
5. **Changement d'espace: cache keep-alive entièrement détruit** (clé `keepAliveScope`, DashboardView.vue:325, 623-625) ; choix volontaire (commentaire l.319-324) pour éviter l'état d'un autre espace, mais chaque outil (max 6) est remonté et recharge ses données. Impact moyen. Toutes les pages d'espace.
6. **Shell toujours monté et eager**: 2 SyncJobFloatingWidget, GlobalConfirmDialog, RouteTransitionLoader, Toaster + `vue-sonner/style.css`, import de `aggregation.api.js` dans App.vue:44 (taille du module non lue), bootstrap.min.css complet en eager (main.js:10) alors que le JS a été retiré (main.js:7-9). Le commentaire du routeur indique que `app.js` valait 953 Ko avant la mise en lazy des vues (index.js:6-9, valeur du code, non remesurée). Impact moyen (poids initial). Toutes les pages.
7. **Import statiques lourds dans la liste**: SpaceCreateDrawer, SpaceDeleteDialog, SpaceMobileFilterSheet, 13 icônes lucide chargés avec le chunk de la liste (SpaceListView.vue:277-300) alors que le drawer n'est utile que pour le rôle `canEditSpace`. Impact bas à moyen (taille du chunk non mesurée).
8. **`fetchSpaces` ne renvoie pas la promesse en vol**: si `isFetching`, retour immédiat (spaces.js:44). Un second appelant (ouverture du drawer Settings, ou `mounted` de la liste) croit les données prêtes et la liste peut afficher son état vide avant la fin du premier appel. Impact bas (affichage trompeur, pas de coût réseau).
9. **Prefetch par défaut**: aucun `chainWebpack` / désactivation de `prefetch` dans vue.config.js, donc Vue CLI émet des `<link rel="prefetch">` pour les chunks lazy (comportement par défaut, non vérifié dans `dist`). Peut concurrencer la bande passante sur mobile ; les chunks lazy ne sont pas précachés par le SW (vue.config.js:119-128) mais passent en StaleWhileRevalidate (l.131-139). Impact à mesurer.
10. **Doublon de clé `historyApiFallback`** dans `devServer` (vue.config.js:58 et 62) alors que le commentaire l.53-56 dit qu'il n'y en a qu'un. Dev uniquement, aucun effet en production. Impact bas.

## 6. Recommandations
| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| FRONT: lancer `/me` en parallèle de `/onboarding/status` (ou ne plus l'attendre quand le statut a déjà posé permissions et organisation), l'attendre seulement pour les guards qui lisent `isOwner` / `isSuperAdmin` | une latence réseau en moins sur chaque ouverture à froid | `isOwner` nécessaire à `requireOwner` (guards.js:81) et `isSuperAdmin` à `requireSuperAdmin` (guards.js:55) | S | frontend/src/store/modules/auth.js (550-572), guards.js |
| FRONT: démarrer le chargement des chunks Dashboard / liste pendant que les guards attendent le réseau (appeler les fonctions `import()` en tête de guard ou précharger sur idle) | supprime la cascade guards puis chunks | double chargement si redirection | S | frontend/src/router/index.js, guards.js |
| BACKEND: mettre en cache `GET /spaces` aussi pour `limit` 100 (clé par tenant + page + limit, accès complet sans recherche), invalidation par `SpaceCacheService` | supprime findMany + count + N lectures Redis à chaque atterrissage / rafraîchissement | oublier une invalidation donne une liste périmée (TTL court en filet) | S/M | backend/src/features/spaces/services/space-crud.service.ts (136-139, 220-225), space-cache.service.ts |
| FRONT: SpaceItem lit `isSpaceLive(spaceId)` du singleton SSE à la place de `checkLiveStatus` ; ou BACKEND un endpoint batch `GET /spaces/live-status` | N requêtes en moins à l'ouverture de la liste | la sémantique "vente réelle récente" doit rester celle de `getLiveStatus` (useGlobalLiveIndicator.js:58-60) | M | frontend/src/components/spaces/widgets/SpaceItem.vue (206-233), useGlobalLiveIndicator.js ; backend space-analytics.controller.ts + space-shops.service |
| FRONT: évaluer le keep-alive d'Analyse (avec les garde-fous BUG-285 `:max`) | retours instantanés sur l'outil le plus utilisé | mémoire (charts), données périmées, nécessite validation produit | S (+ validation) | frontend/src/router/index.js:212, DashboardView.vue:325 |
| FRONT: rendre `SpaceCreateDrawer`, `SpaceDeleteDialog`, `SpaceMobileFilterSheet` asynchrones (`defineAsyncComponent`) | chunk de la liste plus léger | flash à la première ouverture | S | SpaceListView.vue:298-300 |
| FRONT: `fetchSpaces` renvoie la promesse en vol | supprime l'état vide transitoire | faible | S | frontend/src/store/modules/spaces.js:44 |
| BUILD: inspecter le build (taille de `app.js`, liste des prefetch) puis restreindre le prefetch aux chunks utiles ; différer les widgets globaux hors authentifié (login) | initial plus léger | à mesurer | M | frontend/vue.config.js, App.vue |
| SQL/index: aucune action avant EXPLAIN de `getSummaries` et de `getLiveStatus` | | | | voir section 7 |

## 7. Points non vérifiés
- Temps réels (Network): durée de `/onboarding/status`, `/me`, `/spaces?limit=100`, `/live-status`; taille réelle de la réponse `/spaces?limit=100`; taille réelle de `app.js` et nombre de `<link rel="prefetch">` dans le `dist`.
- Backend non lu: `onboarding.controller.ts` et son service, `me.controller.ts`, `notifications` (liste), `live.controller.ts` (SSE, souscription pattern), `spaceShopsService.getLiveStatus` (SQL), `SpaceAccessService.getAccessibleSpaceIds`. EXPLAIN à faire sur les requêtes de `space-revenue-summary.queries.ts` (SpaceRevenueMinuteAgg, Event, SeasonSpace) et sur `getLiveStatus` avant toute conclusion SQL.
- Frontend non lus: `components/SpacesPage.vue` (1718 lignes, tout le coût de `/spaces-overview`), `SyncJobFloatingWidget.vue`, `RouteTransitionLoader.vue`, `GlobalConfirmDialog.vue`, `NotificationBell.vue`, `LiveBadge.vue`, `plugins/permissions.js`, `plugins/vuetify.js` (import complet ou tree-shaking, le commentaire de vue.config.js l.172 dit tree-shaking actif), `i18n/translations.js` (poids du dictionnaire), `constants/navigation.js`, `utils/chunkReload.js`, l'intercepteur Axios (condition de l'appel `getSessionOnce`, api/client.js:124-141), les 6 composants `space-workspace/shared/` et le dossier `live-inventory/` (appels réseau éventuels de LiveInventoryPanel, LogisticMovementDialog, LogisticSimulateSaleDialog).
- Taille de page de la liste côté client (donc nombre de `SpaceItem` et de `/live-status` au montage).
- Sémantique vue-router 4 supposée: ordre guards puis résolution des composants lazy, et non-rejeu du `beforeEnter` parent en navigation entre enfants (non vérifié dans node_modules).
- Service worker: seulement la configuration workbox (vue.config.js:110-150) ; enregistrement du SW et stratégie du `index.html` non vérifiés.
