# Confrontation doc vs code React — page Analyse / Predict (AnalyseView)

> **Méthode** : lecture intégrale des 5 docs de référence, puis lecture ciblée (grep + Read par
> plages) de `AnalyseView.tsx` (12753 lignes), `EventRevenueByShopChart.tsx`,
> `MenuItemQuantityPieChart.tsx`, `EventTimelineChart.tsx`, et lecture intégrale de
> `useMetricsCalculator.ts`, `useShopPerformanceCache.tsx`, `ShopDistributionPieChart.tsx`,
> `SpaceRevenueByMonthChart.tsx`, `ConsolidatedAccountView.tsx`, `MenuItemMarginReport.tsx`,
> `CostTrackingChart.tsx`. Chemins racine :
> `datafriday-web/old/versionReact/src/app/`.

## 1. Correspondances confirmées

- **Pipeline de filtres events** exactement conforme à SPACE_ANALYSE... §6 : `eventPassesFilters`
  (`components/AnalyseView.tsx:1156-1426`), `eventsFilteredByDateRange` (`:4377-4553`),
  `finalFilteredEvents` (`:4572-4598`, sémantique `[] ou ['all'] = tout`), `chartFilteredEvents`
  (`:4639-4673`, applique `applyAdvancedFilters` + ranges tickets sold/scanned). Les presets
  `thismonth/thisquarter/thisyear` vont bien jusqu'à fin de période en mode `predict` et
  s'arrêtent à `today` en `analyse` (`:1298-1368`, `:4434-4517`).
- **Conditions de génération prédictive** identiques point par point à §8.1 : guard
  `events.length>0`, `shopGranularData.length>0`, `selectedToolbox==='predict'`,
  `!hasPredictiveRecords`, taxonomies chargées (`components/AnalyseView.tsx:3872-3912`), nettoyage
  des prédictions au changement de date range/toolbox/space (`:3985-4012`).
- **Enrichissement pré-scoring** (eventType/category/subcategory par nom, showTime `19:00` par
  défaut pour futur) conforme §8.2 (`:3921-3956`, `:5690-5707`).
- **`usePredictiveTimeline.ts` n'est PAS utilisé par `AnalyseView.tsx`** (seulement
  `useShopPerformanceCache` et `useMetricsCalculator` sont importés) — confirmé par grep,
  exactement ce que dit la doc §9 (« deux implémentations proches »). Le hook n'est consommé que
  par `components/EventPredictView.tsx:19,162`.
- **Poids 70/30 Group A/B** implémentés à l'identique dans la logique « ancienne » de
  `AnalyseView.handleEventBarClick` (`:6388-6428`) : `groupA = score>0`, `groupB = score===0`,
  `weight = score/totalScoreGroupA*0.7` / `0.3/groupB.length`. Confirme §9.4 très précisément (le
  calcul naïf `score/totalScore` visible plus haut, `:6053`, n'est qu'un log de debug, pas la
  pondération réellement appliquée).
- **`calculateEventPerformance`** (`:3537-3619`) conforme §7.3 : regroupe par `eventId`,
  `isPredictive` par défaut `true` sauf si un record réel existe, `perCap = revenue/ticketsScanned`,
  une ligne par event filtré même sans transaction.
- **`filteredShopGranularData`** (`:8264-8360`) : matching primaire par `eventId`, fallback
  `eventName+eventDate` — conforme §7.1. Le fallback documenté comme « ambigu » en §13.8.4
  (« retourne toutes les données si `chartFilteredEvents` est vide ») est bien réel et vérifié
  ligne `:8283-8286`.
- **`useMetricsCalculator.ts`** (React, lu intégralement) confirme toutes les formules de §7.2 et
  STATISTIQUES_REFERENCE.md §5 : `avgRevenuePerEvent = totalRevenue/eventsWithRevenueCount` (pas
  `chartFilteredEvents.length`), `perCapita = totalRevenue/totalTicketsScanned`, `displayPerCapita`
  utilise toujours les attendees complets même en mode timeline filtré (`:274-302`).
- **`getBarColor`/`isEventInPast`/`hexToRgba`** dans `EventRevenueByShopChart.tsx` (lignes 942,
  968, 981-995) correspondent trait pour trait à la doc §8/§13.8.8 (rouge `#ef4444` si
  low-confidence, opacité 50% seulement sur les events passés non prédits en mode predict, jamais
  sur les prédictions normales).
