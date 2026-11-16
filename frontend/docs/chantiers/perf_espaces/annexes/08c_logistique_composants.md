# 08c. Logistique, composants frontend non lus par 08_logistique.md

Statut: FINAL mais PARTIEL (arrêt demandé par le coordinateur). Complète 08_logistique.md (même dossier). Lecture seule. Aucune mesure: aucune durée, taille de réponse ni nombre de PDV x articles n'a été mesuré. Les nombres d'items sont donnés comme formule (N_elements x N_articles), pas comme valeur. Backend hors périmètre: seuls URL et paramètres sont cités. Chemins relatifs à `frontend/src/` sauf mention contraire. Préfixe composants: `components/space-workspace/logistic/` noté `lg/`.

## 1. Fiche de la page

Même page que 08_logistique.md (route /spaces/:spaceId/logistic, `SpaceLogisticView.vue` 2216 l., keepAlive, permission `front.fb.logistic`; invité /pdv/ventilation, `views/GuestVentilationView.vue` 286 l.). Ce document ne détaille que les enfants non lus par 08.

## 2. Arbre des composants (lus ici)

| Composant | Fichier | Lignes | Rôle | Monté ou différé | Props / données |
|---|---|---|---|---|---|
| LogisticByItemView | lg/LogisticByItemView.vue | 297 | onglet By Item: pivot éléments vers articles, cartes dépliables, loupe via prop `search` | différé (`v-else-if` hôte l.417, d'après 08) | 12 props dont 7 fonctions (l.136-163); émet go/add/remove/print |
| LogisticElementRow | lg/LogisticElementRow.vue | 154 | ligne PDV ou stockage (nom, badges rupture/bas, 2 boutons) | monté, `v-for` non virtualisé (hôte l.400-412) | element, totalItems, ruptureCount, lowCount, configTags (l.39-50) |
| LogisticItemCard | lg/LogisticItemCard.vue | 428 (template l.1-115, script l.117-230, reste CSS) | carte article en drill-in | différé (drill-in) | 12 props (l.126-153) |
| LogisticAggregateView | lg/LogisticAggregateView.vue | 355 (script jusqu'à l.165) | ruptures et stock bas groupés par article | monté si `!drillElement` (08) | `stats` {bad, warn, uncounted, rows}, `loading` (l.110-114) |
| LogisticConfigSelect | lg/LogisticConfigSelect.vue | 180 (script l.57-82) | menu de configuration | monté (sauf onglet Ventilation, 08) | configurations, modelValue |
| LogisticEventSelect | lg/LogisticEventSelect.vue | 117 (script l.38-80+) | menu multi-matchs | monté partout (08) | events, modelValue, label |
| LogisticVentilationTransfers | lg/ventilation/LogisticVentilationTransfers.vue | 150 (script l.100-123) | transferts source vers PDV, affectation | onglet Ventilation, `v-if="hasContent"` (l.2) | `controller` (useVentilationTransfers) |
| LogisticSupplierSelect | lg/ventilation/LogisticSupplierSelect.vue | 86 | filtre fournisseur | si options (08) | lu par grep seulement (imports, un computed `label` l.58): non vérifié pour le reste |
| LogisticHistoryDrawer | lg/drawers/LogisticHistoryDrawer.vue | 367 (script l.84-281) | historique d'un PDV | déclaré en permanence (08), `v-navigation-drawer` temporary, charge à l'ouverture | modelValue, element, items |
| LogisticLossesDrawer | lg/drawers/LogisticLossesDrawer.vue | 215 (script l.74-154) | pertes de transfert | idem | modelValue, spaceId, spaceName |
| LogisticDepositConfirmDrawer | lg/drawers/LogisticDepositConfirmDrawer.vue | 218 (lignes 1-175 lues) | confirmer un dépôt (crayon) | `Teleport` + `v-if="modelValue"` (l.2-4): rien de monté fermé; aussi utilisé par la page invité | deposit, saving, error |
| LogisticTransferConfirmDrawer | lg/drawers/LogisticTransferConfirmDrawer.vue | 248 (lignes 1-205 lues) | confirmer un transfert reçu | `Teleport` + `v-if` (l.2-4), même principe | transfer, elementName, item, unitsPerPack, saving, error |
| LogisticPrintDialog | lg/dialogs/LogisticPrintDialog.vue | 83 | export/impression | déclaré en permanence (08) | non lu en détail (imports et watch par grep) |
| LogisticVentilationAccessDialog | lg/dialogs/LogisticVentilationAccessDialog.vue | 135 (lignes 1-100 lues) | PIN et QR des logisticiens | déclaré en permanence (08), `v-dialog` | status, loading, busy, error, hasEvent, spaceName |
| LogisticMovementDialog | components/space-workspace/shared/LogisticMovementDialog.vue | 601 | popup + / - | déclaré en permanence (08) | NON LU sauf imports (l.185-188) et watch (l.366-376) |
| GuestVentilationView | views/GuestVentilationView.vue | 286 (lignes 1-94 et 225-273 lues) | page invité | route lazy (08) | monte LogisticVentilationView, LogisticVentilationDeposits, DepositConfirmDrawer, un `v-dialog` prénom, un `v-snackbar` (l.24-77) |

## 3. Appels API, composant par composant

Les composants ByItemView, ElementRow, ItemCard, AggregateView, ConfigSelect, EventSelect, Transfers (composant), SupplierSelect, DepositConfirmDrawer, TransferConfirmDrawer n'appellent ni réseau ni store (aucun import d'api ou de dispatch, vérifié par lecture ou grep). Le travail réseau passe par l'hôte.

| Déclencheur | Méthode + URL | Fonction front (fichier:ligne) | Séquentiel / bloque | Cache front | Remarque |
|---|---|---|---|---|---|
| Ouverture HistoryDrawer (`watch modelValue`, l.193-197) | GET /logistics/element/:elementId/history (params limit, cursor) | drawer l.248 vers store `logistics/loadHistory` (store l.278) puis api logistics.api.js:132-138 | un appel, spinner (l.21-23) | aucun, état vidé à chaque ouverture (l.241-246) | pagination par curseur (bouton "plus", l.74-78, l.260-278); le drawer n'envoie pas `limit` (l.248): taille de page = défaut serveur, non vérifié |
| Ouverture LossesDrawer (`watch modelValue`, l.106-110) | GET /logistics/:spaceId/losses (params cursor, includeArchived) | drawer l.108 vers store `logistics/loadLosses` (store l.350), logistics.api.js:176-183 | un appel | liste dans le store | "plus" par curseur (l.126-129) |
| Clic "tout télécharger" | GET /logistics/:spaceId/losses/export (blob) | drawer l.134 vers `downloadLossesCsv`, logistics.api.js:199-200 | clic seul | non | bas |
| Clic "archiver" | POST /logistics/:spaceId/losses/archive | drawer l.143 vers store `archiveLosses` (store l.367 relance `loadLossesSummary`) | clic seul | non | bas |
| Entrée en drill-in (hôte, 08) | GET /logistics/element/:elementId/pending-transfers | store l.283, logistics.api.js:120-127 | 1 GET par entrée | store | cité par 08 |
| Setup de l'hôte (08) | GET /spaces/:spaceId/logistic-tasks/assignable-staff | `useAssignableStaff.fetchStaff` (composables/useAssignableStaff.js:14-19), api logistic-tasks.api.js:34-36 | part au setup même hors onglet Ventilation (08) | aucun; erreur avalée, `staff = []` (l.21-22) | alimente les 2 selects de Transfers (Transfers l.17-20, 55-63) |
| `fetchPredictedNeed` sans feuille (08) | GET /events/:eventId/predict-versions | `loadPredictedNeed` (composables/usePredictedNeed.js:224-245), api eventPredict.api.js:20-22 | un appel par event, avant le calcul | repli localStorage seulement si l'API échoue ou renvoie vide (l.230-235) | renvoie TOUTES les versions, une seule est gardée (`pickReferenceVersion`, l.32-35); taille non mesurée |
| `fetchPredictedNeed` avec feuille (08) | GET /spaces/:spaceId/restock-plans puis GET /restock-plans/:id par feuille | restock.api.js:110-115 et 121-126 | la liste puis N feuilles en parallèle (08) | aucun; `suppressGlobalError: true` donc erreurs silencieuses | `getRestockPlan` renvoie le plan "photo comprise" (restock.api.js:117-120), donc lignes shop x article complètes; poids non mesuré |
| Ouverture de la page (hôte l.1432, 08) | GET /market-prices (SANS paramètre) | `getMarketPrices()` market.price.api.js:14-22 | dans le `Promise.all` bloquant (08) | idempotent par instance (08) | voir 5.1: sans `page`/`limit`, le commentaire du code dit PAGE 1, 200 lignes (market.price.api.js:15-17). 08 parlait de catalogue complet: à corriger |
| Ouverture et chaque tick de 10 s (08) | GET /inventory/:spaceId/latest | `getLatestInventory`, inventory.api.js:25-32 (404 devient null) | tick | aucun | pas de condition de changement |
| Polling Tâches | GET tâches toutes les `POLL_MS = 20000` ms | LogisticTasksPanel.vue:133 et 227 (`setInterval(this.fetchTasks, POLL_MS)`) | indépendant du timer de 10 s de l'hôte | non | aucune occurrence de `document.hidden` ni `visibilityState` dans ce fichier (grep): le timer ne se met pas en pause onglet caché |
| Retour sur la page (keep-alive) | revalidation de l'hôte | `useRefreshOnReturn(() => revalidate.value?.())` hôte l.735; composable useRefreshOnReturn.js:17-40 | `onActivated`, première activation ignorée (l.22-25) | n/a | seuil `minAwayMs = 30000` par défaut (l.17), l'hôte ne passe pas d'option; `refresh` doit être silencieux (l.12-13) |
| Page invité, dépôt | POST /guest-pin/ventilation/deposits (08) puis PUT /guest-pin/ventilation/checks | GuestVentilationView.vue:227 (`await this.deposit`) puis 230-235 (`ventilationChecks.confirmRow`), guestPin.api.js:109 | strictement séquentiel: dépôt, puis coche | non | coche non optimiste (voir 3.1) |
| Page invité, lecture | GET /guest-pin/ventilation/checks | guestPin.api.js:102-103 | avec la feuille (08) | non | |

### 3.1 Checkmark de dépôt, compléments

- Page staff: voir 08 3.3 (écriture série, pas d'optimiste). Rien de plus lu ici.
- Page invité: le crayon passe par `DepositConfirmDrawer` (`submit`), puis `await this.deposit(...)` (POST, une part après l'autre d'après 08), puis seulement `confirmRow` (PUT checks) (GuestVentilationView.vue:226-235). Le drawer reste en `saving` pendant les deux écritures; il ne se ferme (`depositDialog = false`, l.228) qu'après le dépôt, avant la coche. L'état coché n'apparaît donc qu'après la fin de la chaîne. Annulation: `await this.cancel(movement.id)` unitaire (l.249-260). Pas de debounce, protection par `cancellingId` (l.250) et `saving`.
- Cas d'échec partiel géré: `e.partialDeposit` ferme le drawer (l.238-241).

## 4. Cascade au premier affichage (compléments à 08)

- Au montage de l'hôte, ByItemView, ItemCard, drawers (Deposit/Transfer) et Transfers ne sont pas rendus (conditions ci-dessus). Rendus dès l'ouverture: ElementRow x N_elements, AggregateView, ConfigSelect, EventSelect (le contenu des `v-menu` ne se monte qu'à l'ouverture, non vérifié côté Vuetify), `v-navigation-drawer` Historique et Pertes (coque présente, contenu vide).
- `LogisticMovementDialog` et `LogisticVentilationAccessDialog` sont dans l'arbre dès le départ; AccessDialog embarque `GuestPinQrDialog` (statique, l.67) qui importe la lib `qrcode` et une image PNG (GuestPinQrDialog.vue:49-52): ces dépendances sont dans le chunk de la route (taille non mesurée). `tableExport` charge `xlsx` et `jspdf` en import dynamique (utils/tableExport.js:30 et 49): bon point.
- Le chemin critique reste celui de 08 (Promise.all de 6 à 8 requêtes). Le catalogue MarketPrice est limité à une page de 200 lignes d'après le commentaire: ce poids est donc plafonné, mais il contient potentiellement des images en base64 (08).

## 5. Problèmes de performance

1. Catalogue MarketPrice appelé sans pagination. `getMarketPrices()` sans argument (hôte l.1432) renvoie la page 1 (200 lignes selon le commentaire market.price.api.js:15-17, contrôleur non vérifié). Deux conséquences: (a) le poids est borné mais reste chargé en bloc au chemin critique; (b) si l'espace a plus de 200 prix, le repli fournisseur et photos est incomplet (défaut fonctionnel silencieux). `fetchAllPaginated` existe (utils/paginateAll.js:27, limit 100, concurrency 4) mais n'est pas utilisé ici. Rectifie le "catalogue complet" de 08 (points 2 et table 3.1). Impact: moyen (perf), moyen (justesse). Pages: Logistique.
2. ByItemView: toutes les lignes de tous les groupes sont dans le DOM même repliées. Le détail est en `v-show` (l.54), pas `v-if`, avec `v-for` sur `group.rows` (l.55-94): coût de rendu et de mémoire = N_articles x N_elements lignes (2 boutons, 4 v-icon, libellés calculés par ligne). Chaque libellé appelle `compactQtyLabel` et `predictedPacksText` (l.72-74). Impact: haut probable (non mesuré). Pages: Logistique, By Item.
3. ByItemView: pivot recalculé en bloc. `groupedItems` (l.186-240) dépend de `entries`, `itemKindFilter`, `search` et de 7 fonctions. Pour chaque couple élément x article: `itemStatus`, `isCounted`, `expectedDisplay`, `predictedNeedFor`, `predictedNeedPacksFor`, `unitsPerPackFor`, `configNamesFor` (l.207-217) et `resolveItemPicture` par article (l.198, 203). Ces fonctions de l'hôte ne sont pas mémoïsées (08 point 4). `configNames` est calculé par ligne (l.217) mais n'est lu nulle part dans le template (l.1-99): travail inutile. `lookupPredictedNeed`/`lookupPredictedNeedPacks` appellent `normalizeStr(item.name)` à chaque appel (usePredictedNeed.js:147 et 212). Tri avec `localeCompare(..., 'fr')` dans les comparateurs (l.232, 239). La recherche est dans le même computed (l.227-229): une frappe refait tout le pivot. Impact: haut (O(N_elements x N_articles) par tick de 10 s et par frappe, non mesuré). Pages: By Item.
4. Pas de debounce sur la recherche. `AppSearchBar` émet `update:modelValue` à chaque `@input` (components/common/AppSearchBar.vue:16) et aucun `debounce` ni `setTimeout` n'y figure (grep). Confirme 08 point 13: chaque frappe recalcule le pivot (point 3) et `filterEntries` de l'hôte. Impact: moyen. Pages: Logistique.
5. Images non différées. `<img :src>` sans `loading="lazy"` pour chaque groupe, même replié (ByItemView l.33, AggregateView l.45-50, ItemCard l.5-11); la source peut être un data-URI base64 (08). `failedPictures` est un `Set` non réactif dans ByItemView (l.167): le repli sur l'icône ne se redessine pas après erreur (bug mineur, perf nulle). Dans AggregateView le Set est dans `data()` donc réactif (l.124). Impact: moyen.
6. AggregateView: `groupedItems` (l.140-162) se recalcule à chaque nouvel objet `stats`, recréé par l'hôte à chaque réponse /stock (08 point 3). Liste bornée à 360 px avec défilement (l.202-210) mais tous les groupes et lignes sont rendus (`v-show` l.68). Moins lourd que ByItemView (seulement bad/warn). Impact: bas à moyen.
7. ItemCard: chaque carte est un `v-card` + 2 `v-btn` + plusieurs `v-icon` Vuetify (l.2, 103-112), donc N_articles du PDV composants Vuetify en drill-in, non virtualisés (08). Computeds légers (l.160-205). Impact: moyen.
8. HistoryDrawer: `qtyLabel` fait `this.items.find` par mouvement (l.211), soit O(mouvements x articles); `rows` et `groups` se recalculent sur tout le tableau à chaque "plus" (l.138-191, 270). Tous les jours chargés sont rendus, seul l'affichage est replié en `v-show` (l.55). Pas de cache: relecture à chaque ouverture (l.195, 241-246). Impact: bas à moyen (page de taille serveur inconnue).
9. LossesDrawer: `qtyLabel` appelle `store.getters['logistics/itemByKey'](loss.itemKey)` (l.123), un scan linéaire non mémoïsé d'après 08, 3 fois par ligne de perte (l.56-58). Impact: bas.
10. Deux timers indépendants sur la même page: 10 s (hôte, 08) et 20 s (panneau Tâches, LogisticTasksPanel.vue:133, 227), le second sans pause onglet caché. Calcul indicatif d'après 08 et ce rapport, par onglet ouvert au premier plan: hors Ventilation, 2 GET toutes les 10 s (12 par minute) plus 1 GET Tâches toutes les 20 s (3 par minute) soit 15 par minute; en Ventilation, 5 GET toutes les 10 s (30 par minute) plus 3 soit 33 par minute. Onglet caché: l'hôte s'arrête, le panneau Tâches continue (3 par minute). Impact: moyen (charge serveur, non mesurée).
11. `getRestockPlan` renvoie le plan complet (restock.api.js:117-120) pour chaque feuille retenue, relu à chaque changement de sélection et à chaque retour après 30 s d'absence (useRefreshOnReturn.js:26, 08 point 9). Impact: moyen (poids non mesuré).
12. `usePredictedNeed`: `buildStockRequirements` s'exécute sur le fil principal à chaque `loadPredictedNeed` (usePredictedNeed.js:65-72); `mergeSources` copie les objets et fait un `find` linéaire par ligne et par clé (l.113-121), appelé deux fois par ligne (l.97, 103). Impact: moyen à bas, seulement en repli Event Predict (sans feuille).
13. `useAssignableStaff`: un GET au setup, sans cache et sans condition d'onglet (08 point 10); erreur avalée sans nouvelle tentative (l.21-22). Impact: bas.
14. `DepositConfirmDrawer` et `TransferConfirmDrawer` réinitialisent le formulaire quand la prop `deposit` ou `transfer` change pendant que le drawer est ouvert (Deposit l.165-167, Transfer l.144-146). Si l'hôte recrée cet objet lors d'un tick de 10 s, la saisie en cours serait écrasée. NON VÉRIFIÉ: la provenance de `depositTarget` et `transfer` côté hôte n'a pas été relue. Impact: justesse, à confirmer.
15. Page invité: elle monte `LogisticVentilationView` avec `show-search` (GuestVentilationView.vue:24-35), donc les mêmes listes non virtualisées que la page staff, sur mobile. Impact: moyen (voir 08 point 12 pour le polling de 30 s).
16. Bons points relevés: les deux drawers de confirmation ne montent rien fermés (`Teleport` + `v-if`); `EventSelect` n'applique la sélection qu'à la fermeture du menu, donc un seul rechargement pour plusieurs matchs cochés (EventSelect l.58-67); l'export XLSX/PDF est en import dynamique; `useRefreshOnReturn` ignore la première activation et les retours sous 30 s.

## 6. Recommandations

Frontend

| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| ByItemView: remplacer `v-show` par `v-if` sur le détail (monter les lignes seulement dépliées), comme déjà fait dans Ventilation | divise le DOM par le nombre moyen de PDV par article | faible | S | lg/LogisticByItemView.vue:54-55 |
| ByItemView: sortir `search` du computed de pivot (filtre séparé sur les groupes déjà calculés), retirer `configNames` inutilisé, hisser un `Intl.Collator('fr')` unique | pas de re-pivot à la frappe, moins d'allocations | faible | S | lg/LogisticByItemView.vue:186-240 |
| Debounce 200 à 300 ms dans `AppSearchBar` (ou `v-model` différé côté hôte) | moins de recalculs par frappe | faible (latence perçue minime) | S | components/common/AppSearchBar.vue:16 |
| Ajouter `loading="lazy"` et `decoding="async"` aux `<img>`; rendre `failedPictures` réactif dans ByItemView | moins de décodage au rendu | faible | S | ByItemView l.33, AggregateView l.45, ItemCard l.5 |
| Appeler le catalogue MarketPrice via `fetchAllPaginated`, ou mieux un endpoint léger (id, nom, fournisseur, photo) hors chemin critique | corrige le plafond à 200 et sort la charge du premier affichage | moyen | M | hôte l.1429-1444, market.price.api.js:14-22, utils/paginateAll.js:27 |
| Mettre en pause le timer du panneau Tâches onglet caché et le rattacher au même mécanisme que le polling de l'hôte | supprime les 3 GET par minute en arrière-plan | faible | S | lg/LogisticTasksPanel.vue:133, 227 |
| `qtyLabel` des drawers: construire une `Map` nom vers article une fois (computed), au lieu de `find`/`itemByKey` par ligne | O(n) au lieu de O(n x m) | faible | S | HistoryDrawer l.211, LossesDrawer l.123 |
| Mémoïser `normalizeStr(item.name)` dans les `lookup*` (ou indexer par nom normalisé une fois) | moins de calcul de chaînes dans le pivot | faible | S | composables/usePredictedNeed.js:142-148, 208-215 |
| Dépôt invité: affichage optimiste de la coche, ou un seul endpoint dépôt + coche | coche immédiate | moyen (rollback) | M | GuestVentilationView.vue:226-235 |
| Ne réinitialiser le formulaire des drawers que sur changement d'identité (movementId, clé de dépôt) | évite d'écraser la saisie | faible | S | DepositConfirmDrawer l.165, TransferConfirmDrawer l.144 |
| Virtualiser les listes ElementRow, ByItemView, ItemCard si le volume mesuré le justifie | selon volume | moyen | M | hôte, ByItemView, ItemCard |

Backend (hypothèses, non lues): endpoint photos/fournisseurs léger pour MarketPrice; filtre par `eventId` côté serveur sur `GET /events/:eventId/predict-versions` (ou paramètre `default=true`) au lieu de renvoyer toutes les versions; `getRestockPlan` avec option "sans photo" pour la Logistique.

SQL et index: aucune recommandation fondée, aucune requête lue.

## 7. Points non vérifiés

- Non lus du tout: contenu de `LogisticMovementDialog` (601 l., seulement imports l.185-188 et watch l.366-376; il pose `document.body.style.overflow`), `LogisticPrintDialog` (83 l., seulement imports et watch par grep), `LogisticSupplierSelect` (86 l., grep), `LogisticVentilationAccessDialog` lignes 100-135 (computed, `run`, CSS), `LogisticDepositConfirmDrawer` lignes 175-218, `LogisticTransferConfirmDrawer` lignes 205-248 (CSS probable), CSS des autres fichiers.
- Non lus: `useVentilationTransfers` (méthode `generate()` du controller de Transfers, donc ses écritures éventuelles), `useVentilationAccess` (endpoints PIN), `utils/stockPlanning` (`buildStockRequirements`), `utils/predictiveAnalytics` (`normalizeStr`), `utils/tableExport` au-delà des imports, `GuestPinQrDialog` au-delà des imports.
- GuestVentilationView.vue: lignes 1-94 et 225-273 lues; lignes 95-224 (data, computed, mounted, load, deposit) lues par 08 seulement en partie; lignes 273-286 sont du CSS (non lues).
- Backend: taille de page par défaut de `/logistics/element/:id/history` et `/logistics/:spaceId/losses`, limite réelle de `GET /market-prices` sans paramètre (200 d'après un commentaire du code), contenu et poids de `GET /events/:eventId/predict-versions` et de `GET /restock-plans/:id`.
- Provenance de `depositTarget` et du `transfer` passés aux drawers (point 5.14).
- Comportement de `v-menu` Vuetify (contenu monté ou non fermé) pour ConfigSelect et EventSelect.
- À mesurer: Network (taille de `/market-prices`, `predict-versions`, `restock-plans/:id`, `/inventory/:spaceId/latest`), profil Vue du pivot de ByItemView avec un espace réel, nombre réel de PDV x articles par espace, nombre de nœuds DOM de l'onglet By Item.
