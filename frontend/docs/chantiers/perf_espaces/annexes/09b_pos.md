# 09b. POS (configuration staff /spaces/:spaceId/pos) et caisse invité (/pdv/pos)

Rapport de performance, lecture seule. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code et sont signalées comme telles. Ce qui n'est pas lu est marqué "non vérifié" ou "non lu".

COUVERTURE: la caisse invité (frontend + backend) est analysée en profondeur. La page staff POS (`/spaces/:spaceId/pos`) n'est PAS analysée: seuls la route, la liste des fichiers et leurs nombres de lignes sont relevés (section 1 et 2). Voir section 7.

## 1. Fiche de la page

### 1.1 Page staff POS (non analysée en détail)
- Route `/spaces/:spaceId/pos`, nom `space-pos`, composant lazy `frontend/src/components/space-workspace/pos/views/SpacePosView.vue` (290 lignes), meta `{ title: 'POS', permission: 'front.fb.pos' }`, pas de `keepAlive`, pas de `beforeEnter` propre. Preuve: `frontend/src/router/index.js:283-287`.
- Fichiers non lus: `frontend/src/api/endpoints/pos.api.js` (154 l.), `frontend/src/store/modules/pos.js`, composables `usePosPage.js`, `usePosSettings.js`, `usePosPdvActions.js`, `usePosPdvFilters.js`, `usePosSalesHistory.js`, `usePosPinSheet.js`, `usePosHrPersons.js`, `usePosFormat.js`.
- Backend non lu: `backend/src/features/pos/config/` (`pos-config.controller.ts` 120 l., `pos-events.service.ts` 141 l., `pos-settings.service.ts` 91 l., `pos-pdv-reader.service.ts` 102 l., `pos-sales-summary.service.ts` 69 l.), `pos-source.service.ts` lu seulement pour ses méthodes `ensure*` (voir 3.2).

### 1.2 Caisse invité (analysée)
- Route `/pdv/pos`, nom `guest-pos`, composant lazy `frontend/src/components/guest-pos/views/GuestPosView.vue` (112 lignes), `beforeEnter: requireGuestPinSession`, meta `{ title: 'Caisse', guestMode: true, noindex: true }`, pas de `keepAlive`. Hors de l'arbre `dashboard` (plein écran `position: fixed; inset: 0; z-index: 1000`, `GuestPosView.vue:106`). Preuve: `frontend/src/router/index.js:120-128`.
- Garde `requireGuestPinSession` (`frontend/src/router/guards.js`, section "Guard des routes invité PIN"): `await store.dispatch('guestPin/restore')`, puis refus si la session n'est pas active, puis redirection si la phase n'est pas `pos` (`guestRouteForPhase`, même fichier).
- `guestPin/restore` (`frontend/src/store/modules/guestPin.js:79-98`): sort tout de suite si `state.initialized` (état en mémoire, donc perdu à chaque rechargement). Sinon relit le jeton persisté, puis fait un GET `/guest-pin/session` (`frontend/src/api/endpoints/guestPin.api.js:35-38`) qui BLOQUE la navigation. Le `catch` (l.89-95) purge le jeton pour TOUTE erreur, y compris une simple coupure réseau (voir problème 1).
- API: `frontend/src/api/endpoints/guestPos.api.js` (47 l.). Store: `frontend/src/store/modules/guestPos.js` (415 l.). File d'envoi: `frontend/src/utils/posOutbox.js` (184 l.). Calculs ticket: `frontend/src/utils/posTicket.js` (109 l.). Erreurs: `frontend/src/utils/posErrors.js` (55 l.).
- Backend: `backend/src/features/pos/guest/pos-guest.controller.ts` (85 l.), préfixe `guest-pin/pos`, `@Public()` + `JwtGuestPinGuard`.

## 2. Arbre des composants

### 2.1 Caisse invité
Tous montés à l'ouverture sauf indication. Aucun composant ne fait d'appel réseau directement: tout passe par les composables `useGuestPos*` puis le store `guestPos`.

