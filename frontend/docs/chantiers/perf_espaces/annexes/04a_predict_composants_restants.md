# Rapport perf, Event Predict: composants restants (complément de 04_predict_sections.md)

Lecture seule. Chemins relatifs à la racine du dépôt. Aucune mesure: les durées et tailles viennent des commentaires du code ou sont des estimations signalées. "non vérifié" = non lu. Ce rapport complète `04_predict_sections.md` (ne reprend pas MenusSection computed, StaffSection, backend staffing).

## 1. Fiche de la page

Dossier: `frontend/src/components/space-workspace/event-predict/`. Hôte: `views/EventPredictView.vue` (10620 lignes). Onglet par défaut de la section Configuration/Stock/Staff: `predictSectionTab: "configuration"` (`views/EventPredictView.vue:1692`). Route/meta/keepAlive: non vérifié (hors périmètre).

Lignes (wc -l): `sections/EventPredictStockUpSection.vue` 1067, `EventDetailsEditor.vue` 1572, `AlgoTraceTerminal.vue` 572, `drawers/EventPredictSourcesDrawer.vue` 437, `drawers/EventPredictHistoryAliasDrawer.vue` 345, `sections/StockElementRow.vue` 215, `EventPredictRowActions.vue` 150.

## 2. Arbre des composants: montage à l'ouverture (template de EventPredictView)

Constats de montage (template `views/EventPredictView.vue`):
- Deux grandes branches: event passé `v-if="isPastSelectedEvent"` (`:517`, ne rend que `EventTimelineChart`, aucune section) et event futur `v-else` (`:561`). Tout ce qui suit concerne l'event FUTUR.
- `EventDetailsEditor` est dans le mode single-event (`:438-499`), toujours monté, hors branche passé/futur.
- `TabsContent` (`ui/tabsContent.vue:3`) utilise `v-show="isActive"`, et le slot est toujours rendu. Donc le contenu des 3 onglets est évalué dans le template, MAIS chaque section a son propre `v-if` d'onglet (voir tableau), ce qui évite le montage. Seuls éléments statiques hors `v-if` rendus en permanence: le bandeau CTA Réarmement (`:923-939`) et le lien Inventaire (`:909-914`).

- Les drawers `EventPredictSourcesDrawer` (`:649`) et `EventPredictHistoryAliasDrawer` (`:661`) sont dans le `v-else` (`:586`) de la chaîne `v-if="timeline.timelineLoading || !timeline.hasCalculated"` (`:569`) / `v-else-if="timeline.timelineError"` (`:576`). Conséquence: ils sont montés seulement quand la timeline est calculée, et DÉMONTÉS à chaque recalcul (`timelineLoading` vrai, y compris le recalcul partiel au "apply" des sources) puis remontés. Le contenu de chaque drawer n'est rendu qu'ouvert (voir `EventDrawerShell`, `04_predict_sections.md` section 2).
- `AlgoTraceTerminal` (`:752`) et son toggle (`:746`) ne sont montés que si `debugPredictionAvailable` (`:1608`). Hors dev et sans `?debugPrediction=1`, le composant n'est pas monté du tout.

### Tableau des composants du périmètre

