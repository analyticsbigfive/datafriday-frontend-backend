# Page Analyse, panneau de filtres gauche, entête, voile (rapport perf, partie 01e)

Statut: COMPLET pour le panneau gauche, `useFilters`, le voile, les watchers ciblés, `pickRevenueRecords`, `useMetricsCalculator` (boucles) et `useAnalyseTimeline` 56-144. Partiel pour `FilterBottomSheet`, `MultiSelectFilter`, `DayOfWeekFilter` (non lus, voir 7). Suite de `01c_analyse_template_filtres.md`. Frontend seulement, lecture seule.
Chemins relatifs à la racine du dépôt. `FP` = `frontend/src/components/space-workspace/analyse/filters/FilterPanel.vue`. `UF` = `frontend/src/composables/useFilters.js`
(PAS dans `analyse/composables/`). Durées: seulement celles des commentaires du code, signalées "commentaire". Rien n'est mesuré.

## 1. Fiche
- `FP` 1331 lignes (template `:1-590`, script `:592-977`, style `:979+`), importé par `analyse/views/AnalyseView.vue:884`. Vuetify installé: 3.12.4 (`frontend/node_modules/vuetify/package.json`).
- Sous-composants de `filters/` réellement montés par `FP`: `CheckboxListFilter` 141, `FilterSelectAll` 133, `ArticleDimensionFilters` 77, `DayOfWeekFilter` 28, `WeatherTemperatureFilters` 106.
- Code mort constaté par grep sur `frontend/src` (aucun `import`): `analyse/AnalyseAppHeader.vue` 960 l. (seulement cité en commentaires: `App.vue:191`, `WorkspaceAppHeader.vue:89`, `AnalyseView.vue:1804`), `analyse/FilterPanel.vue` racine 754 l. (importe `MultiSelectFilter`, mais personne ne l'importe), `filters/MultiSelectFilter.vue` 145 l. (seul importeur = le fichier racine mort `analyse/FilterPanel.vue:449`), `filters/FilterBottomSheet.vue` 327 l. (aucun importeur). Total 2186 lignes inutilisées, non lues en détail.

## 2. Arbre des composants du panneau gauche
| Composant | Fichier | Lignes | Rôle | Monté à l'ouverture ? | Données |
|---|---|---|---|---|---|
| FilterPanel | `FP` | 1331 | Accordéon de filtres | Toujours monté, même panneau replié (01c) | `events=analysableEvents`, `shops=shopNames` |
| v-expansion-panel x11 | `FP:35-555` | | Événements, Dates, Billetterie, Avancé, PdV, Types PdV, Zones PdV, Articles, Type/Catégorie, Marque/Industriel/Fournisseur | Titres toujours rendus. `FP:737` `openPanels = ref([])` (tout replié). Aucun `eager` (grep): Vuetify 3.12.4 `VExpansionPanelText` utilise `useLazy` (`lazy.js:9-12`): contenu monté à l'ouverture et DÉMONTÉ à la fermeture (`onAfterLeave` remet `isBooted=false`). Donc les listes ne coûtent que panneau ouvert | |
| FilterSelectAll | `filters/FilterSelectAll.vue` | 133 | Ligne "Tout sélectionner" | Un par liste ouverte | `visible`, `selected`; `selectedVisibleCount` = filter + Set, O(n) (`:35-38`) |
| CheckboxListFilter | `filters/CheckboxListFilter.vue` | 141 | Liste de cases natives | Jusqu'à 12 dans Avancé + 5 dans Marque/Industriel, seulement panneau ouvert | `(modelValue).includes(opt)` par ligne (`:14`), `iconFn(opt)` appelé 2 fois par ligne (`:17`) |
| ArticleDimensionFilters | `filters/ArticleDimensionFilters.vue` | 77 | 5 listes marque, industriel, fournisseur, promotion, type de promo | Panneau lazy | `useFilters()` + `useArticleDimensions()` (cache de module, 01c #23) |
| WeatherTemperatureFilters | `filters/WeatherTemperatureFilters.vue` | 106 | Liste météo + `v-range-slider` température | Dans Avancé, lazy | émet `update:temperatureRange` |

## 3. Appels API
Le panneau gauche n'appelle AUCUN endpoint lui-même (aucun `api`/`axios` dans le script `FP:592-977` ni dans les 4 sous-composants lus). Les appels sont déclenchés par les changements de filtres, via les watchers de `AnalyseView`:
| Déclencheur (action du panneau) | Appel | Où | Debounce | Bloque ? |
|---|---|---|---|---|
| PdV, type de PdV, zone, industriel, fournisseur | GET `/analyse/stock-valuation` | `useStockValuation.js:49-51`, `:60-70` (01c #21) | 300 ms (commentaire code `DEBOUNCE_MS`) | Non, carte stock en skeleton |
| Marque, promotion, catégorie ou type d'article, article | Aucun | signature hors périmètre (01c #21) | | |
| Cocher EXACTEMENT 1 événement (`toggleEvent` `FP:872-878`) | GET timeline batch (`getSpaceEventTimelineBatch`) puis `analyse/ensureEventCosts` | watcher `AnalyseView.vue:2098-2142` (`immediate`, `flush:'post'`) puis `useAnalyseTimeline.js:107-109` | AUCUN (`setFilterImmediate`) | Timeline en skeleton |
| Événements: 0 ou 2+ cochés | Aucun, `closeTimeline()` (`AnalyseView.vue:2118-2122`) | | | |
| Mode timeline "Moyenne" actif + toute modif de l'ensemble d'events (période, catégorie, billets, jour, météo) | Rechargement timeline de TOUS les `filteredEvents` | watcher `AnalyseView.vue:2155-2167` (signature = ids triés joints) | AUCUN | |
| Élargir le périmètre d'events (période plus large, retrait d'un filtre, vider la sélection) | paquets timeline item-level, paniers, coûts | `useAnalyseItemRecords.js:70-72`, `useTransactionBaskets.js:138` (01c 4.4) | portillon (01c) | `chartsLoading` vrai, moitié basse remontée |
| Rétrécir le périmètre | Aucun réseau (tout en cache) | 01c 4.3 | | |
Annulation: `loadTimelineForEvents` appelle `timelineAbortController.abort()` (`useAnalyseTimeline.js:82`) mais l'appel réseau `getSpaceEventTimelineBatch(spaceId, ids, { bypassCache })` (`:107`) ne reçoit PAS le signal. L'abort ne sert qu'à ignorer le résultat (`:110`, `:123`). Les requêtes précédentes continuent. Si `getSpaceEventTimelineBatch` lit un signal par un autre moyen: non vérifié.

## 4. Coût exact d'une action du panneau gauche

### 4.1 Mécanique d'écriture (lu)
| Chemin | Preuve | Debounce | Active `filtersRecomputing` | Utilisé par le panneau gauche |
|---|---|---|---|---|
| `setFilterImmediate` | `UF:166-174` | Aucun, dispatch synchrone | Oui, dans le MÊME tick que le dispatch (`:171-172`) | TOUT sauf 3 curseurs: événements (`FP:877`, `:887`, `:890`), période (`FP:118`), dates perso (`FP:132`, `:143`), config (`FP:855`, `:858`), PdV (`FP:884`, `:393`), types et zones PdV, articles, types et catégories (`toggleInFilter` `FP:949-955`), Avancé (`FP:216-317`), Marque etc. (`ArticleDimensionFilters.vue:21`), comparaison (`FP:564`) |
| `setFilter` | `UF:101-104` | 150 ms, UN minuteur pour toutes les clés d'une instance | Non | Curseurs billets vendus (`FP:164`), scannés (`FP:186`), température (`FP:269`) |
| `toggleArrayFilter(Many)` | `UF:119-164` | 150 ms par clé | Oui, avant la fenêtre | PAS utilisé par le panneau gauche (clics donuts et tags seulement). `FP` ne l'extrait même pas (`FP:707-717`) |

Constats de mécanique:
- Les minuteurs et `_pendingArrays` (`UF:110-111`) sont créés DANS `useFilters()` (fonction `UF:56`), donc PAR INSTANCE. `FP`, `ArticleDimensionFilters`, les donuts, les tables et `AnalyseView` ont chacun les leurs. `setFilterImmediate` n'annule que le toggle en attente de SA propre instance (`UF:170`). Un clic donut (150 ms en attente dans l'instance du donut) suivi d'une coche du panneau gauche sur la même clé peut être écrasé 150 ms plus tard par la valeur calculée avant la coche. De même `_scheduleRecomputeDone` ne voit que les minuteurs de son instance (`UF:173`), le voile peut s'éteindre trop tôt.
- Le commentaire `UF:8-13` annonce que le drapeau passe à vrai AVANT la fenêtre de coalescing pour laisser le navigateur peindre les voiles avant le burst. C'est vrai pour `toggleArrayFilter` (drapeau à l'appel, dispatch 150 ms plus tard) et FAUX pour `setFilterImmediate`: drapeau et dispatch dans le même tick (`UF:171-172`), donc le même flush Vue, aucune peinture entre les deux. Pour le panneau gauche (100 % `setFilterImmediate`), le voile n'apparaît qu'APRÈS le burst et disparaît 2 `requestAnimationFrame` plus tard (`UF:19-23`): il ne masque rien du gel. À confirmer au profileur.
- `AnalyseSkeletonVeil.vue:7` est un `div v-if` absolu à 3 lignes, animation CSS infinie `asv-shimmer` 1.1 s (`:38`): coût négligeable. 4 consommateurs (grep): `DonutChartCard.vue:5`, `MenuItemRevenueDistribution.vue:4`, `MenuItemsByShopTable.vue:4`, `SummaryPanel.vue:7`. Chacun relit `filtersRecomputing` et se re-rend 2 fois par action (vrai puis faux).
- Plusieurs `setFilterImmediate` dans le même tick (config + sélection d'events `FP:855-858`; `clearChip('timeRange')` + dates, `AnalyseView.vue:2169-2175`) donnent UN seul flush Vue (computed paresseux, watchers batchés). Le nombre de cascades est donc le nombre de TICKS, pas le nombre d'écritures. Mais deux clics distincts = deux cascades complètes, sans coalescing.
- `UPDATE_FILTER` est un simple `commit` (`analyse.js:2127-2128`, `:1564`): ni persistance ni appel réseau dans l'action.

### 4.2 Cascade d'un clic (rappel 01c 4.2, complété)
Une coche PdV ou catégorie lance, dans l'ordre: `filteredShopGranularData`, `itemLevelRecords`, `filteredTimelineData` (si event ouvert), `filteredBaskets`, `perShopTransactionRateSum`, `metrics` (`useMetricsCalculator.js:72-104`: boucle sur tous les records + boucle sur les paniers `:103` + boucle sur les events `:116`), `rendementCards` (2 `computeRevenuePerHeadcount`), `itemSummary`, puis le re-rendu de 8 composants lourds et des 4 voiles.
- Balayages de listes: au moins 6 sur de grosses listes (shop-level, item-level, timeline si ouverte, paniers, somme des taux par PdV, `totals` de métriques sur les records) plus 1 à 3 sur les events. Sans index par PdV: chaque filtre PdV relit tout, y compris les events non concernés.
- `pickRevenueRecords` (`utils/analyseRevenueSource.js:39-47`) est O(1): il renvoie `itemLevelRecords` ou `shopLevelRecords` tel quel. `chartRecords` et `kpiRecords` (`AnalyseView.vue:1345-1346`) pointent donc vers le MÊME tableau, deux computed redondants mais sans balayage (problème 01c #9 confirmé bas).
- `useMetricsCalculator` (226 l.): UN seul computed `totals` fait les boucles (`:72`), les 18 autres computed ne font que lire `totals.value` (`:157-184`). Pas de multiplication de balayages de ce côté.
- Réseau: voir tableau 3. Seuls PdV, type, zone, industriel et fournisseur ajoutent 1 requête (stock-valuation, 300 ms).

### 4.3 Coût par cas du panneau
| Action | Contrôle et liste | Écriture | Cascade | Réseau | Observations |
|---|---|---|---|---|---|
| Cocher un PdV | `v-list` de `v-list-item` (`FP:395-405`), source `props.shops` (noms de PdV), AUCUNE virtualisation, `max-height:300px` CSS seulement (`FP:1093` ou `:1162`) | `toggleShop` `FP:879-885` immédiat | Cas A complet (01c 4.2) | +1 stock-valuation (300 ms) | N clics = N cascades. Chaque ligne relit `filters.selectedShopIds.includes(shop)` (`FP:399`), O(PdV x sélectionnés) par rendu |
| Tout sélectionner PdV | `FilterSelectAll` (`:390`) | 1 écriture de toute la liste visible | 1 cascade | +1 | Bon: une seule cascade |
| Types, zones de PdV | cases natives `label v-for` (`FP:419`, `:444`), sans virtualisation | `toggleInFilter` `FP:949-955` | Cas A | +1 stock-valuation | `shopTypeCounts` (`FP:909-916`) balaie TOUS les `optionsBaseRecords` avec `resolveShopType` par record; le getter store `salesShopTypes` (`analyse.js:1013-1022`) refait le même balayage. `shopAreaCounts` (`FP:917`) idem. Dépendance: `optionsBaseRecords` (`analyse.js:1003-1009`) ne lit PAS les filtres, donc recalcul seulement au changement de records ou de config, pas au clic |
| Cocher un article | cases natives `label v-for="name in filteredMenuItemNames"` (`FP:493`), `filteredMenuItemNames` (`FP:944-948`) refiltré à chaque frappe de recherche, SANS debounce | `toggleInFilter` | Cas A | Aucun | Nombre d'articles distincts: non mesuré. Les noms sont dédoublonnés (`AnalyseView.vue:1672-1690`, `Set`), donc `menuItemNameCounts` (`FP:906`, `countOccurrences`) vaut 1 pour chaque nom, alors que le commentaire `FP:899` annonce des "occurrences ventes": compteur probablement faux, à confirmer côté template |
| Cocher type, catégorie d'article | cases natives (`FP:519`, `:539`) | `toggleInFilter` | Cas A | Aucun | Mêmes remarques |
| Marque, industriel, fournisseur, promo | 5 `CheckboxListFilter` (`ArticleDimensionFilters.vue:14-22`) | `setFilterImmediate` | Cas A | Industriel et fournisseur: +1 stock-valuation | Si l'index n'est pas chargé, les filtres ne filtrent rien (01c #12) |
| Cocher un événement | `v-list` de `v-list-item` (`FP:68-98`), `props.events` = `analysableEvents`, sans virtualisation | `toggleEvent` `FP:872-878` immédiat | Cas B/C (filteredEvents change) | 1 coché: timeline + coûts. 0 ou 2+: aucun. Élargissement: paquets | Par ligne et par rendu: `isFuture(event.date)` (`FP:967-976`: `new Date()` + `setHours` + `new Date(d)`) et `formatEventDate` (`FP:957-964`: `toLocaleDateString('en-GB', options)`), sans mémoïsation. Le panneau relit `selectedEventIds` partout, donc CHAQUE clic PdV ou article ré-évalue ces deux fonctions pour toutes les lignes si le panneau Événements est ouvert |
| Tout / aucun événement | `selectAllEvents` `FP:886-888` | 1 écriture de tous les ids visibles | 1 cascade, puis `closeTimeline` (2+ ids) | Élargissement possible | `clearEvents` (aucun) élargit toujours le périmètre (case C) |
| Choisir une période | `v-select` (`FP:118`) | `setFilterImmediate('timeRange')` | `dateBounds` change, `filteredEvents` nouveau tableau, cas B/C | selon élargissement | Watcher timeRange `AnalyseView.vue:1497-1505` léger. Le watcher `dateRangeItems` (`FP:820-825`) relit les saisons du store |
| Période personnalisée | 2 `v-text-field type="date"` (`FP:132`, `:143`) | un `setFilterImmediate` par champ | une cascade par champ rempli | selon élargissement | Le premier champ rempli déclenche déjà un recalcul avec une borne ouverte |
| Changer de configuration | `v-select` (`FP:851-859`) | 2 écritures (config + vider les events) | La PLUS lourde: `eventsInActiveConfiguration`, `analysableEvents`, environ 15 getters `unique*` (`analyse.js:1216-1251`, chacun `map` + `Set` + `sort` sur les events), `optionsBaseRecords` (`ids.has` sur tous les records), `salesShop*`, `filtersState`, plus la cascade A | contexte de config (`loadConfigShopContext`, `FP:731`) | Action rare |
| Curseurs billets, température | `v-range-slider` (`FP:154`, `:176`, `WeatherTemperatureFilters.vue:21`) | `setFilter` (150 ms, minuteur partagé par les 3 clés de l'instance) | Cas B/C à chaque pause d'au moins 150 ms pendant le glissement | selon élargissement, non annulable | `:model-value` lié au store: pendant le glissement la valeur ne change qu'après 150 ms de calme. Comportement visuel du curseur (retard, saut) non vérifié dans le navigateur. Pas de voile (`setFilter` n'active pas le drapeau) |
| Frappe dans une recherche (événements, PdV, articles) | `v-text-field v-model` (`FP:53`, `:380`, `:481`) | état local | Re-filtrage + re-rendu de la liste | Aucun | Aucun debounce; coût proportionnel à la taille de la liste |
| Avancé (15 listes), Jour, Météo | `CheckboxListFilter` | `setFilterImmediate` | Cas B/C | selon élargissement | `advCounts` (`FP:920-939`) boucle sur `analysableEvents` x 13 champs, dépend seulement des events (pas du clic) |

### 4.4 Rendu du panneau lui-même
- Le rendu de `FP` lit `filters.selectedEventIds`, `selectedShopIds`, `selectedMenuItemIds`, etc. (titres `FP:45`, `:372`, `:471`) et `advancedActiveCount` (`FP:772-794`, lit 14 clés). Toute écriture sur une de ces clés ré-exécute le rendu complet de `FP`, donc recrée les vnodes de toutes les listes OUVERTES (v-for de `v-list-item` Vuetify pour événements et PdV, cases natives ailleurs), même pour un clic sans rapport avec la liste.
- Jusqu'à 6 `FilterSelectAll` et 17 `CheckboxListFilter` peuvent être montés selon les panneaux ouverts; chacun recalcule `selectedVisibleCount` en O(n).
- `useFilters()` est appelé dans au moins `FP`, `ArticleDimensionFilters`, `AnalyseView`, les tables et donuts: chaque appel crée 17 computed d'options et ses propres Map de minuteurs (`UF:68-95`). Coût de création faible, paresseux tant que non lus.

## 5. Problèmes de performance
1. Aucune coalescence pour le panneau gauche: toutes les coches de listes passent par `setFilterImmediate` (`FP:884`, `:949-955`, `:877`, `ArticleDimensionFilters.vue:21`, `CheckboxListFilter` parents `FP:216-317`), donc UNE cascade complète (au moins 6 balayages de grosses listes + 8 composants) PAR clic. Cocher 5 PdV = 5 cascades, alors que `toggleArrayFilter` (150 ms par clé, `UF:119-136`) existe et n'est utilisé que pour les clics de graphes. Impact: haut. Pages: Analyse.
2. Le voile de recalcul ne protège pas le panneau gauche: drapeau et dispatch dans le même tick (`UF:171-172`), contrairement au commentaire `UF:8-13`. Impact: moyen (ressenti, gel sans retour visuel). Pages: Analyse.
3. Annulation cosmétique de la timeline: `abort()` (`useAnalyseTimeline.js:82`) sans transmettre le signal à `getSpaceEventTimelineBatch` (`:107`); en mode Moyenne chaque variation de l'ensemble d'events relance un fetch complet sans debounce (`AnalyseView.vue:2155-2167`). Plusieurs clics rapides = plusieurs lots réseau en parallèle, un seul retenu. Impact: moyen à haut selon le nombre d'events. Pages: Analyse.
4. Minuteurs de `useFilters` par instance (`UF:110-111`, `:101`): écrasement possible entre un toggle donut en attente et une coche du panneau; `setFilter` à minuteur unique par instance. Impact: moyen (justesse), faible probabilité. Pages: Analyse.
5. Listes sans virtualisation et sans mémoïsation de ligne: `v-list-item` Vuetify par événement et par PdV avec `isFuture` et `toLocaleDateString` recalculés à chaque rendu de `FP` (`FP:957-976`, usage `FP:83`). Les cases natives (`CheckboxListFilter.vue:10-20`, `FP:419-549`) sont moins chères mais `includes` + `iconFn` x2 par ligne. Tailles réelles des listes: non mesurées. Impact: moyen, inconnu tant que la liste n'est pas comptée. Pages: Analyse.
6. Curseurs: `setFilter` sans voile, valeur liée au store, mise à jour intermédiaire à chaque pause de 150 ms qui peut ÉLARGIR le périmètre et lancer des paquets réseau non annulables. Impact: moyen. Pages: Analyse.
7. Recherches sans debounce (`FP:861-870`, `:944-948`): recalcul de liste + rendu à chaque frappe. Impact: bas à moyen (selon taille). Pages: Analyse.
8. `shopTypeCounts` (`FP:909-916`) refait le balayage de `resolveShopType` déjà fait par le getter `salesShopTypes` (`analyse.js:1013-1022`), à l'ouverture du panneau. Impact: bas (recalcul seulement au changement de records). Pages: Analyse.
9. `menuItemNameCounts` appliqué à un tableau dédoublonné: compteurs probablement tous à 1 (`FP:906` vs `AnalyseView.vue:1672-1690`). Impact: bas (justesse), à confirmer dans le template (`FP:493-500` non relu pour l'affichage du compteur).
10. Code mort: 2186 lignes (`AnalyseAppHeader.vue`, `analyse/FilterPanel.vue`, `MultiSelectFilter.vue`, `FilterBottomSheet.vue`). Impact: bas (bundle si importés ailleurs: non; maintenance). Pages: Analyse.
11. Aucun index par PdV ou par article sur les records: chaque filtre relit tout (cf. 01c problème 4). Impact: haut. Pages: Analyse.

## 6. Recommandations
Les gains ne sont pas chiffrés (aucune mesure).
### Frontend
| Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|
| Faire passer `toggleShop`, `toggleEvent`, `toggleInFilter` et les `CheckboxListFilter` par un debounce 150 ms PAR CLÉ avec état optimiste local (exposer `_pendingArrays` en computed pour l'affichage coché) | N coches rapprochées = 1 cascade | Moyen: case cochée visuellement en retard si l'optimiste est mal câblé; interaction avec le voile | M | `UF`, `FP:872-885`, `FP:949-955`, `CheckboxListFilter.vue:48-54` |
| Dans `setFilterImmediate`, mettre le drapeau puis différer le dispatch d'un `requestAnimationFrame` (voile peint avant le burst) | Retour visuel avant le gel | Bas: +1 frame de latence | S | `UF:166-174` |
| Déplacer minuteurs et files d'attente au niveau du module (`Map` par clé, y compris `setFilter`) | Fin des écrasements inter-instances et du minuteur unique | Bas | S | `UF:101-135` |
| Passer le `signal` du contrôleur à `getSpaceEventTimelineBatch`, et debouncer 300 ms le watcher de signature du mode Moyenne | Fin des lots réseau orphelins | Bas à moyen: vérifier que l'API accepte un signal | S | `useAnalyseTimeline.js:82`, `:107`, `AnalyseView.vue:2155` |
| Précalculer par événement `{ dateLabel, isFuture }` dans un computed `eventRows` (et clés de recherche en minuscules) | Rendu de la liste sans `Date` ni `Intl` par ligne | Bas | S | `FP:861-865`, `:957-976`, template `FP:68-98` |
| Virtualiser (`v-virtual-scroll`) les listes événements, PdV, articles au-delà d'un seuil (200 lignes) ; alternative CSS `content-visibility:auto` | Rendu et patch bornés par la zone visible | Moyen: hauteur fixe, accessibilité, tests e2e | M | `FP:68-98`, `:395-405`, `:493-500`, `CheckboxListFilter.vue:9-22` |
| Debounce 200 ms sur les trois champs de recherche | Moins de re-rendus | Bas | S | `FP:53`, `:380`, `:481` |
| Curseurs: valeur locale pendant le glissement, écriture au relâchement (événement `end` Vuetify), voile activé | Une seule cascade par geste, pas de paquets intermédiaires | Bas à moyen: vérifier l'API `end` de Vuetify 3.12 | S | `FP:154-187`, `WeatherTemperatureFilters.vue:21-33` |
| Index mémoïsé par événement (Map PdV vers records, Map article vers records) pour que filtrer un PdV ne relise pas tous les events | Cascade A bien moins coûteuse | Moyen: invalidation sur nouveaux paquets | L | `analyse.js:903-991`, `AnalyseView.vue:1158-1169`, `:1261` (01c) |
| Calculer `shopTypeCounts` à partir de `salesShopTypes` (une seule passe, retourner aussi le compte) | Une passe de moins à l'ouverture | Bas | S | `FP:909-917`, `analyse.js:1013` |
| Supprimer les 4 fichiers morts après vérification des tests | -2186 lignes | Bas | S | `AnalyseAppHeader.vue`, `analyse/FilterPanel.vue`, `filters/MultiSelectFilter.vue`, `filters/FilterBottomSheet.vue` |
### Backend et SQL
Aucune action déduite de ce passage (le panneau gauche n'appelle aucun endpoint). Rappel 01c: profiler `GET /analyse/stock-valuation`.

## 7. Points non vérifiés
- `FilterBottomSheet.vue`, `MultiSelectFilter.vue`, `DayOfWeekFilter.vue` (28 l.) et `AnalyseAppHeader.vue` (960 l.): non lus (fichiers morts, ou trop petits pour l'enjeu). L'absence d'import vient d'un grep sur `frontend/src`, pas d'une lecture de chaque importeur (imports dynamiques `import()` non cherchés).
- `FP` template lignes 1-30, 112-149, 199-366 (hors lignes citées), 410-466, 555-590: lus partiellement par grep. L'affichage du compteur d'articles (`menuItemNameCounts`) n'est pas confirmé.
- Nombre réel d'événements, de PdV, d'articles distincts dans une grosse base: non mesuré. Toutes les affirmations "sans virtualisation" sont structurelles, pas chiffrées.
- Comportement du curseur Vuetify avec `model-value` piloté par le store et un debounce: non testé navigateur.
- Peinture réelle du voile avant ou après le burst (analyse par le code seulement): à confirmer au profileur Performance.
- `getSpaceEventTimelineBatch` (lecture d'un signal par un autre canal): non lu.
- `useStockValuation` / `useRendementWidgets`: relus dans 01c, non relus ici.
- Directive `v-can`, keepAlive du layout: voir 01c.