| Composant | Fichier (frontend/src/components/guest-pos/) | Lignes | Rôle | Monté / différé | Props / données |
|---|---|---|---|---|---|
| GuestPosView | views/GuestPosView.vue | 112 | Assemble les blocs, lance `catalog.load` au mount (l.88) | monté (route lazy) | aucune |
| GuestPosHeader | GuestPosHeader.vue | 55 | Entête PdV, évènement, témoin de synchro, bouton menu | monté | pdv-name, event-name, sync-state, sync-label, menu-open |
| GuestPosMenu | GuestPosMenu.vue | 39 | Menu (historique, clôture, plein écran) | différé `v-if="menuOpen"` (GuestPosView.vue:13) | vendor-name, is-fullscreen, fullscreen-supported |
| GuestPosLoadState | GuestPosLoadState.vue | 41 | Écran de chargement ou d'erreur du catalogue | `v-if="!catalog.loaded"` (l.25) | error |
| GuestPosCategoryRail | GuestPosCategoryRail.vue | 44 | Rail des catégories, `v-for` | monté après catalogue | categories, selected-id |
| GuestPosProductGrid | GuestPosProductGrid.vue | 24 | Grille des tuiles de la catégorie, `v-for` non virtualisé (l.3) | monté après catalogue | tiles |
| GuestPosProductTile | GuestPosProductTile.vue | 62 | Tuile article | une par article de la catégorie | tile |
| GuestPosSaleBanner | GuestPosSaleBanner.vue | 37 | Bandeau dernière vente / annulation (via `useGuestPosSaleBanner`) | monté après catalogue | aucune (store) |
| GuestPosTicketPanel | GuestPosTicketPanel.vue | 82 | Ticket en cours, boutons de paiement, pourboire | monté après catalogue | aucune (composables ticket + checkout) |
| GuestPosTicketLine | GuestPosTicketLine.vue | 41 | Ligne du ticket (`v-for`, l.13 du panel) | une par ligne | line |
| GuestPosPayButtons | GuestPosPayButtons.vue | 39 | Un bouton par moyen de paiement | dans le panel | methods |
| GuestPosPaymentIcon | GuestPosPaymentIcon.vue | 17 | Icône du moyen | dans les boutons | props kind |
| GuestPosTipPicker | GuestPosTipPicker.vue | 54 | Choix du pourboire (pourcentages) | dans le panel | via `useGuestPosTip` |
| GuestPosSyncBadge | GuestPosSyncBadge.vue | 22 | Pastille live / en attente / hors ligne | dans le header | props |
| GuestPosSplitDialog | dialogs/GuestPosSplitDialog.vue | 90 | Paiement partagé | `v-if modal==='split'`, MAIS import statique (GuestPosView.vue:57) | reset au mount |
| GuestPosSplitEqual / ByAmount / Rest | dialogs/ | 62 / 78 / 25 | Modes de partage | dans le dialog | methods, parts, lines |
| GuestPosHistoryDialog | dialogs/GuestPosHistoryDialog.vue | 52 | Historique, `history.load()` au mount (l.42) | `v-if modal==='history'`, import statique (l.58) | aucune |
| GuestPosHistoryList | dialogs/GuestPosHistoryList.vue | 81 | Liste filtrable, `v-for row in rows` (l.21) non virtualisé | dans le dialog | rows, chips, filter, search |
| GuestPosHistoryDetail | dialogs/GuestPosHistoryDetail.vue | 90 | Détail d'un ticket | dans le dialog | detail |
| GuestPosClosingDialog | dialogs/GuestPosClosingDialog.vue | 69 | Récapitulatif de clôture, `load` au mount (l.50) | `v-if modal==='closing'`, import statique (l.59) | aucune |
| GuestPosModalShell | dialogs/GuestPosModalShell.vue | 32 | Coque modale, écoute `keydown` | dans chaque dialog | titre |

Composables (frontend/src/composables/): `useGuestPosCatalog` (70 l.), `useGuestPosCheckout` (60), `useGuestPosNetwork` (59), `useGuestPosSession` (32), `useGuestPosHistory` (158), `useGuestPosClosing` (51), `useGuestPosSaleBanner` (64), `useGuestPosTicket` (37), `useGuestPosSplit` (112), `useGuestPosTip` (56), `useGuestPosFullscreen` (68).

### 2.2 Page staff POS (non lue, rôles déduits des noms uniquement)
`frontend/src/components/space-workspace/pos/` (23 .vue, 2116 lignes au total): PosAccessWarning 33, PosBand 135, PosCollapsibleCard 88, PosEventPicker 99, PosFilterCard 146, PosLeftColumn 49, PosLowStockField 56, PosPaymentMethodsList 39, PosPdvCard 196, PosPdvList 63, PosPdvQrActions 55, PosPinBadge 79, PosPinSummary 100, PosPrintMenu 55, PosResponsibleSelect 79, PosRightColumn 47, PosSalesFilters 144, PosSalesHistory 89, PosSalesSummaryCard 128, PosSalesTable 127, PosSettingRow 53, PosSettingsCard 86, PosStockCard 24, PosTabs 146. Montage, props, appels API: non vérifié.