| Composant | Fichier | Lignes | Rôle | Monté ou différé | Props / données |
|---|---|---|---|---|---|
| EventPredictStockUpSection | `sections/EventPredictStockUpSection.vue` | 1067 | Besoin en stock par PDV ou par élément (ingrédient, composant, emballage), via expansion récursive des recettes | Différé: `v-if="predictSectionTab === 'stockup'"` (`EventPredictView.vue:941`), `:key` sur `currentEditingVersionId` donc remonté à chaque changement de version (`:942`). Non monté à l'ouverture (onglet par défaut = configuration, `:1692`) | `configuration`, `menuItems`, `ingredients`, `components`, `predictedTimelineData`, `selectedMenuItems`, `quantityAdjustments`, `manualQuantities`, `viewMode`, `menuItemCostMap`, `itemsContext`, `shopMenuUnavailable`, `configShops` (`:943-955`). Aucun appel réseau |
| StockElementRow | `sections/StockElementRow.vue` | 215 | Ligne d'un élément stockable (nom, sources "utilisé dans", pastilles par PDV, packaging, coût) | Enfant de StockUp, un par ligne. En vue PDV, seulement pour les PDV dépliés (`StockUp.vue:108`, `expandedShops`). En vue article, une par élément, TOUS rendus (`:52`) | `name`, `unit`, `totalQuantity`, `unitCost`, `itemType`, `isExpanded`, `sources` (tableau), `shops` (tableau), `packaging` (objet) |
| AlgoTraceTerminal | `AlgoTraceTerminal.vue` | 572 | Terminal de trace de l'algo (lecture seule) | Différé: seulement si `debugPredictionAvailable` (dev ou `?debugPrediction=1`) | 12 props (`EventPredictView.vue:752-766`) |
| EventPredictSourcesDrawer | `drawers/EventPredictSourcesDrawer.vue` | 437 | Sélection des events sources de la prédiction | Monté quand timeline calculée, contenu à l'ouverture | `scoredEvents`, `unselectedEvents`, `selectedIds`, `loading` (`:649-656`) |
| EventPredictHistoryAliasDrawer | `drawers/EventPredictHistoryAliasDrawer.vue` | 345 | Alias d'historique d'article | idem | `catalogItems`, `sourceCandidates`, `aliases`, etc. (`:661-671`) |
| EventDetailsEditor | `EventDetailsEditor.vue` | 1572 | Bandeau d'édition des métadonnées event | Monté dès l'ouverture, mode single-event, hors branche passé/futur (`:441`) | `event`, `configurations`, `eventTypes`, `eventCategories`, `eventSubcategories`, `teams`, `fromMock`, `showAttendance`, `showSessions` (`:441-450`) |
| EventPredictRowActions | `EventPredictRowActions.vue` | 150 | Menu d'actions de ligne (importé par MenusSection) | (voir section 3 du présent rapport) | |

## 3. StockUp: détail (lu en entier, `EventPredictStockUpSection.vue`)

Appels API: aucun (aucun import `@/api`, imports `:152-177`). Tout est CPU front à partir des props.