- **Aggregation monthly/quarterly/yearly ne propage pas `isPredictive`/`confidenceScore`/`isLowConfidence`**
  — vérifié dans `buildMonthlyData` (`EventRevenueByShopChart.tsx:515-524`, l'objet `monthData` n'a
  que `monthKey/displayName/totalRevenue/eventCount` + clés numériques). Confirme exactement
  §13.8.7.
- **`EventTimelineChart.tsx`** confirme §13.6 : `viewMode: 'revenue'|'quantity'` (`:249`),
  `breakdownMode: 'menuItem'|'shop'` (`:251`), slider double `0..100` (`:252-253`), reset à
  `(0,100)` au changement d'event (`:918-921`), notification `onTimeRangeChange(null,null)`
  explicite au reset (`:927-934`).
- **`ShopDistributionPieChart.tsx`** confirme intégralement §13.6 (3 donuts shop/type/area, toggle
  quantity/revenue partagé, légende expansible) — lu en entier, aucune divergence.

## 2. Divergences

- **Deux formules concurrentes de « Avg Revenue / Avg Cost par event » coexistent dans le même
  écran**, ce que la doc ne signale pas :
  - Header `metricsContent` → carte « Avg/Event » (`AnalyseView.tsx:8705-8707`) utilise
    `displayAvgRevenuePerEvent` du hook (dénominateur = `eventsWithRevenueCount`, events ayant un
    record dans `shopGranularData`).
  - Section `financial-metrics` centrale → cartes « Avg Revenue » et « Avg Cost »
    (`:10933-10981`, `:10820-10861`) recalculent **localement** un ensemble `validEvents`
    différent, basé sur `event.event_revenue_HT != null && !== 0` pour le passé, et sur la
    présence d'un record `isPredictive` pour le futur en mode predict — puis divisent
    `totalRevenue`/`totalCost` (du hook) par ce compte alternatif.
  - Ces deux dénominateurs peuvent diverger (event avec ventes réelles dans `shopGranularData`
    mais `event_revenue_HT` null/0, ou l'inverse) → deux valeurs différentes de « CA moyen par
    event » affichées simultanément sur la même page. Aucun des deux docs de référence ne
    documente cette deuxième formule ni le champ `event_revenue_HT` comme source de calcul KPI.
- **`isSingleEventMode` a une définition différente** entre React et Vue : React
  (`AnalyseView.tsx:8574`) = `chartViewMode==='timeline' && selectedEventForTimeline &&
  !isTimelineFilterActive` (dépend du mode d'affichage), tandis que STATISTIQUES_REFERENCE.md §5.4
  (Vue) = « exactement 1 event sélectionné dans les filtres » (dépend du nombre d'events filtrés,
  indépendant du mode d'affichage). Ce ne sont pas des conditions équivalentes.
- **`MenuItemQuantityPieChart.tsx` — les cartes FOOD/BEVERAGE/BEER n'ont pas de branche
  « fourre-tout »** contrairement à ce que décrit CARTE_DONNEES_MANQUANTES.md (« si type+cat
  vides, TOUT le CA tombe dans BEVERAGE »). Le code React (`:354-398`) calcule 3 totaux
  indépendants par égalité stricte d'ID (`menuItem.typeId === foodTypeId`, etc., résolus par nom
  `'Food'/'Beverage'/'Beer'`) ; un item qui ne matche aucun des trois est simplement **exclu des 3
  totaux**, jamais reversé dans BEVERAGE. Le comportement « trompeur » décrit dans la doc est donc
  une déviation introduite côté Vue, pas héritée du React.
- **`MenuItemQuantityPieChart.tsx` résout le type/catégorie via jointure `menuItemId → menuItems[]
  → typeId/categoryId`** (`:204-234`), et **ignore silencieusement** (`if (!menuItem) continue;`)
  tout record dont le `menuItemId` n'est pas dans la liste `menuItems` — contrairement à
  `AnalyseView`/`ShopDistributionPieChart` qui utilisent les champs dénormalisés
  `record.menuItemType`/`record.menuItemCategory` directement et ne droppent jamais le record.
  Conséquence : ce donut peut sous-compter par rapport aux KPI globaux quand des `menuItemId` sont
  orphelins/non mappés — nuance absente des docs.
- Le pipeline textuel §6.4/§13.7.4 (« eventsForSpace → eventsFilteredByDateRange →
  eventsFilteredByAdvancedFilters → finalFilteredEvents → chartFilteredEvents ») ne correspond pas
  à l'ordre réel des dépendances de variables (`finalFilteredEvents` ne dépend que de
  `eventsFilteredByDateRange` + sélection explicite ; `applyAdvancedFilters` n'est appliqué qu'ensuite,
  dans `chartFilteredEvents`, `:4650`). Le résultat final est identique (filtres indépendants,
  ordre commutatif) mais le schéma est trompeur pour qui voudrait porter le code variable par
  variable.

## 3. Pépites nouvelles (absentes des docs)

- **Cache `shop-performance-cache:${spaceId}`** (KV) est un chemin rapide utilisé **dans
  `AnalyseView` elle-même** (pas seulement pour `SpacesPage`) quand aucun filtre n'est actif :
  `useShopPerformanceCache(space.id)` (`AnalyseView.tsx:37,93`) alimente directement
  `shopPerformanceData`/`menuItemPerformanceData` (`:3162-3216`), avec repli sur reconstruction à
  partir de `shopGranularData` si le cache est absent. Ce endpoint/cache n'apparaît nulle part dans
  la liste §3 « Endpoints et clés de persistance » de SPACE_ANALYSE_PREDICT...md.
- **Formule exacte du score manuel « 30% »** pour les events exclus (même sous-catégorie/catégorie) :
  `baselineMaxScore = topCandidates[0].maxPossibleScore` (ou `1000` par défaut si aucun candidat),
  `weight30Score = round(baselineMaxScore * 0.3)` (`AnalyseView.tsx:5736-5742`). La doc §9.3
  mentionne « score manuel 30% » sans formule.
- **Formules exactes txn/min « First Hour » / pré-show / post-show** (jamais données avec cette
  précision, ni dans STATISTIQUES_REFERENCE.md §6.1 ni ailleurs) :
  - `first60MinOperatingMinutes = 60 * eventsWithDoorsOpeningCount` (pas 60 minutes fixes)
    (`AnalyseView.tsx:1700-1704`).
  - Pré-show = fenêtre `[firstTransactionMinute, showTimeMinutes)` par event ; post-show =
    `[showTimeMinutes, lastTransactionMinute]` inclusif (+1) ; taux = somme transactions / somme
    minutes sur tous les events ayant un showTime (`:1706-1733`).
  - `operatingMinutes` = somme de `(lastMinute-firstMinute+1)` par event **sauf** si une plage
    timeline est active, auquel cas c'est `durée_plage × nb_events` (`:1683-1695`).
- **`peakTransactionRate`/`peakWindow` (fenêtre glissante 15 min)** documentés dans
  STATISTIQUES_REFERENCE.md §6.1 **n'existent nulle part dans le code React** (grep négatif sur
  tout le dossier `components/`+`hooks/`). C'est une métrique ajoutée pendant le portage Vue, sans
  précédent React — donc pas de formule de référence à vérifier, juste à concevoir.