## 3. Appels API

### 3.1 Caisse invité, côté frontend

| Déclencheur | Méthode + URL | Fonction front | Séquentiel / bloque le rendu | Cache front | Payload |
|---|---|---|---|---|---|
| Navigation vers la route (rechargement complet) | GET `/guest-pin/session` | `guards.js` -> `guestPin.js:79-98` -> `guestPin.api.js:35` | bloque la navigation avant le chargement du chunk (ordre vue-router: `beforeEnter`, puis résolution du composant lazy; non mesuré) | état Vuex en mémoire seulement; jeton en sessionStorage (commentaire du guard) | petit |
| mount `GuestPosView` | GET `/guest-pin/pos/catalog` | `GuestPosView.vue:88`, `guestPos.js:178`, `guestPos.api.js:9` | BLOQUE le rendu: `GuestPosLoadState` tant que `catalog` est null (l.25). Timeout 60 s (`client.js:18`) | AUCUN: ni localStorage, ni sessionStorage, ni IndexedDB (grep négatif sur store, outbox et composables) | liste complète des articles du PdV + catégories + moyens de paiement + réglages (taille non mesurée) |
| mount (Network) | aucun appel; `hydrateOutbox` relit la file mémoire | `useGuestPosNetwork.js:42`, `guestPos.js:199` | non bloquant | file en mémoire | néant |
| setInterval 60 s, onglet visible et catalogue chargé | GET `/guest-pin/pos/catalog` (silencieux) | `useGuestPosCatalog.js:10, 59-64` | non bloquant; l'échec silencieux passe `online` à false si erreur réseau (`guestPos.js:189`) | aucun | catalogue entier à chaque fois |
| Après chaque vente confirmée, ou après un flush réussi | GET `/guest-pin/pos/catalog` (silencieux) | `guestPos.js:301` et `:323` | non bloquant | aucun | catalogue entier |
| Clic paiement | POST `/guest-pin/pos/sales` | `useGuestPosCheckout.js:34`, `guestPos.js:238-309`, `posOutbox.js:119`, `guestPos.api.js:19-25` | BLOQUE l'interface: `submitting=true` (l.258) jusqu'à la réponse ou 60 s; envoi unique en série; en-tête `X-Guest-Device-Id`, `suppressGlobalError` | file `posOutbox` en mémoire (écrite AVANT l'envoi, `posOutbox.js:130-132`) | `{ clientTicketId, clientCreatedAt, lines:[{menuItemId, quantity}], payments:[{paymentMethodId, amountTtc, tipTtc?}] }` (`posTicket.js:61-70`, `posOutbox.js:124`), environ 100 octets + 60 par ligne (estimation, non mesuré); l'aperçu `preview` reste local |
| setInterval 15 s si `pendingCount > 0`, événement `online` | POST `/guest-pin/pos/sales` (rejeu) | `useGuestPosNetwork.js:10, 28-31, 47-49`, `guestPos.js:312-325`, `posOutbox.js:139-156` | série, dans l'ordre; s'arrête au premier échec réseau; appels concurrents mutualisés (`flushing`); pas de backoff | file mémoire | idem |
| Ouverture historique | GET `/guest-pin/pos/sales?limit=200` (+ `cursor` en "charger plus") | `GuestPosHistoryDialog.vue:42`, `guestPos.js:362-375` | bloque le contenu du dialog | `state.sales` (conservé, relu à chaque ouverture) | jusqu'à 200 tickets avec lignes et paiements |
| Ouverture clôture | GET `/guest-pin/pos/closing` | `GuestPosClosingDialog.vue:50`, `guestPos.js:391` | bloque le contenu du dialog | `state.closing` | petit |
| Annulation / rétablissement | POST `/guest-pin/pos/sales/:id/cancel` et `/restore` | `guestPos.js:339-359, 378-389` | action manuelle | aucun | petit |

Comportement du client Axios sur ces appels (`frontend/src/api/client.js`): timeout 60 000 ms (l.18); 429 avec `Retry-After`: un seul rejeu automatique (l.206-218); timeout (ECONNABORTED): rejeu unique, GET seulement, uniquement si `/health` répond en moins de 5 s (l.221-234, commentaire sur le cold start Render); donc le POST de vente n'a AUCUN rejeu automatique par l'intercepteur, seul `posOutbox` rejoue. Gestion du 401 (l.167-171, `_retry`): non lue en détail, non vérifié si elle s'applique aux jetons invités.

Classification des erreurs d'envoi (`posErrors.js:19-23`): rejouable = pas de réponse, statut >= 500, 408, 429. Toute autre 4xx est un refus métier: sortie de file vers "refusées".

### 3.2 Caisse invité, côté backend

Contrôleur `backend/src/features/pos/guest/pos-guest.controller.ts`, `@Public()` + `JwtGuestPinGuard` (l.23-24).

Authentification, sur CHAQUE requête: `JwtGuestPinStrategy.validate` (`backend/src/core/auth/strategies/jwt-guest-pin.strategy.ts`) fait `guestPinAccess.findUnique({ include: { window: true } })`, soit une requête SQL avec jointure; le commentaire du fichier dit "TAPE LA BASE à chaque requête" pour permettre la révocation immédiate. Pas de cache.

| Route | Contrôleur -> service | Requêtes SQL (Prisma) | Cache Redis | Coût probable |
|---|---|---|---|---|
| GET `/guest-pin/pos/catalog` | `pos-guest.controller.ts:35-40` -> `PosCatalogService.getCatalog` (`pos-catalog.service.ts:28`) | 1) `PosSaleContextService.load` (`pos-sale-context.service.ts:59`): `event.findFirst`, puis 4 en parallèle (`spaceElement`, `posEventSetting`, `menuAssignment`, `posPdvSetting`). 2) `Promise.all` (l.32-37): `resolveLines` (3 requêtes: `menuItem` avec catégorie, promotion, combos; `spaceMenuItem`; TVA par défaut), `computeForPdv`, `resolveForEvent`, `nextTicketNumber` | aucun; seulement un cache mémoire de process de 3 s sur le stock (voir ci-dessous) | élevé et non mesuré, dominé par la disponibilité |
| Disponibilité (dans le catalogue) | `pos-availability.service.ts:30-55` | `PosStockSnapshotService.forElement` -> `StockLevelService.getExpectedStockIndex(spaceId)` (`stock-level.service.ts:139`) -> `getLevelsAndConsumption` (l.36-92): `stockLevel.findMany`, `stockReconciliation.findFirst`, `stockMovement.findFirst`, éléments de l'espace, puis SQL brut `salesByElementSince` (`backend/src/features/logistics/logistics.queries.ts:6-29`): `WeezeventTransactionItem` JOIN `WeezeventTransaction` JOIN `WeezeventLocation` JOIN `WeezeventLocationShopMapping` (jointure avec OR sur deux colonnes, l.17-19) JOIN `WeezeventProductMapping`, filtres `tenantId`, `status='V'`, `deletedAt IS NULL`, `transactionDate > ancre`, `GROUP BY`. Porte sur TOUS les PdV de l'ESPACE, depuis le dernier reset logistique. Puis `explodeSalesToConsumption` (`recipe-explosion.service.ts:458`, `menuItem.findMany` avec recettes et expansions itératives de combos et composants). En plus: `stockLevel.findMany` (`pos-stock-snapshot.service.ts:57`) et `perUnitByMenuItem` (`pos-recipe-requirements.service.ts:17-30`, rejoue `explodeSalesToConsumption` avec 1000 unités fictives par article, sans cache) et un 2e `posEventSetting.findFirst` (`pos-availability.service.ts:46`) | mémoire du process, TTL 3000 ms par `tenantId:spaceId`, requêtes simultanées mutualisées (`pos-stock-snapshot.service.ts:7, 40-52`); non partagé entre instances | le plus lourd de la caisse; EXPLAIN requis |
| `resolveForEvent` | `payment-methods.service.ts:38-47` | `paymentMethod.findMany` (via `ensureDefaults` l.114-124, écriture seulement si des moyens système manquent) + 3e lecture de `posEventSetting` | aucun | bas |
| `nextTicketNumber` | `pos-sales-query.service.ts:148-153` | `salesEvent.findMany`, `salesLocation.findMany` (jointure integration), puis `salesTransaction.count` du PdV (croît avec les ventes) | aucun | bas à moyen |
| POST `/guest-pin/pos/sales` | `pos-guest.controller.ts:42-51` -> `PosSaleService.createSale` (`pos-sale.service.ts:41-166`) | EN SÉRIE avant la transaction: `ensureIntegrationForSpace` (l.46; 2 requêtes), `findExisting` (l.47), `assertCashOpen` (`inventoryWindow`, l.53), `context.load` (1+4 requêtes, l.54), `Promise.all` [`resolveLines` (3), `resolveForEvent` (2)] (l.60), `ensureReferentials` (l.75, `pos-source.service.ts:246-276`): `event.findFirst` (redondant), `spaceElement.findMany` + `menuItem.findMany`, `ensureIntegrationForSpace` (redondant, 2 requêtes), `salesEvent.upsert` (ÉCRITURE à chaque vente), `ensureLocations` (`findMany` + `locationShopMapping.createMany` = écriture à chaque vente), `ensureProducts` (`findMany` + `productMapping.createMany` = écriture à chaque vente), puis `ensurePosSource` (l.76, non lu). Ensuite `$transaction` (l.101-144): verrou advisory + `count` (`pos-ticket-number.ts:17-26`) + `findUnique` + `salesTransaction.create` avec `items.create`. Après commit, sans attendre: `priceAgg.applyDeltaSafe` et `live.trigger` | Redis: `has` + `set` du verrou de coalescence par vente (`pos-live-trigger.service.ts:38-39`); `aggregationJobLog.create` + file de jobs si aucun job en attente | élevé en latence: environ 20 allers-retours SQL avant la transaction (décompte à partir du code, non mesuré), chacun payant la latence du pooleur |
| GET `/guest-pin/pos/sales` | `pos-sales-query.service.ts:37-80` | `resolveScope` (2 requêtes) puis en parallèle: page `findMany` (`take limit+1`, tri `transactionDate desc, id desc`), `aggregate` (COUNT + SUM), `count` des annulées, `findMany` des tickets avec pourboire (filtre JSON `metadata.tipTotal > 0`, SANS limite, charge `metadata`) | aucun | moyen; l'agrégat, le count et la requête pourboires sont recalculés à chaque page |
| GET `/guest-pin/pos/closing` | `pos-sales-query.service.ts:87-142` | `findMany` de TOUS les tickets actifs du PdV avec `items` et `metadata` complets, sans limite, agrégation en JavaScript, + `count` annulées | aucun | croît avec le nombre de tickets du PdV |
| POST `.../cancel`, `.../restore` | `PosSaleCancelService` (non lu) | non lu | non lu | non vérifié |

