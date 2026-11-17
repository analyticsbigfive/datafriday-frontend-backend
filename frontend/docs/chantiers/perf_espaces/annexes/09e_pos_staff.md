# 09e. POS staff (configuration des caisses par PdV et par évènement, /spaces/:spaceId/pos)

Rapport de performance, lecture seule. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code et sont signalées comme telles. Ce qui n'est pas lu est marqué "non vérifié". Complète `09b_pos.md` (caisse invité /pdv/pos, déjà couverte, non refaite ici).

## 1. Fiche de la page

- Route `/spaces/:spaceId/pos`, nom `space-pos`, composant lazy `frontend/src/components/space-workspace/pos/views/SpacePosView.vue` (290 lignes), meta `{ title: 'POS', permission: 'front.fb.pos' }`, pas de `keepAlive`, pas de `beforeEnter` propre (source: `09b_pos.md` section 1.1, citant `frontend/src/router/index.js:283-287`, non relu ici).
- `SpacePosView.vue` est une coquille d'orchestration: `<v-app>` + `WorkspaceAppHeader` + trois colonnes (gauche filtres, centre, droite réglages). Elle instancie 6 composables au setup (`SpacePosView.vue:151-157`): `usePosPage`, `usePosPdvFilters`, `usePosPdvActions`, `usePosSettings`, `usePosHrPersons`, `usePosPinSheet`.
- Fichiers frontend (lignes): SpacePosView 290, `frontend/src/api/endpoints/pos.api.js` 154, `frontend/src/store/modules/pos.js` 234, composables `usePosPage` 133, `usePosPdvFilters` 97, `usePosPdvActions` 86, `usePosSettings` 103, `usePosHrPersons` 47, `usePosPinSheet` 68, `usePosSalesHistory` 98, `usePosFormat` 58, `usePostEventDraftScheduler` 69 (ce dernier n'est pas un composable POS, hors périmètre).
- Backend: `backend/src/features/pos/config/` (contrôleur, services events, settings, pdv-reader, sales-summary, csv).

## 2. Arbre des composants

Légende de la colonne Rôle: "lu" = fichier lu (en entier ou en grande partie); "en-tête" = seulement le commentaire d'en-tête du script relevé par grep, le reste du fichier non lu. Les chemins `Pos*.vue` sont sous `frontend/src/components/space-workspace/pos/`.

| Composant | Fichier | Lignes | Rôle | Monté / différé | Props / données |
|---|---|---|---|---|---|
| SpacePosView | views/SpacePosView.vue | 290 | lu: coque `v-app`, assemble 3 colonnes, instancie 6 composables, lance `hr.load()` et `loadMethods()` au mount (l.193-196), remet les filtres à zéro au changement d'évènement (l.199) | route lazy; 6 enfants importés STATIQUEMENT (l.131-138) | aucune (spaceId via route) |
| PosBand | PosBand.vue | 135 | lu: bandeau rouge (sélecteur d'évènement, résumé PIN, ▶/■ global, impression) | monté dès l'ouverture | events, selectedEventId, isLive, compteurs PIN, bulkWorking, leftOpen/rightOpen |
| PosEventPicker | PosEventPicker.vue | 99 | en-tête: sélecteur d'évènement, un `v-for` sur les évènements (100 max) | dans PosBand | events, modelValue |
| PosPinSummary | PosPinSummary.vue | 100 | en-tête: ligne "N PIN" et boutons ▶/■ pour toutes les caisses | dans PosBand | activeCount, isLive, working |
| PosPrintMenu | PosPrintMenu.vue | 55 | en-tête: menu "Imprimer les PIN" (fiches QR + PIN) | dans PosBand | startedCount, allCount |
| PosLeftColumn | PosLeftColumn.vue | 49 | en-tête: colonne gauche, sélecteur d'outils et filtres | `v-if="leftOpen"` (ouvert si largeur >= 1100 px, calculé une fois, `SpacePosView.vue:146-147`) | options et sélections de filtres |
| PosFilterCard | PosFilterCard.vue | 146 | en-tête: cases type de PdV et pastilles Space Menu, 2 `v-for` | dans la colonne gauche | options dérivées des PdV (`countBy`) |
| PosCollapsibleCard | PosCollapsibleCard.vue | 88 | en-tête: carte repliable réutilisée | dans les colonnes | slot |
| AppSearchBar | components/common/AppSearchBar.vue | non lu | barre de recherche | `v-if tab==='pdv'` (l.37) | v-model `filters.search` (filtrage synchrone à chaque frappe, sans debounce, voir problème 9) |
| PosTabs | PosTabs.vue | 146 | en-tête: onglets PdV / Historique + chips Actives / Inactives | `v-if selectedEventId` (l.60) | pdvCount, salesCount, activeCount, inactiveCount, statusFilter |
| PosPdvList | PosPdvList.vue | 63 | lu: une `PosPdvCard` par PdV filtré (`v-for`, clé `elementId`), non virtualisé, barre de progression si `detailFetching`, puis `PosAccessWarning` | `v-if tab==='pdv'` (l.72) | pdvs, hrOptions (TOUTES les personnes RH, passées à chaque carte), working, loading |
| PosPdvCard | PosPdvCard.vue | 196 | lu (110 premières lignes): carte d'un PdV, pastille de statut, méta, responsable, QR, PIN, ▶/■, ouvrir la caisse; 3 computed légers | une par PdV de la configuration | pdv (objet PosPdvRow), hrOptions, flags |
| PosResponsibleSelect | PosResponsibleSelect.vue | 79 | lu: `v-menu` + `v-list` avec `v-for person in options` (toutes les personnes RH) | un par PdV; contenu du menu à l'ouverture si Vuetify l'applique par défaut (non vérifié) | responsibleId, options |
| PosPdvQrActions | PosPdvQrActions.vue | 55 | lu: bouton QR + `GuestPinQrDialog` | un dialog PAR PdV, instancié dès le rendu de la carte (`v-model=qrOpen`, l.7) | slug, name |
| GuestPinQrDialog | components/guest-pin-manage/dialogs/GuestPinQrDialog.vue | 223 | lu partiellement: dialog Options API, `QRCode.toCanvas` (lib `qrcode`) seulement quand `modelValue` passe à vrai (l.91-98, 101-109) | un par PdV, dessin à l'ouverture | modelValue, slug, elementName |
| PosPinBadge | PosPinBadge.vue | 79 | en-tête: PIN à 6 chiffres, bouton nouveau PIN | `v-if active && pdv.pin` | pin, canReset |
| PosAccessWarning | PosAccessWarning.vue | 33 | en-tête: rappel "les sources s'additionnent" | fin de liste | aucune |
| PosSalesHistory | PosSalesHistory.vue | 89 | lu: filtres, résumé, tableau, "charger plus"; instancie `usePosSalesHistory`; `watch(eventId, load, { immediate })` (l.53-57) | `v-else` de l'onglet PdV (`SpacePosView.vue:86`): détruit et recréé à chaque bascule d'onglet | spaceId, eventId, pdvs, methods, isLive |
| PosSalesFilters | PosSalesFilters.vue | 144 | en-tête: chips PdV et moyens de paiement, recherche, export CSV, 2 `v-for` | dans l'historique | pdvs, methods |
| PosSalesTable | PosSalesTable.vue | 127 | lu (80 premières lignes): grille CSS de 8 colonnes, `v-for sale in rows` NON virtualisé (l.15), `paymentsLabel` appelé par ligne | dans l'historique | rows (cumul de pages de 50) |
| PosRightColumn | PosRightColumn.vue | 47 | en-tête: colonne droite (ventes par PdV, réglages, stock) | `v-if="rightOpen"` (ouvert si largeur >= 1100 px) | pdvs, totalRevenue, settings, methods, selectedIds |
| PosSalesSummaryCard | PosSalesSummaryCard.vue | 128 | en-tête: CA par PdV avec barre relative, un `v-for` sur les PdV | dans la colonne droite | pdvs |
| PosSettingsCard / PosSettingRow / PosLowStockField / PosPaymentMethodsList | 86 / 53 / 56 / 39 | réglages de caisse (promos, annulation, seuil stock bas à la validation du champ, moyens de paiement) | dans la colonne droite | settings, methods |
| PosStockCard | PosStockCard.vue | 24 | en-tête: simple rappel du lien POS / stock Logistic, sans donnée | dans la colonne droite | aucune |

Composables: `usePosPage` (133, orchestration, minuteur 30 s), `usePosPdvFilters` (97, 5 computed en chaîne: `typeOptions`, `menuOptions`, `base`, `activeCount`, `shown`), `usePosPdvActions` (86), `usePosSettings` (103), `usePosHrPersons` (47, état module-level), `usePosSalesHistory` (98), `usePosPinSheet` (68, non lu), `usePosFormat` (58, non lu). Le contenu intérieur des 4 composants de réglages, de `PosTabs`, `PosFilterCard`, `PosSalesFilters` et `PosSalesSummaryCard` n'a pas été lu au-delà de l'en-tête: non vérifié.

## 3. Appels API, composant par composant

Tous les appels passent par `frontend/src/api/endpoints/pos.api.js` (client Axios partagé, timeout 60 s d'après `09b_pos.md`, `client.js:18`). Aucun composant `.vue` ne fait d'appel réseau directement: tout passe par composable puis store `pos` (sauf `usePosHrPersons` qui appelle l'API sans store, et `paymentMethods` via son propre store).

### 3.1 Côté frontend

| Déclencheur | Méthode + URL | Fonction front | Séquentiel / bloque | Cache front | Payload |
|---|---|---|---|---|---|
| mount de `SpacePosView` (via `usePosPage.onMounted`) | `store.dispatch('spaces/fetchSpaces')` (non attendu, `.catch` vide) | `usePosPage.js:68` | non bloquant | store `spaces` (non lu) | non vérifié |
| mount, `init()` | GET `/pos/:spaceId/events` | `usePosPage.js:69` -> `pos.js:126-138` -> `pos.api.js:26-33` | BLOQUE `loading` et donc le détail (étape suivante dépend de la liste) | `force: true` ici: le cache 15 min du store (`pos.js:15, 67, 129`) est donc CONTOURNÉ à chaque ouverture | jusqu'à 100 évènements (backend `take: 100`), léger |
| `init()` après la liste | GET `/pos/:spaceId/events/:eventId` | `usePosPage.js:71` -> `pos.js:149-162` -> `pos.api.js:36-43` | SÉQUENTIEL après la liste; `detailFetching` pilote la barre de progression de la liste PdV (`SpacePosView.vue:78`) | aucun cache: le détail est remplacé entièrement à chaque réponse (`SET_DETAIL`, `pos.js:91-93`) | tous les PdV de la configuration avec PIN, ventes, responsable (une ligne par PdV) + réglages + KPI |
| setInterval 30 s (`POS_REFRESH_MS`, `usePosPage.js:7, 87-89`), si évènement `live` ET onglet visible | GET `/pos/:spaceId/events/:eventId` (silencieux) | `usePosPage.js:56` | non bloquant, garde de course par jeton (`pos.js:16, 151-160`) | aucun | idem, détail complet à chaque tick |
| mount de `SpacePosView` | GET `/pos/hr-persons` | `SpacePosView.vue:194` -> `usePosHrPersons.js:20-42` -> `pos.api.js:16-23` | en parallèle de `init()`; dédoublonné par `inflight`; ré-appelé à CHAQUE ouverture de la page (pas de court-circuit `loaded`) | état module-level (ref hors composable): conservé entre visites, jamais invalidé, pas de TTL | toutes les personnes RH actives du tenant (id, prénom, nom), sans pagination |
| mount de `SpacePosView` | `paymentMethods/fetchList` (route non lue) | `usePosSettings.js:62-68` | en parallèle | store `paymentMethods` (gabarit 15 min supposé, non lu) | non vérifié |
| changement d'évènement (clic sélecteur) | GET détail (même URL) via `watch(selectedEventId)` | `usePosPage.js:96-99` | bloque l'affichage du nouvel évènement; l'historique (si onglet ventes) est rechargé en parallèle par son propre watcher | aucun | idem |
| ▶ / ■ d'un PdV | POST `/pos/:spaceId/events/:eventId/pdv/:elementId/start` ou `/stop` | `usePosPdvActions.js:26-39` -> `pos.js:164-174` -> `pos.api.js:46-63` | un appel par clic, indicateur par PdV (`working[elementId]`); patch local du store, PAS de relecture du détail | patch local (`mergeAccessIntoPdvs`, `pos.js:30-40`) | un `PosAccessStatus` |
| ▶ / ■ pour tous | POST `.../start-all` ou `.../stop-all` | `usePosPdvActions.js:52-66` -> `pos.js:183-193` | un seul appel (boucle côté serveur, non lue), `bulkWorking` | patch local de tous les PdV (`applyBulk`, `pos.js:42-44`) | `PosBulkResult` (un statut par PdV) |
| Nouveau PIN | POST `.../pdv/:elementId/reset-pin` (après confirmation) | `usePosPdvActions.js:41-50` | un appel | patch local | un statut |
| Choix du responsable | PUT `.../pdv/:elementId` `{ responsibleHrPersonId }` | `usePosPdvActions.js:68-77` -> `pos.js:195-209` | un appel; `getters.pdvs.map` recopie toutes les lignes pour en patcher une | patch local | petit |
| Clic sur un réglage ou un moyen de paiement | PUT `.../settings` (corps complet à chaque changement) | `usePosSettings.js:70-87` -> `pos.js:212-216` | un PUT par clic, pas de debounce; affichage optimiste (`pending`) | `SET_SETTINGS` | petit |
| Ouverture de l'onglet Historique (mount de `PosSalesHistory`), changement d'évènement, de filtre PdV ou de moyen | GET `/pos/:spaceId/events/:eventId/sales?limit=50` (+ `elementId`, `paymentMethodId`, `search`) | `PosSalesHistory.vue:53-57` (watch `immediate`) -> `usePosSalesHistory.js:54-62, 90` -> `pos.js:218-228` -> `pos.api.js:124-131` | bloque le tableau; `v-if/v-else` sur `tab` (`SpacePosView.vue:72, 87`): le composant est détruit et recréé à chaque bascule d'onglet, donc relecture à chaque retour | `state.sales` conservé mais écrasé au rechargement | page de 50 tickets (`POS_SALES_PAGE_SIZE`) |
| Saisie de recherche historique | même GET | `usePosSalesHistory.js:91-94` | debounce 300 ms (`SEARCH_DEBOUNCE_MS`) | aucun | idem |
| « Charger plus » | GET avec `cursor` | `usePosSalesHistory.js:64-76`, `pos.js:106-112` | `APPEND_SALES` recopie `[...rows, ...page.rows]` (O(n) à chaque page) | cumul en mémoire, jamais borné ni virtualisé | +50 tickets par clic |
| Export CSV | GET `.../sales/export` (blob) | `usePosSalesHistory.js:78-88`, `pos.api.js:134-146` | un appel, bloquant pour le bouton | aucun | CSV de jusqu'à 20 000 tickets (`pos-config.controller.ts:20-22`) |
| Impression des PIN | aucun appel réseau dans `onPrint` | `SpacePosView.vue:187-191` -> `usePosPinSheet.print` (non lu en détail) | non vérifié | | |

### 3.2 Côté backend (`backend/src/features/pos/config/`)

Contrôleur `pos-config.controller.ts`: `@UseGuards(JwtDatabaseGuard)` + `@RequirePermissions('front.fb.pos')` sur toute la classe (l.35-36); `spaceAccess.assertCanAccessSpace(user, spaceId)` APPELÉ à chaque route (l.55, 62, 69, 80, 87, 99). Coût du guard JWT base et de `assertCanAccessSpace`: non lu, non vérifié.

| Route | Contrôleur -> service | Requêtes SQL (Prisma), dans l'ordre | Cache Redis | Coût probable |
|---|---|---|---|---|
| GET `/pos/hr-persons` | `pos-config.controller.ts:46-50` -> `PosSettingsService.listResponsibleCandidates` (`pos-settings.service.ts:52-58`) | `hrPerson.findMany` where `tenantId, active`, orderBy nom, SANS `take` | aucun | bas; croît avec les effectifs RH du tenant |
| GET `/pos/:spaceId/events` | `listEvents` (`pos-events.service.ts:38-56`) | 1) `event.findMany` (`take: 100`, `eventDate >= now - EVENT_OVER_LOOKBACK_MS`, `isSimulated false`, avec `space.timezone` et `configuration.name`), filtre `posEventStatus` en JavaScript; 2) `inventoryWindow.groupBy` par `eventId` | aucun | bas |
| GET `/pos/:spaceId/events/:eventId` (appelé toutes les 30 s par page ouverte) | `getEventDetail` (`pos-events.service.ts:59-113`) | EN SÉRIE: 1) `event.findFirst`; 2) `pdvReader.listForConfig` = `spaceElement.findMany` (OR de 4 relations: `configurationElements`, `floor`, `forecourt`, `externalMerch`, `pos-pdv-reader.service.ts:16-24`) puis en parallèle `menuAssignment.groupBy` et `otherSourcesByElement` (= `locationShopMapping.findMany` puis `salesLocation.findMany` avec OR sur `id`/`externalId`, l.76-101); 3) `Promise.all` de: `access.statuses` (non lu), `posPdvSetting.findMany`, `posEventSetting.findFirst`, `salesSummary.byElement` (4 requêtes SÉRIE `locationSpaceMapping`, `integration`, `salesEvent`, `salesLocation` puis `salesTransaction.groupBy` COUNT + SUM, `pos-sales-summary.service.ts:27-57`); 4) `hrPerson.findMany` (seulement si des responsables) | aucun | MOYEN À ÉLEVÉ: environ 12 allers-retours SQL en série (décompte à partir du code, non mesuré), dont un `groupBy` sur `SalesTransaction` (la table qui grossit), répétés toutes les 30 s |
| PUT `.../settings` | `updateEventSettings` (`pos-settings.service.ts:14-45`) | `event.findFirst`, `paymentMethod.count` (si liste non vide), `posEventSetting.upsert` | aucun | bas |
| PUT `.../pdv/:elementId` | `updatePdvSetting` (l.61-84) | `event.findFirst`, `spaceElement.findFirst` (avec le OR à 4 relations), `hrPerson.findFirst`, `posPdvSetting.upsert` | aucun | bas |
| GET `.../sales` | `PosSalesQueryService.list` (déjà décrit dans `09b_pos.md` 3.2: `resolveScope` 2 requêtes, puis page + agrégat + count annulées + tickets avec pourboire SANS limite, recalculés à chaque page) | idem 09b | aucun | moyen, voir 09b problème 10 |
| GET `.../sales/export` | `pos-config.controller.ts:91-115` | boucle SÉQUENTIELLE de `sales.list` par pages de 200 (jusqu'à 100 pages), chaque page refaisant agrégat, count et pourboires; tout est gardé en mémoire (`rows.push(...)`) avant `buildSalesCsv` | aucun | élevé sur un gros évènement: jusqu'à 100 x (4 à 6 requêtes) en série, mémoire O(tickets) |
| POST start/stop/start-all/stop-all/reset-pin | `pos-admin.controller` (cité par `pos.api.js:5-8`) | non lu | non lu | non vérifié |

## 4. Cascade au premier affichage de la page staff (ordre déduit du code, aucune durée mesurée)

- t0: navigation vers `/spaces/:spaceId/pos`; garde de permission du routeur (non lue); chargement du chunk lazy de `SpacePosView` et des 6 composants importés statiquement (`SpacePosView.vue:131-138`).
- t1: setup de `SpacePosView`: 6 composables instanciés; rendu de l'en-tête et de la coque.
- t2: `onMounted` (3 déclencheurs indépendants, en parallèle): `usePosPage.init()` (`spaces/fetchSpaces` non bloquant, puis GET events), `hr.load()` (GET `/pos/hr-persons`), `settingsApi.loadMethods()`.
- t3: réponse de la liste -> `pickPosEventId` -> `selectedEventId` fixé; `loadDetail()` lancé (GET détail, environ 12 requêtes SQL en série côté serveur). CHEMIN CRITIQUE: chunk, puis events, puis détail, trois étapes en série.
- t4: réponse du détail: rendu des cartes PdV (une par PdV de la configuration), bandeau, KPI d'en-tête. Le watcher `selectedEventId` ne relance pas le détail pendant `init` (`usePosPage.js:96-99`, condition `!loading`).
- t5: démarrage du minuteur de 30 s dès le mount (`usePosPage.js:108-111`); toutes les 30 s, si `live` et onglet visible, GET détail complet.
- Onglet Historique: mount de `PosSalesHistory` -> GET sales (50) immédiat (watch `immediate`), refait à chaque retour sur l'onglet.

## 5. Problèmes de performance

1. Détail complet relu toutes les 30 s par chaque page staff ouverte, avec une chaîne SQL longue. `usePosPage` rappelle GET détail toutes les 30 s tant que l'évènement est `live` et l'onglet visible (`frontend/src/composables/usePosPage.js:7, 87-89`). Côté serveur, `getEventDetail` enchaîne en série `event.findFirst`, `spaceElement.findMany`, puis `menuAssignment.groupBy` et `locationShopMapping` + `salesLocation`, puis un `Promise.all` dont `salesSummary.byElement` fait lui-même 4 requêtes en série avant un `salesTransaction.groupBy` (COUNT + SUM) sur la table des ventes, enfin `hrPerson.findMany` (`backend/src/features/pos/config/pos-events.service.ts:59-113`, `pos-pdv-reader.service.ts:34-60, 76-101`, `pos-sales-summary.service.ts:27-57`). Environ 12 allers-retours (décompte du code, non mesuré), sans cache Redis. Avec plusieurs staffs ou plusieurs onglets sur un match, la charge s'additionne. Impact haut (match en direct). Page: staff POS.
2. Chaîne de dépendances serveur évitable. La résolution intégration POS -> évènement de vente -> lieux (`pos-sales-summary.service.ts:27-44`) ne dépend que de `tenantId, spaceId, eventId` et des `elementIds` pour le dernier filtre, mais elle démarre après la lecture des PdV; `event.findFirst` et `listForConfig` sont séquentiels. Impact moyen à haut (latence du détail, multipliée par la latence du pooleur). Page: staff POS.
3. Le détail remplace tout l'objet à chaque réponse. `SET_DETAIL` (`frontend/src/store/modules/pos.js:91-93`) donne de nouveaux objets pour TOUS les PdV toutes les 30 s: toutes les `PosPdvCard` reçoivent de nouvelles props, et chaque action sur un PdV (`SET_PDVS`, `pos.js:97-99`) recopie la liste entière (`getters.pdvs.map`, l.199). Aucun diff, aucun ETag. Impact moyen (croît avec le nombre de PdV). Page: staff POS.
4. Premier affichage en trois étapes série. Chunk, puis GET événements (`force: true`, qui contourne le TTL de 15 min du store, `usePosPage.js:69`), puis GET détail (`usePosPage.js:71`). Le paramètre `?event=` de l'URL ne permet pas de lancer le détail en parallèle. Impact moyen. Page: staff POS.
5. Garde et contrôle d'espace sur chaque appel, dont les polls. Chaque route passe par `JwtDatabaseGuard` (stratégie `jwt-db`, coût non lu) puis `assertCanAccessSpace` (`pos-config.controller.ts:35, 55, 62`), qui s'appuie sur `userSpaceAccess.findUnique` d'après `core/auth/space-access.service.ts:39-52` (corps de `assertCanAccessSpace`, l.65-73, non lu). Au moins une requête de contrôle de plus par poll. Impact bas à moyen. Page: staff POS.
6. Historique non virtualisé et à cumul illimité. `APPEND_SALES` recopie `[...rows, ...page.rows]` à chaque page (`pos.js:106-112`), le tableau fait un `v-for` sans virtualisation (`PosSalesTable.vue:15`), et le composant est détruit puis recréé à chaque bascule d'onglet (`SpacePosView.vue:72, 86`), ce qui relance un GET (`PosSalesHistory.vue:53-57`). Côté serveur, chaque page refait agrégat, count et lecture des pourboires (voir 09b problème 10). Impact moyen sur un évènement à milliers de tickets. Page: staff POS.
7. Export CSV synchrone et séquentiel. Jusqu'à 100 pages de 200 tickets lues l'une après l'autre dans une seule requête, gardées en mémoire, puis `buildSalesCsv` (`pos-config.controller.ts:20-22, 100-114`). Chaque page appelle `sales.list`, donc refait agrégat, count et pourboires: le coût est multiplié par le nombre de pages. Le client a un timeout de 60 s (`client.js:18`, d'après 09b). Impact moyen à haut sur un gros évènement (risque d'échec par timeout, non mesuré). Page: staff POS, historique.
8. Démarrage et arrêt groupés: un POST, N PdV en série. `startAll` appelle `startPdv` pour chaque PdV, qui fait `resolveElementById`, `spaceElement.findFirst`, `inventoryWindow.upsert`, `ensureWindowPin` (non lu), `guestPinAccess.upsert`, puis `status` (2 requêtes), soit environ 6 requêtes par PdV, en série voulue ("l'index partiel ne tolère pas la course", `pos-access.service.ts:109-113, 237-258, 321-338`). Pour N PdV, de l'ordre de 6N allers-retours dans un seul POST borné par le timeout de 60 s, sans progression visible côté UI (`bulkWorking` seulement, `usePosPdvActions.js:52-66`). `stopAll` appelle `stop`, qui relit la fenêtre, ferme, puis `status`. Impact moyen à haut sur un événement à beaucoup de PdV (non mesuré). Page: staff POS.
9. Liste des PdV non virtualisée, une carte lourde par PdV. Chaque `PosPdvCard` contient un `v-menu` de responsable (avec toutes les personnes RH en prop, `PosPdvList.vue:9`), un `GuestPinQrDialog` (Options API, `qrcode` importé, `PosPdvQrActions.vue:7`), un bouton et des badges. Le QR n'est dessiné qu'à l'ouverture (`GuestPinQrDialog.vue:91-98`), donc le coût au chargement est le nombre d'instances (environ 6 à 8 composants par PdV, estimation, non mesuré). La recherche n'a pas de debounce: `search` alimente `base` à chaque frappe (`usePosPdvFilters.js:47-54`), 5 computed en chaîne, O(N) chacun, négligeable pour quelques dizaines de PdV. Impact bas à moyen. Page: staff POS.
10. Personnes RH sans pagination ni borne. GET `/pos/hr-persons` renvoie toutes les personnes actives du tenant (`pos-settings.service.ts:52-58`, pas de `take`), triées côté serveur puis re-triées côté client avec `localeCompare` (`usePosHrPersons.js:44`), et relues à chaque ouverture de la page (seul `inflight` court-circuite, l.22). L'état module-level évite l'écran vide. Impact bas à moyen (dépend des effectifs). Page: staff POS.
11. Réglages: un PUT complet par clic, sans debounce, avec état optimiste partagé. `save()` fixe `pending`, et le `finally` de la première requête le remet à null même si une seconde est en vol (`usePosSettings.js:70-87`); clics rapides sur plusieurs moyens de paiement = requêtes concurrentes dont le corps part de `effective` (qui peut ne pas encore refléter la précédente). Impact bas. Page: staff POS.
12. Aucun cache serveur sur la lecture staff. Les quatre services de `config/` lus n'ont aucun cache Redis ni mémoire; la liste d'évènements et le référentiel RH sont relus à chaque ouverture. Impact moyen cumulé avec 1 et 5. Page: staff POS.
13. `listEvents` filtre en JavaScript après `take: 100` (`pos-events.service.ts:39-47`), puis un `groupBy` sur `inventoryWindow`. Léger. Impact bas. Page: staff POS.

## 6. Recommandations

### Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Lancer GET événements et GET détail en parallèle quand `?event=` est présent; ne pas forcer la liste si le cache du store est valide | Un aller-retour de moins sur le chemin critique | Faible | S | `frontend/src/composables/usePosPage.js` |
| Fusionner le détail au lieu de le remplacer (ligne par ligne, en conservant les objets inchangés) et ne mettre à jour que les PdV modifiés | Moins de re-rendus des cartes à chaque tick de 30 s | Faible | M | `frontend/src/store/modules/pos.js` |
| Espacer ou suspendre le minuteur de 30 s quand aucune action n'est possible, relire à la reprise de visibilité | Moins de charge serveur cumulée | Données un peu moins fraîches | S | `usePosPage.js:85-94` |
| Garder `PosSalesHistory` monté (`v-show`) ou ne relire que si l'évènement ou les filtres ont changé; virtualiser ou borner le cumul de pages | Pas de relecture à chaque bascule d'onglet, DOM borné | Faible à moyen | S à M | `SpacePosView.vue:72, 86`, `PosSalesTable.vue`, `pos.js:106-112` |
| Debounce de la recherche de PdV; instancier le dialog QR à la demande (`v-if` sur l'ouverture) | Moins de composants par carte | Faible | S | `PosPdvQrActions.vue`, `usePosPdvFilters.js` |
| Regrouper les sauvegardes de réglages (debounce) et gérer `pending` par requête | Moins de PUT, moins de scintillement | Faible | S | `usePosSettings.js` |
| Afficher une progression pour le démarrage / arrêt groupé, ou le découper par lots côté client | Retour visuel, pas de timeout muet | Moyen | M | `usePosPdvActions.js` |

### Backend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Paralléliser `getEventDetail`: lancer la résolution intégration / évènement de vente / lieux du résumé de ventes en même temps que la lecture des PdV; fusionner `event.findFirst` avec la lecture de l'évènement | Latence du détail nettement réduite | Faible | M | `pos-events.service.ts`, `pos-sales-summary.service.ts`, `pos-pdv-reader.service.ts` |
| Cache court (Redis, quelques secondes, clé tenant + évènement) du détail ou du résumé de ventes, invalidé sur start / stop / reset-pin / responsable | Un seul calcul pour N onglets staff | Invalidation à couvrir | M | `pos-events.service.ts`, `pos-access.service.ts` |
| Export CSV: flux par pages sans refaire agrégat, count et pourboires; ou tâche asynchrone | Export fiable sur gros évènement | Moyen | M | `pos-config.controller.ts:91-115`, `pos-sales-query.service.ts` |
| Démarrage / arrêt groupé: lire une fois les fenêtres et accès existants, puis écrire en lot, garder la tolérance aux échecs isolés | Environ 6N allers-retours ramenés à quelques-uns | Moyen (index partiel, course) | M | `pos-access.service.ts:109-117, 237-258, 321-338` |
| Borner `hrPerson.findMany` (recherche ou `take`) ou le cacher (TTL court) | Réponse stable avec de gros effectifs | Faible | S | `pos-settings.service.ts:52-58` |
| Mesurer le coût réel de `JwtDatabaseGuard` et `assertCanAccessSpace` sur le poll de 30 s | Décider d'un cache d'accès | Aucun | S | `core/auth/guards/jwt-db.guard.ts`, `core/auth/space-access.service.ts` |

### SQL / index

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| EXPLAIN (ANALYZE) du `salesTransaction.groupBy` (tenant, évènement, lieux, statut V, non supprimé) du résumé de ventes, le commentaire du code annonce un index `(tenantId, eventId, status)` à confirmer | Valider que le poll de 30 s ne balaie pas la table | Aucun | S | `pos-sales-summary.service.ts:7-19, 46-57`, schéma Prisma |
| EXPLAIN du `spaceElement.findMany` à 4 relations OR (`pdvOfConfigWhere`) et de `locationShopMapping` / `salesLocation` (OR `id` / `externalId`) | Repérer un scan sur les relations | Selon l'index | S | `pos-pdv-reader.service.ts:16-24, 84-87` |

## 7. Points non vérifiés

- Durées réelles: aucune mesure. À relever dans l'onglet Network (GET événements, GET détail, GET sales, POST start-all) et par EXPLAIN ANALYZE côté base.
- Tailles réelles des réponses: détail (nombre de PdV par configuration), historique (50 tickets), export CSV, liste RH.
- Non lus ou lus partiellement: `PosPdvCard.vue` (lignes 111-196, style), `PosSalesTable.vue` (lignes 81-127), `PosBand.vue` (lignes 76-135), `PosTabs`, `PosFilterCard`, `PosSalesFilters`, `PosSalesSummaryCard`, `PosSettingsCard`, `PosSettingRow`, `PosLowStockField`, `PosPaymentMethodsList`, `PosPinBadge`, `PosPinSummary`, `PosPrintMenu`, `PosEventPicker`, `PosLeftColumn`, `PosRightColumn`, `PosCollapsibleCard` (rôles issus du commentaire d'en-tête seulement).
- Composables non lus: `usePosPinSheet` (impression des PIN, génération éventuelle d'un QR par PdV côté client, appel réseau éventuel) et `usePosFormat`. Store `paymentMethods` (TTL et route de `fetchList`) et `spaces/fetchSpaces`.
- Backend non lu: `pos-admin.controller.ts` (90 lignes, routes start / stop / start-all / stop-all / reset-pin, seulement leurs méthodes de service lues par grep), `windowService.ensureWindowPin` et `closeWindowRecord`, `resolveElementById`, `credentialService.readWindowPin` (déchiffrement du PIN par PdV à chaque détail, lu seulement en une ligne: `decryptPin`), stratégie `jwt-db` et corps de `assertCanAccessSpace` (`space-access.service.ts:65-73`), `PosSalesQueryService.resolveScope` pour la portée staff, `pos-sales-csv.ts`, `pos-event-status.ts`, DTO.
- Router: garde de permission `front.fb.pos` et ordre exact garde / chargement du chunk (repris de 09b, `router/index.js:283-287` non relu).
- Index réels en base (`SalesTransaction`, `LocationSpaceMapping`, `SalesLocation`, `InventoryWindow`) cités seulement d'après des commentaires; `v-menu` Vuetify lazy par défaut non vérifié dans le code.
- Comportement avec plusieurs onglets staff simultanés: déduit du minuteur par instance, non mesuré.