Pipeline de computed (tous dans le même composant, évalués au montage de l'onglet):
1. `menuItemsById` (`:249`) et `componentLookup` (`:260`): deux `Map` sur le catalogue, une passe chacun. Bas.
2. `fbElements` (`:275`): parcours des étages de la config, repli sur `configShops` (`:317`) puis sur `syntheticElementsFromTimeline` (`:332`, une passe sur `predictedTimelineData`). Bas à moyen (repli).
3. `timelineDataIndex` (`:372`): `buildTimelineQuantityIndex(predictedTimelineData)`, une passe complète sur la timeline, DÉJÀ calculée dans MenusSection. Doublon de travail à chaque basculement d'onglet (les deux sections ne coexistent pas, PERF `EventPredictView.vue:848-851`, donc l'index est reconstruit à chaque aller-retour d'onglet).
4. `shopStockData` (`:380`): pour CHAQUE PDV (`fbElements.forEach`), pour chaque article sélectionné: `isItemUnavailable`, `getAdjustedQuantity`, puis `expandMenuItem` (récursif, `utils/menuItemExpansion.js`, 251 lignes, non lu en détail) puis agrégation avec `existing.sources.find(...)` linéaire (`:421`) et copies d'objets (`{...item, sources: item.sources.map(...)}`, `:432-435`). Coût de l'ordre PDV × articles sélectionnés × lignes de recette. Calculé pour TOUS les PDV même si la vue PDV n'en affiche que les dépliés, parce que `sortedShopElements` (`:457`) lit `shopStockData[el.id]` de chacun pour filtrer. Impact moyen à haut selon l'event (non mesuré).
5. `getAdjustedQuantity` (`:610`) commence par `this.fbElements.find(el => el.id === elementId)` (`:611`): recherche linéaire par couple (PDV, article). Bas.
6. `elementStockData` (`:477`): recalcul complet en vue article, dérivé de `shopStockData`, avec `agg.sources.find` linéaire par source (`:508`), plus un tri `localeCompare`. Réévalué seulement en `viewMode === 'item'` (lecture dans le template `:34`).
7. `totalStockCost` (`:532`) n'est PAS évalué: `v-if="showTotalStockCostBar && totalStockCost > 0"` (`:44`) court-circuite sur `showTotalStockCostBar: false` (`:242`). Bon.

Rendu:
- Vue article: `v-for="el in elementStockData"` (`:52`), liste NON virtualisée, un `StockElementRow` par élément stockable du camion (potentiellement plusieurs centaines pour un gros event, non mesuré), chacun avec sa liste `sources` (`StockElementRow.vue:11`) et ses pastilles `shops` (`:23`) non plafonnées. Tout est dans le DOM.
- Vue PDV: une `Card` par PDV avec image (`ImageWithFallback`, `:90`), corps monté seulement si déplié (`:108`), lignes non virtualisées dans un conteneur `ep-stockup-scroll`.
- `:packaging="computePackaging(el)"` (`:63`, `:122`): méthode appelée à chaque rendu du parent, pour chaque ligne visible, et elle retourne un NOUVEL objet (`:706`) donc la prop change de référence à chaque rendu, ce qui force le re-rendu de chaque `StockElementRow` (`StockElementRow.vue:86`). Dans `computePackaging`, `findStockReference` (`utils/stockPlanning.js:500-540`) fait au pire deux passes `Array.find` sur ingrédients puis composants (`pool.find(matchesId)`, puis `normalizeName(c.name)` sur chaque entrée du catalogue) pour chaque ligne et chaque rendu: lignes × (ingrédients + composants) normalisations de chaînes. Déplier un PDV (`toggleShopExpanded`, `:550`, remplace `expandedShops` par un nouvel objet) re-rend le parent et recalcule `computePackaging` pour toutes les lignes des PDV déjà dépliés. Impact moyen (non mesuré).
- Pas de `v-memo`, pas de pagination (alors que MenusSection utilise `useIncrementalList` en vue article, voir `04_predict_sections.md` problème 5).

StockElementRow (lu `:1-150`): composant de présentation pur, aucun watcher, 3 computed bon marché (`lineCost`, `itemTypeLabel`, `itemTypeClass`), `formatQty` et `formatCurrency` en méthodes. Coût propre bas; le coût vient du nombre d'instances et du `packaging` recréé à chaque rendu parent.

## 3bis. MenusSection: méthodes demandées et coût d'un déplacement de slider

Appels API: aucun dans MenusSection (déjà établi, `04_predict_sections.md` 3.3). Les écritures passent par `$emit` vers le parent.

Méthodes lues (`sections/EventPredictMenusSection.vue`):
- `autoSelectIfEmpty` (`:2073-2108`): sortie immédiate si au moins un PDV a une sélection (`hasAny`, `:2078-2081`). Sinon, boucle sur tous les PDV: branche "assignation active" = `assignedIdsForElement` puis `isItemUnavailable` par id (`:2096`); branche legacy = `menuItemsPerElement.get(el.id)` filtré par `getPredictedQuantity(el.id, it.id) > 0` pour chaque article (`:2099-2102`). Un seul `$emit('update:selectedMenuItems')` (`:2106`). Coût: O(PDV × articles) une seule fois sur event neuf, puis le parent recalcule la chaîne de computed (confirme le problème 3 de `04_predict_sections.md`). Aucun coût sur un event ayant déjà une sélection ou une version.
- `isShopOpen` (`:2401-2410`): O(1) (Map `fbElementsById`), un `trim().toLowerCase()` par appel. Appelé au moins 5 fois par carte PDV dans le template (`:276`, `:287`, `:301`, `:311`, `:320`). Bas.
- `isItemUnavailable` (`:2865-2874`): deux `normalizeStr` (nom du PDV, nom de l'article) à CHAQUE appel, sans mémo. Appelé par `autoSelectIfEmpty` et par les listes affichées; le nombre d'appels dans le chemin d'un tick de slider n'a pas été tracé (non vérifié). La même fonction existe dans StockUp (`StockUp.vue:597`) et est appelée DEUX fois par couple (PDV, article) via `getAdjustedQuantity` (`:616`) puis `getPredictedQuantity` (`:583`), soit 4 `normalizeStr` par couple dans `shopStockData`. Bas à moyen.
- `getFilteredMenuItems` (`:3172-3177`): retourne l'entrée du `Map` `menuItemsPerElement` ou un `filter` avec `toLowerCase` par article. La recherche par PDV (`@input`, `:384`, `setShopSearchQuery` `:3181`) remplace l'objet `shopSearchQuery` à chaque frappe, sans debounce: re-rendu de tous les PDV qui lisent cet objet. Bas.
- `getItemAdjustmentValues` (`:2524-2529`): lit l'index mémoïsé `selectedElementsByMenuItem` (BUG-390-02), crée un tableau par appel; `isItemAdjustmentMixed` (`:2530`) crée en plus un `Set`. Appelé par entrée en vue article (incrémentale, 30 par lot). Bas.

Handlers de slider (cible du "coût d'un déplacement"):
- `Slider` (`ui/slider.vue`) écoute `pointermove` sur `window` (`:166`) et appelle `setValues` (`:218`), qui émet `update:value` sans throttle ni `requestAnimationFrame` (`:228`). Si `setValues` est appelé à chaque `pointermove` même quand la valeur arrondie au pas (5) ne change pas: non vérifié (`onPointerMove` `:323`, `:320`).
- Slider PDV (`MenusSection.vue:304-312`): `@update:value` appelle `handleShopAdjustment` (`:2497-2504`), qui fait `{ ...this.quantityAdjustments }` (copie de TOUTES les clés, une par couple PDV-article ajusté), écrit une clé par article coché du PDV, et émet. Slider article (`:891`): `handleItemAdjustment` (`:2537-2546`), même copie. Champs libres: `commitIfChanged` (`:2168`) n'écrit que si la valeur a changé (bon). Pas de debounce.
- Parent `onAdjustmentsChange` (`EventPredictView.vue:5691-5702`): remplace `quantityAdjustments`, incrémente `_adjustTick` et `_versionDirtyTick`, puis `scheduleDraftSave` (debounce 800 ms vers `localStorage`, `:6580-6586`; le coût d'écriture est donc hors du chemin du drag, mais le JSON complet de `quantityAdjustments` et `manualQuantities` est écrit, `:6587-6606`).
- Invalidations côté parent à CHAQUE tick (lecture de `_adjustTick`): `adjustedRecords` (`:3111`, `map` sur tous les `reconciledRecords` avec 4 tests d'alias de clé et construction de clés de pourcentage par record), `timelineRevenueTotals` (`:2977`), `manualQuantityRecords` (`:3279`), `hasVersionChanges` (`:3526`), `hasUnsavedChanges` (`:3596`). Ce qui consomme `adjustedRecords` en aval (colonne de droite, KPI): non tracé.
- Côté MenusSection: la chaîne de computed du problème 1 de `04_predict_sections.md` (`shopRevenues`, `derivedShopAdjustments`, `derivedItemAdjustments`, `chipCountsByElement`, vue article).
- Conclusion: un tick de slider = copie d'objet + 5 computed parent sur toute la timeline/records + la chaîne MenusSection + re-rendu de toutes les cartes PDV (une prop `quantityAdjustments` qui change de référence). Le tout synchrone sur le thread principal, une fois par `pointermove`. Pas mesuré; le coût réel dépend du nombre de records (non connu).

## 3ter. Drawers, AlgoTrace, EventDetailsEditor, RowActions

| Composant | Appels API | Computed/watchers | Listes | Constat |
|---|---|---|---|---|
| EventPredictSourcesDrawer (437 l.) | Aucun (grep) | `totalCheckedScore` (`:189`); watch `modelValue(open)` recopie `selectedIds` dans un `Set` à l'ouverture (`:197-201`) | `v-for` sur `scoredEvents` (`:20`) et `unselectedEvents` (`:69`), non virtualisées (une ligne par event passé candidat; dizaines à centaines, non mesuré) | Coût limité à l'ouverture. Le coût principal est AMONT: `drawerScoredEvents` et `drawerUnselectedEvents` (`EventPredictView.vue:2857`, `:2874`) sont des computed du parent évalués à chaque rendu du parent car les props sont liées sur une instance montée en permanence (drawer fermé inclus); le corps de ces computed n'a pas été lu |
| EventPredictHistoryAliasDrawer (345 l.) | Aucun (grep) | `canApply` (`:159`); watch `modelValue(open)` (`:165`) lance `findBestMatch(targetItem.name, sourceCandidates)` à l'ouverture seulement | `v-for` sur `aliases` (`:58`) | Même remarque: `historyAliasSourceCandidates` (`EventPredictView.vue:2126`) est lié en permanence. Corps du computed non lu (hypothèse 14 de `04_predict_sections.md` inchangée) |
| AlgoTraceTerminal (572 l.) | Aucun | 25 computed (`:249-392`), dont `includedRows` (`:351`), `excludedRows` (`:376`), `lines` (`:279`); lus selon l'onglet actif | `v-for` sur `includedRows` (`:82`), `excludedRows` (`:102`), `timelineFetch` (`:124`), `lowConfIds` (`:139`), `excludedIds` (`:156`), `lines` (`:172`), non virtualisées | Monté seulement avec `debugPredictionAvailable` (dev ou `?debugPrediction=1`). En production sans le paramètre: coût nul. En dev (toujours disponible, `EventPredictView.vue:1613`), les props `Array.from(excludedPastEventIds)` recréées à chaque rendu (`:765`) le re-rendent. Corps des computed non lu en détail |
| EventDetailsEditor (1572 l.) | Un seul: `createTeam` (`team.api.js`, `:461`, `:857`), sur action | `watch event` `immediate` (`:701-733`): `JSON.parse(JSON.stringify(ev))` à chaque changement d'event (copie profonde), sans rien faire si c'est le même event (`:716-717`, bon). 20 computed bon marché (`:590-698`) | `v-for` sur `editedEvent.sessions` (`:301`), court | Édition en brouillon local: `handleFieldChange` (`:766-775`) ne propage RIEN au parent pendant la saisie, tout part au Save. Ceci CORRIGE le rapport 04 qui disait "émet `event-live` à chaque édition": le commentaire du composant dit le contraire; l'émission de `event-live` n'a pas été retrouvée dans les handlers lus (reste `_liveTimer` au démontage `:735`), non vérifié. Coût d'édition bas |
| EventPredictRowActions (150 l.) | Aucun | non lu | non lu | non vérifié |

## 4. Cascade au premier affichage (complément)

- t0: `EventDetailsEditor` est monté (single-event). Pour un event futur, l'indicateur "timeline en calcul" (`EventPredictView.vue:569`) tient la place des drawers, du bandeau "Prédiction basée sur" et de la liste des sources.
- t1: la timeline finit de calculer (`hasCalculated` vrai): les deux drawers se montent (fermés, leur contenu non rendu), et le parent évalue `drawerScoredEvents`, `drawerUnselectedEvents`, `historyAliasSourceCandidates` pour les props. L'onglet Configuration affiche son skeleton tant que `!adjustedReady` (`:855`).
- t2: `adjustedReady`: montage de MenusSection (chaîne de computed, puis `autoSelectIfEmpty` si event neuf).
- Onglet Stock up (au clic): montage de StockUp, qui reconstruit `timelineDataIndex`, `shopStockData` pour TOUS les PDV, puis la liste. Aucun réseau, donc l'affichage est limité par le CPU. Pas de skeleton (`StockUp.vue:1-22` n'a que les états `itemsContext`).
- À chaque recalcul de timeline (apply des sources): les drawers sont démontés et remontés (`:569`), la sélection locale du drawer est resynchronisée à la prochaine ouverture (`SourcesDrawer.vue:199`).

## 5. Problèmes de performance (nouveaux, numérotation propre à ce rapport)

1. Slider sans throttle: chaque `pointermove` fait une copie de `quantityAdjustments` entier, un remplacement d'objet racine et 5 invalidations de computed parent plus la chaîne MenusSection (`ui/slider.vue:166,218-228`, `MenusSection.vue:2497-2504`, `EventPredictView.vue:5691-5702`). Impact haut sur un gros event, non mesuré. Pages: Event Predict (Configuration); autres consommateurs de `ui/slider.vue`: non cherchés.
2. StockUp calcule `shopStockData` pour tous les PDV même quand la vue PDV n'en affiche que les dépliés, car `sortedShopElements` lit chaque entrée (`StockUp.vue:457-461`). Expansion récursive des recettes, copies d'objets et `find` linéaires dans l'agrégation (`:421`, `:432-435`, `:508`). Impact moyen à haut.
3. `computePackaging` appelé par ligne et par rendu, retourne un nouvel objet (`StockUp.vue:63,122,706`), ce qui invalide la prop `packaging` de chaque `StockElementRow` à chaque rendu parent; de plus `findStockReference` fait des `find` sur ingrédients puis composants avec `normalizeName` sur chaque entrée (`utils/stockPlanning.js:528-538`). Un clic de dépliage re-rend toutes les lignes déjà visibles. Impact moyen.
4. Listes non virtualisées dans StockUp: vue article, tous les éléments du camion (`:52`), chacun avec ses listes `sources` et `shops`. Pas de `useIncrementalList` ici (MenusSection l'utilise en vue article). Impact moyen.
5. Index timeline reconstruit à chaque montage de StockUp (`:372-374`), alors que MenusSection en construit un équivalent: pas de partage entre les deux onglets (démontage voulu, PERF `EventPredictView.vue:848-851`, mais le travail est rejoué à chaque aller-retour). Impact moyen.
6. Drawers liés en permanence à des computed du parent (`drawerScoredEvents`, `drawerUnselectedEvents`, `historyAliasSourceCandidates`) et à des props recréées à chaque rendu (`Array.from(selectedPastEventIds)`, `:653`). Impact possiblement moyen, corps des computed non lus.
7. Drawers et bandeau de sources démontés à chaque recalcul de timeline (`:569-586`): coût de remontage, perte d'état interne, et risque de clignotement. Impact bas.
8. `isItemUnavailable` normalise deux chaînes à chaque appel sans mémo (`MenusSection.vue:2865-2874`, `StockUp.vue:597-606`), appelé deux fois par couple dans StockUp. Impact bas à moyen.
9. Recherche PDV sans debounce (`MenusSection.vue:384`). Impact bas.
10. `AlgoTraceTerminal` toujours monté en dev (`debugPredictionAvailable` vrai): 25 computed et six listes, avec props recréées à chaque rendu. Impact nul en production sans le paramètre.

## 6. Recommandations

| Action | Gain attendu | Risque | Effort | Fichiers (frontend sauf mention) |
|---|---|---|---|---|
| Throttler l'émission du slider: mise à jour visuelle locale immédiate, émission de `update:quantityAdjustments` en `requestAnimationFrame` pendant le drag et à coup sûr au relâchement | Divise le nombre de recalculs par le rapport (pointermove / frame), sans changer le résultat final | Bas à moyen: le slider doit afficher sa valeur locale pendant que les totaux se mettent à jour | S à M | `ui/slider.vue`, `MenusSection.vue:2497-2546`, `EventPredictView.vue:5691` |
| Écrire une seule clé par couple modifié plutôt que copier tout `quantityAdjustments` quand c'est possible (patch par PDV) | Réduit la copie par tick | Moyen: contrat de l'objet partagé avec le parent | M | `MenusSection.vue:2497-2546` |
| Passer `computePackaging` en computed mémoïsé (Map par clé d'élément) calculé avec les données, pas dans le template; stabiliser la référence de l'objet | Évite les re-rendus de toutes les lignes et les `find` répétés | Bas | S | `StockUp.vue:63,122,689-714`, `utils/stockPlanning.js:500` |
| Indexer `ingredients` et `components` par id et par nom normalisé une fois (computed), utilisé par `findStockReference` | Passe de O(lignes × catalogue) à O(lignes) | Bas: ordre de priorité des pools à conserver | S | `utils/stockPlanning.js:500-540` |
| Ne calculer `shopStockData` que pour les PDV dépliés en vue PDV (index par PDV paresseux), et seulement l'union en vue article | Gain proportionnel à la part de PDV non dépliés | Moyen: `sortedShopElements` filtre sur "a du stock" | M | `StockUp.vue:380-462` |
| Rendre les lignes par lots (réutiliser `useIncrementalList`) en vue article et dans chaque PDV déplié de StockUp | Montage plus court sur gros events | Bas | S | `StockUp.vue:52,112` |
| Partager l'index timeline entre MenusSection et StockUp via un composable mémoïsé par référence du tableau `predictedTimelineData` (déjà recommandé dans `04_predict_sections.md`) | Évite un parcours complet à chaque changement d'onglet | Moyen | M | `utils/predictedQuantityIndex.js`, deux sections |
| Mémoïser `normalizeStr(element.name)` par PDV (Map) pour `isItemUnavailable` | Retire des normalisations répétées | Bas | S | `MenusSection.vue:2865`, `StockUp.vue:597` |
| Monter les drawers avec `v-if` sur "ouvert au moins une fois" et passer des props paresseuses (fonctions) pour `drawerScoredEvents` etc. | Retire des computed du chemin de rendu du parent, si confirmé | Bas | S | `EventPredictView.vue:649-671` |
| Sortir les drawers du `v-else` de la timeline pour ne pas les démonter à chaque recalcul | Évite remontages et états perdus | Bas | S | `EventPredictView.vue:569-671` |
| Debounce 150 à 250 ms de `setShopSearchQuery` | Moins de re-rendus à la frappe | Bas | S | `MenusSection.vue:384,3181` |
| Backend/SQL | Aucun point backend dans ce périmètre: les composants lus n'appellent pas le réseau | n/a | n/a | n/a |

## 7. Points non vérifiés

- `onPointerMove` de `ui/slider.vue` (`:323`): émet-il à chaque `pointermove` même sans changement de valeur arrondie? Autres consommateurs de `ui/slider.vue`.
- Corps de `drawerScoredEvents` (`EventPredictView.vue:2857`), `drawerUnselectedEvents` (`:2874`), `historyAliasSourceCandidates` (`:2126`), `adjustedReady`, `reconciledRecords`, et ce qui consomme `adjustedRecords` en aval.
- `utils/menuItemExpansion.js` (251 lignes, expansion récursive): coût réel par appel non analysé.
- `AlgoTraceTerminal`: corps des 25 computed non lu en détail; `EventPredictRowActions`: non lu; `EventDetailsEditor`: seuls le watcher, `handleFieldChange` et l'import API ont été lus (1572 lignes, le reste est du template et des handlers).
- Origine de l'émission `event-live` (le rapport 04 la disait à chaque édition; non retrouvée).
- Nombres réels: lignes de `reconciledRecords`, de `predictedTimelineData`, PDV, articles, ingrédients, composants, éléments de stock-up. À mesurer avec le profiler Performance (tâche longue pendant un drag de slider) et `console.time` autour de `shopStockData`.
- Route, meta, keepAlive, `beforeEnter` de la page: non lus.