Les commentaires du code citent des index existants (`pos-ticket-number.ts:13-14`: index `(tenantId, locationId, status, eventId)`; `pos-sales-query.service.ts:28-30`) mais je n'ai pas vérifié le schéma Prisma ni la base.

### 3.3 Page staff POS
Non analysée (voir 1.1).

## 4. Cascade au premier affichage de la caisse (rechargement complet, ordre déduit du code, aucune durée mesurée)

- t0: navigation vers `/pdv/pos`. `requireGuestPinSession` appelle `guestPin/restore`: `state.initialized` est faux après un rechargement, donc GET `/guest-pin/session` (backend: validation JWT + 1 requête `guestPinAccess` avec jointure `window`). Bloquant. En cas d'échec réseau, le jeton est purgé (guestPin.js:89-95) et le vendeur est renvoyé vers la page PIN.
- t1: téléchargement du chunk lazy de `GuestPosView` et de ses composants (3 dialogs inclus, imports statiques GuestPosView.vue:57-59). Non mesuré. Le chemin critique réseau est donc: session, puis chunk, puis catalogue, en série.
- t2: mount. `catalog.load` (GET catalogue, bloquant, timeout 60 s). Écran `GuestPosLoadState` affiché. En parallèle et sans réseau: `hydrateOutbox` (file mémoire, donc vide après rechargement), écouteurs `online/offline/beforeunload`, deux `setInterval` (60 s catalogue, 15 s flush).
- t3: réponse du catalogue = JWT strategy (1 requête) + contexte (5 requêtes) + prix (3) + disponibilité (agrégat des ventes de l'espace, stock, recettes) + moyens de paiement (2-3) + numéro de ticket (3). Les 4 branches du `Promise.all` du catalogue sont parallèles, le chemin critique est la branche disponibilité (`pos-catalog.service.ts:32-37`).
- t4: rendu: rail, grille de la catégorie active, panneau ticket. À partir de là, GET catalogue toutes les 60 s et après chaque vente.
- Chemin d'une vente: clic paiement -> validation locale -> écriture dans la file mémoire -> POST (bloquant, jusqu'à 60 s) -> ~20 requêtes SQL série + transaction -> réponse -> `SET_LAST_SALE`, panier vidé -> GET catalogue silencieux (qui relance le calcul de disponibilité, voir 5.5).