- **`ConsolidatedAccountView.tsx`** (écran Préférences compte) révèle un mécanisme de
  **préférences utilisateur persistées** absent des docs : `defaultDateRangePreset` (défaut
  `'all'`) pour Analyse et `defaultPredictDateRangePreset` (défaut `'thismonth'`) pour Predict,
  sauvegardés via `api.saveUserPreferences()`/`api.getUserPreferences()` (`:44-96`) et appliqués à
  l'ouverture/changement de mode. Rien dans SPACE_ANALYSE_PREDICT...md ne mentionne ce système de
  préférence par défaut par utilisateur.
- **`SpaceRevenueByMonthChart.tsx`** (rendu dans `SpacesPage.tsx:1212`, pas dans `AnalyseView`) :
  chart cross-space avec 3 modes de répartition `space`/`menuType`/`eventType`, utilisant
  directement le champ `event.event_revenue_HT` (pas `shopGranularData`) comme source de revenu
  (`:156`). Le mode `menuType` s'appuie sur `event.elementType` qui n'existe normalement pas au
  niveau Event — c'est probablement du code mort/vestigial (bucket toujours `'Unknown'`). Non
  documenté dans le §4 « Section Spaces » qui ne parle que des cards KPI, pas de ce graphe.
- **`menuItemCostMap` est calculé côté client** dans `AnalyseView.tsx` à partir de `allMenuItems`
  (`item.cost ?? 0`) (`:8362-8369`), pas fourni par un endpoint dédié — confirme (sans le
  documenter explicitement) que la « cost map vide » décrite dans CARTE_DONNEES_MANQUANTES est
  structurellement liée à `allMenuItems`/mapping `menuItemId`, cohérent avec le root cause déjà
  documenté, mais la mécanique précise (map construite en mémoire, pas via API) n'était pas
  explicitée.
