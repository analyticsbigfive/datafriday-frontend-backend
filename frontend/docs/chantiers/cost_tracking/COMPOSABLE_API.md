# API du composable useCostTracking (lot 3a)

`import { useCostTracking, PERIOD_PRESETS } from '@/composables/useCostTracking'`

`const ct = useCostTracking({ spaceId, enabled })` : `spaceId` Ref<string|null>, `enabled` Ref<boolean> (permission `front.fb.costTracking`, défaut true). Charge catalogue + séries tout seul (immédiat, puis à chaque changement d'espace, filtre, mode ou période). Tout est lecture seule (computed) sauf les refs notées.

## Filtres (dépendants Type > Catégorie > Article, état dans le store)
- `typeId`, `categoryId`, `menuItemId` : computed string|null.
- `typeOptions` [{id,name}], `categoryOptions` [{id,name,typeId,typeName}] (filtrées par type), `articleOptions` [{id,name,typeId,categoryId}] (filtrées par type et catégorie).
- `setType(id|null)` vide catégorie/article incompatibles ; `setCategory(id|null)` fixe aussi le type ; `setArticle(id|null)` fixe aussi catégorie et type ; `resetFilters()`.

## Afficher par
- `groupBy` : 'article'|'category'|'type' (valeur effective ; règle auto du backend tant que non forcé). `groupByIsAuto` : boolean. `setGroupBy('article'|'category'|'type'|null)` (null = retour à l'auto).

## Période
- `period` : Ref<'30'|'90'|'180'|'365'|'custom'> (défaut '180'), `PERIOD_PRESETS` exporté. `setPeriod(v)`, `setCustomRange('YYYY-MM-DD','YYYY-MM-DD')` (passe en 'custom').
- `range` {from,to}, `rangeValid` (1 à 366 jours), `bounds` [t0,t1] ms (t1 = fin du jour `to`).

## Données
- `loading` (séries), `catalogLoading`, `error` (message string|null), `reload()`, `loadSeries()`, `loadCatalog({force})`.
- `response` (réponse brute), `lines` (lignes backend + `colorIndex` 0..9 et `hidden`), `visibleLines`, `visibleSeries` (lignes visibles en escalier : `{key,name,kind,points:[{t,cost,price,carried,reason,snapshotId,...}],first,last,end,colorIndex}`), `isEmpty`.
- `summary` : `{rows:[{key,name,startCost,currentCost,currentPrice,variation:{abs,pct,direction}|null,versions,hasData}], count, versions, averageCost, averageVariationPct, increases, decreases}`.
- `events` (backend, [] si `showEvents` faux), `showEvents` Ref<boolean> (défaut true), `trackingStartedAt`, `truncated`, `rankedByRevenue`, `timezone`.
- `hiddenKeys` Ref<Set>, `toggleLine(key)`, `showAllLines()`.
- `chartModel({ width, height, margin? })` : `{hasData, margin, innerWidth, innerHeight, x(t), y(cost), yTicks:[{value,y}], xTicks:[{t,x}], paths:[{key,d,dots:[{x,y,point}],endDot:{x,y}|null}], events:[{id,name,t,x,labelVisible}]}`. Marge par défaut {l:56,r:16,t:14,b:32} (augmenter `b` pour les étiquettes d'events). `labelVisible` faux si espacement < 17 px.

## Sélection / historique
- `selectedArticleId` (Ref), `selectArticle(id,{limit})` (charge l'historique), `closeHistory()`, `history` ({article,versions}|null), `historyLoading`, `historyError`.

## Utilitaires purs (`@/utils/costTrackingSeries`)
`computeVariation(from,to)`, `marginPercent(cost,price,vatRate)`, `niceTicks`, `valueAt(points,t)`, `dayToMs`, `msToDay`, `rangeForDays`, `eventLabelVisibility`.
Couleurs : `colorIndex` est un index 0..9 à mapper vers des tokens de palette par le composant.