## 5. Problèmes de performance

1. Session purgée sur simple coupure réseau, au rechargement. `guestPin/restore` attrape toutes les erreurs de GET `/guest-pin/session` et efface le jeton (`frontend/src/store/modules/guestPin.js:89-95`), alors que le commentaire ne vise que "révoquée/expirée". Sur réseau mobile instable, un rechargement force à ressaisir le PIN. Impact haut. Page: caisse invité (et les autres écrans invité qui utilisent le même guard).
2. Aucun cache du catalogue (hors ligne ou démarrage rapide). `loadCatalog` ne persiste rien (`guestPos.js:178-196`), et l'écran reste bloqué sur `GuestPosLoadState` tant que le catalogue n'est pas là (`GuestPosView.vue:25`). Rechargement sans réseau: caisse inutilisable. Impact haut. Page: caisse invité.
3. File d'envoi en mémoire seulement. `createMemoryOutboxStorage` (`posOutbox.js:30-40`), le commentaire (l.9-10) prévoit IndexedDB. Rechargement, plantage de l'onglet ou kill du navigateur: les ventes non envoyées sont perdues (chiffre d'affaires). Seules protections: `beforeunload` (`useGuestPosNetwork.js:33-38`) et blocage de la sortie (`useGuestPosSession.js:2-3, 17-18`), inefficaces contre un plantage. Impact haut. Page: caisse invité.
4. Envoi de vente bloquant jusqu'à 60 s. `createGuestPosSale` utilise l'instance partagée (timeout 60 000 ms, `client.js:18`), `checkout` attend la réponse (`guestPos.js:277`) avec `submitting=true` qui désactive le paiement (`useGuestPosCheckout.js:35`). Sur réseau mobile dégradé, le caissier attend longtemps avant le basculement en "en attente". L'idempotence sur `clientTicketId` rend un timeout court sûr. Impact haut. Page: caisse invité.
5. Latence serveur d'une vente. Environ 20 requêtes SQL en série avant la transaction (voir 3.2), dont des écritures idempotentes répétées à chaque vente (`salesEvent.upsert`, `locationShopMapping.createMany`, `productMapping.createMany`), des relectures redondantes (`event` 2 fois, intégration 2 fois, `posEventSetting` jusqu'à 3 fois). Preuve: `pos-sale.service.ts:46-76`, `pos-source.service.ts:246-276`. Les commentaires du service disent "créés à la demande": le coût de création à la demande est payé à chaque vente. Impact haut (latence par vente, multiplié par la latence du pooleur). Page: caisse invité.
6. Calcul de disponibilité lourd, répété. Pour chaque catalogue, agrégat de toutes les ventes de l'espace depuis le dernier reset logistique (SQL à 5 jointures, OR de jointure) + explosion des recettes, avec un cache de seulement 3 s en mémoire d'un seul process (`pos-stock-snapshot.service.ts:7`). Chaque tablette le redemande toutes les 60 s ET après chaque vente. Plus il y a de PdV et de tablettes, plus la charge s'additionne sur la table de transactions. Le calcul des besoins par recette (`pos-recipe-requirements.service.ts:17-30`) n'est pas mis en cache. Impact haut (non mesuré, EXPLAIN requis). Page: caisse invité; partage le code avec Logistic.
7. Catalogue complet re-téléchargé après chaque vente (`guestPos.js:301, 323`) alors que seule la disponibilité bouge. Charge réseau mobile et serveur. Impact moyen. Page: caisse invité.
8. Authentification: 1 requête SQL à chaque appel (`jwt-guest-pin.strategy.ts`), plus `assertCashOpen` (1 requête) à chaque vente (`pos-sale.service.ts:53`). Choix documenté (révocation immédiate). Impact bas à moyen. Page: caisse invité.
9. Rejeu de la file sans backoff: toutes les 15 s tant qu'il reste des ventes (`useGuestPosNetwork.js:47-49`), chaque tentative pouvant attendre 60 s; s'arrête au premier échec mais ne ralentit pas. Impact moyen. Page: caisse invité.
10. Clôture et historique: `closing` charge tous les tickets actifs du PdV en mémoire (`pos-sales-query.service.ts:93-99`); `list` refait agrégat, count et lecture des pourboires (sans limite, l.64-67) à chaque page; le front demande 200 lignes par page (`guestPos.js:365`), liste non virtualisée (`GuestPosHistoryList.vue:21`), compteurs de filtres en O(filtres x lignes) (`useGuestPosHistory.js`, computed `chips`). Impact moyen en fin de match (milliers de tickets). Page: caisse invité.
11. `nextTicketNumber` fait un `COUNT` des ventes du PdV à chaque catalogue (`pos-sales-query.service.ts:148-153`) et la numérotation fait un `COUNT` sous verrou advisory par PdV et évènement (`pos-ticket-number.ts:21-25`). Impact bas à moyen (dépend de l'index annoncé en commentaire). Page: caisse invité.
12. Dialogs importés statiquement (`GuestPosView.vue:57-59`) alors qu'ils ne s'affichent qu'à la demande. Impact bas. Page: caisse invité.
13. Calculs front à chaque tap: `SET_QUANTITY` recopie le panier (`guestPos.js:89-94`), `ticketLines`, `cartCounts`, `categories` et `tiles` recalculent sur tous les articles (`posTicket.js:20-54`, `useGuestPosCatalog.js:24-53`). Sur un catalogue de quelques dizaines à centaines d'articles c'est négligeable (non mesuré). Impact bas.
14. PWA non confirmée: `@vue/cli-plugin-pwa` est en dépendance et `vue.config.js:110-111` configure `workboxOptions`, mais aucun enregistrement de service worker dans `frontend/src` (grep négatif) et `frontend/public` ne contient que favicon.ico, img, index.html, robots.txt. Sans service worker, le shell de l'application n'est pas servi hors ligne: la caisse ne peut pas redémarrer sans réseau même si le catalogue était persisté. Non vérifié (configuration de build non lue). Impact haut si confirmé.

## 6. Recommandations

### Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Ne purger la session que sur 401/403 de `/guest-pin/session`; garder le jeton si erreur réseau et laisser la caisse s'ouvrir | Plus de PIN ressaisi après un rechargement en mauvais réseau | Faible: la révocation reste détectée par la première requête métier (401) | S | `frontend/src/store/modules/guestPin.js` (restore) |
| Persister la file d'envoi en IndexedDB (le contrat `{ load, save }` est déjà isolé, `posOutbox.js:9-10`) | Aucune vente perdue sur plantage ou rechargement | Moyen: gérer l'`hydrate` au démarrage et la purge, tests existants à adapter | M | `frontend/src/utils/posOutbox.js`, `frontend/src/store/modules/guestPos.js` |
| Persister le dernier catalogue (IndexedDB) et l'afficher d'abord, rafraîchir en arrière-plan | Ouverture immédiate et utilisable hors ligne | Prix périmés: le serveur recalcule les prix; vérifier le comportement de `assertPayments` si le total client diffère (non lu) | M | `frontend/src/store/modules/guestPos.js`, `useGuestPosCatalog.js`, `GuestPosView.vue` |
| Timeout court (par exemple 8 à 10 s, à valider) sur le POST de vente puis basculer en "en attente" | Le caissier n'attend plus 60 s | Faible: idempotent sur `clientTicketId` | S | `frontend/src/api/endpoints/guestPos.api.js:19-25` |
| Ne pas relancer le catalogue complet après chaque vente (espacer, regrouper ou ne rafraîchir que la disponibilité) | Moins de charge réseau et serveur | Disponibilité un peu moins fraîche | S | `guestPos.js:301, 323` |
| Backoff exponentiel sur le rejeu de la file | Moins de pression quand le réseau est mauvais | Faible | S | `useGuestPosNetwork.js` |
| Premier chargement de l'historique plus petit (50) et filtres côté serveur | Dialog plus rapide en fin de match | Faible | S | `guestPos.js:365`, `useGuestPosHistory.js` |
| Charger les dialogs en `defineAsyncComponent` | Chunk d'entrée plus léger | Faible | S | `GuestPosView.vue:57-59` |
| Confirmer ou ajouter l'enregistrement d'un service worker pour le shell | Redémarrage hors ligne | Moyen: stratégie de cache et mises à jour | M | `frontend/vue.config.js`, `frontend/src/main.js` (non lu) |

### Backend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Sortir `ensureReferentials` / `ensurePosSource` du chemin de chaque vente (marqueur mémoire ou Redis par (tenant, évènement, PdV), ou n'écrire que si absent) et supprimer les relectures redondantes (`event`, intégration, `posEventSetting`) | Latence par vente divisée (une dizaine d'allers-retours en moins) | Moyen: renommage de PdV ou d'article à propager (les `update` de nom sont dans ces méthodes) | M | `backend/src/features/pos/sales/pos-sale.service.ts`, `backend/src/features/pos/services/pos-source.service.ts` |
| Cache Redis partagé de la disponibilité par espace (TTL de l'ordre de 10 à 15 s, à valider), au lieu des 3 s en mémoire d'un process | Une seule exécution du SQL lourd pour toutes les tablettes et instances | Disponibilité un peu moins fraîche | M | `backend/src/features/pos/availability/pos-stock-snapshot.service.ts` |
| Mettre en cache `perUnitByMenuItem` (clé tenant + articles, TTL court ou invalidation sur modification de recette) | Évite l'explosion de recettes à chaque catalogue | Invalidation à bien couvrir | M | `backend/src/features/pos/availability/pos-recipe-requirements.service.ts` |
| Passer `lowThreshold` du contexte à `computeForPdv` (l'option existe, `pos-availability.service.ts:45`) et réutiliser les réglages déjà lus | Deux lectures en moins par catalogue | Aucun | S | `pos-catalog.service.ts`, `pos-availability.service.ts` |
| Clôture en SQL (somme et groupement) plutôt que chargement de tous les tickets; borner la requête pourboires; ne recalculer agrégat et count qu'à la première page | Fin de match sans pic mémoire ni lecture complète | Moyen: garder les mêmes arrondis (le code vise des totaux identiques à la ligne près) | M | `backend/src/features/pos/sales/pos-sales-query.service.ts` |
| Option: cache court de `guestPinAccess` dans la stratégie JWT | 1 requête en moins par appel | Fort: contredit la révocation immédiate documentée, à ne faire que sur décision métier | S | `backend/src/core/auth/strategies/jwt-guest-pin.strategy.ts` |

### SQL / index
| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| EXPLAIN (ANALYZE) de `salesByElementSince` sur des volumes de prod; vérifier les index sur `WeezeventTransaction` (tenant, statut, date), `WeezeventTransactionItem` (transactionId), `WeezeventLocationShopMapping`; évaluer le remplacement du OR de jointure | Réduit le coût du calcul de disponibilité | Selon l'index | S pour mesurer, M pour corriger | `backend/src/features/logistics/logistics.queries.ts:6-29`, schéma Prisma |
| Vérifier l'existence réelle de l'index `(tenantId, locationId, status, eventId)` cité en commentaire pour les `COUNT` de numérotation | Numérotation et `nextTicketNumber` en lecture d'index seule | Aucun | S | schéma Prisma (non lu) |

## 7. Points non vérifiés

- Toute la page staff POS: `SpacePosView.vue`, 23 composants, `pos.api.js`, store `pos.js`, composables `usePos*`, contrôleur et services `backend/src/features/pos/config/`, et leurs requêtes, caches et listes non virtualisées.
- Durées réelles: aucune mesure. À relever dans l'onglet Network (catalogue, vente, session) sur réseau mobile bridé, et en base (EXPLAIN ANALYZE du SQL de disponibilité et du `count` de numérotation).
- Tailles réelles des réponses catalogue (nombre d'articles par PdV), historique (200 tickets) et clôture.
- Index réels sur `WeezeventTransaction*` (le modèle Prisma `SalesTransaction` correspond apparemment à ces tables, non confirmé), cités seulement d'après des commentaires.
- Comportement de l'intercepteur 401 (`client.js:167-171`) pour les jetons invités, et de `assertPayments` (`pos-sale-rules.ts`, non lu) quand le total client diffère du total serveur.
- `ensurePosSource` (`event-sales-source.service.ts`), `PosSaleCancelService`, `SalesPriceAggService.applyDeltaSafe` (coût en arrière-plan de chaque vente), `MenuItemPricingService.getTenantDefaultVatRate`.
- Présence réelle d'un service worker (configuration de build, `main.js`, `public/`), et donc du comportement hors ligne au démarrage.
- Effet du pooleur (latence par aller-retour SQL) sur le total de requêtes en série d'une vente.