- **`isPredictMode` local à l'effet de rafraîchissement de la table Shop Performance**
  (`:3121-3122`) est défini uniquement par le `dateRangePreset` (`nextmonth/nextquarter/nextyear/
  thismonth/thisquarter/thisyear`), indépendamment de `selectedToolbox` — un deuxième calcul de
  « suis-je en mode predict » distinct du flag global `selectedToolbox==='predict'`, non signalé
  dans les docs.
- **Bug potentiel repéré** : `AnalyseView.tsx:6508` — `const totalTimelineTransactions =
  shopDataForSelectedEvent.reduce((sum, shop) => shop + (shop.totalTransactions || 0), 0);`
  retourne `shop` (l'objet accumulateur) au lieu de `sum`. Cette valeur alimente ensuite
  `setTimelineFilteredTransactions(totalTimelineTransactions)` (`:6527`), donc le KPI
  « Transactions » affiché pendant une timeline prédictive (clic sur un event futur en mode
  Predict) est potentiellement corrompu (NaN ou concaténation de chaîne). Ni la doc React ni la
  doc Vue ne relèvent ce bug — à vérifier/corriger si le comportement est reproduit côté Vue.
- **Liste complète des presets de date « legacy »** : en plus des presets calendaires
  (`thisweek/thismonth/thisquarter/thisyear`…), il existe un fallback à base de `daysBack` pour
  `today`(0)/`week`(7)/`month`(30)/`quarter`(90) (`AnalyseView.tsx:1389-1415`, `:4518-4538`),
  coexistant avec les presets calendaires alignés. Ce deuxième système n'est pas mentionné dans le
  tableau de presets §12.1.

## 4. Mort / hors-sujet (aucune valeur de portage pour la page Analyse)

- **`MenuItemMarginReport.tsx`** et **`CostTrackingChart.tsx`** ne sont PAS des composants de la
  page Analyse : ils sont importés et rendus uniquement par `components/MenuBuilder.tsx:93,98,1945,1960`
  (l'écran « bibliothèque Menu Items » / suivi des prix marché), sans aucun lien avec
  `shopGranularData`/`chartFilteredEvents`. Ils opèrent sur
  `MenuItemSnapshot`/`MarketPriceItem`/`SupplierItem` — un domaine totalement différent (suivi de
  coûts/prix dans le temps, pas d'analytics d'events). Leur présence dans la liste de fichiers à
  analyser semble être une confusion de périmètre initiale ; aucune divergence n'a de sens à
  documenter ici pour la page Analyse — voir plutôt `09_REACT_CATALOGUE_MENU.md`.
- **`ConsolidatedAccountView.tsx`** est un écran de préférences (rendu depuis `App.tsx:2305`), pas
  un composant de la page Analyse elle-même — mais contient une pépite utile (voir §3), donc gardé
  pour ce point seulement.
- **`SpaceRevenueByMonthChart.tsx`** est rendu dans `SpacesPage.tsx` (onglet Overview/F&B), pas dans
  `AnalyseView` — hors du périmètre strict « page Analyse », bien que pertinent au périmètre plus
  large « Space/Analyse/Predict » du doc maître.
- Dans les 4 fichiers ci-dessus, tout le JSX shadcn/ui (`Popover`/`Command`/`ScrollArea`/`Sheet`),
  le state management React pur (`useState` de filtres UI, popovers ouverts/fermés) et les
  palettes de couleurs Recharts sont du code de rendu sans logique métier — non pertinents pour un
  audit de fidélité doc/logique.
