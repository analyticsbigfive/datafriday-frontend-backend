# Analyse — la « clé béton armé » (data-driven, parité React)

> Référence unique pour répartir les ventes par PdV / article sur la page **Analyse**.
> **Refonte 2026-07-02** (décision user) : la version précédente de ce document
> (config-first / catalogue-first) est OBSOLÈTE et faisait l'inverse de ce contrat.

## Principe directeur

> **Analyse utilise TOUTES les données historiques de ventes du lieu ;
> Event Predict utilise une configuration future spécifique.
> Ne JAMAIS mélanger les deux** (le mélange était un bug critique : la sémantique
> config/assignation d'Event Predict filtrait les données d'Analyse).

## L'arbre (source de vérité)

```
SPACE (state.analyse.spaceId)
 └─ EVENTS passés (API /events)        [chaîne : eventsInActiveConfiguration →
     │                                   analysableEvents (passés) → filteredEvents]
     │   La CONFIGURATION ne sert QU'ICI : filtre d'events optionnel
     │   (« All Configurations » = défaut = tout l'historique).
     └─ RECORDS de ventes (API shop-details + event-timeline)
         │   joints par eventId (repli legacy eventName|eventDate) —
         │   record sans event filtré → exclu (filteredShopGranularData L~709).
         ├─ PdV      = shopName distincts des records     [getter salesShopNames]
         ├─ Articles = articles vendus des records        [salesMenuItemNames via soldItemOptions]
         └─ TOUT ce qui est vendu s'affiche — l'assignation n'exclut JAMAIS rien.
```

## La réconciliation = ENRICHISSEMENT PUR (jamais un filtre)

`reconcileRecord` (src/utils/analyseReconciliation.js) pose sur chaque record :
- `menuItemId`/`menuItemName` : identité catalogue si matchée (assignation du PdV,
  sinon repli **catalogue global lenient**), sinon libellé Weezevent brut.
- `menuItemType`/`menuItemCategory` : catalogue → repli champs backend du record →
  repli **produit Weezevent** (`nature` → type, `subnature` → catégorie ; lookup
  `weezeventProductId` puis nom ; canonicalisé vers le catalogue) → sentinelle
  `UNATTACHED_ITEM_KEY` (bucket gris « Non rattachés » dans les donuts). Le repli
  Weezevent pose aussi `weezpayNature`/`weezpaySubnature` sur le record.
  **Aucun impact coût** : le coût reste `menuItemCostMap[menuItemId]` — un record
  typé via nature/subnature sans identité catalogue garde un coût 0.
- `shopType`/`shopArea` : floorElement de la config si connu → repli champs du record
  (l'API event-timeline les porte ; passthrough `aggregateTimeline`).
- `shopStatus`/`mapStatus` : diagnostic uniquement — **plus aucun consommateur ne
  filtre dessus** (`keepCatalogRecord`/`unmappedReason`/`computeCoverage` supprimés).

Le match sert à retrouver le COÛT (`menuItemCostMap[menuItemId]`) et les dims.
Vente non matchée = CA compté, coût 0 (comportement React assumé).

## Getters / computeds à réutiliser

| Besoin | Source | Fichier |
|---|---|---|
| Base options (records scopés events analysables) | `optionsBaseRecords` | store/modules/analyse.js |
| Options filtres PdV (noms/types/zones) | `salesShopNames/Types/Areas` | store/modules/analyse.js |
| Options filtres articles (vendus) | `salesMenuItemNames/Types/Categories` (état `soldItemOptions`, remonté par AnalyseView `setSoldItemOptions`) | store/modules/analyse.js |
| Dataset KPI/charts (analyse) | `itemLevelRecords` (repli `filteredRecords`) → `chartRecords`/`kpiRecords` | components/analyse/AnalyseView.vue |
| Dataset options articles (brut, sans filtres user) | `soldItemOptionRecords` | components/analyse/AnalyseView.vue |
| Records shop-level filtrés | `filteredShopGranularData` | store/modules/analyse.js |

## Règles React (doc `dejaFaits/SPACE_ANALYSE_PREDICT_EVENT_PREDICT_REACT_LOGIC.md` §6-7, §13.2)

- Cascade UNIDIRECTIONNELLE : events → records → métriques. Les filtres shops/menu
  ne retirent JAMAIS un event des graphes event-level — ils ne changent que les montants ;
  0 record → KPI à 0, events toujours visibles.
- Multi-selects : `[] = tous`.
- Options de filtres = valeurs distinctes DES RECORDS (jamais du catalogue).

## Pièges (à NE PAS refaire)

- **Ne PAS** réintroduire un filtre par assignation/config sur les datasets d'Analyse
  (c'était le bug critique). La config ne filtre QUE la liste d'events.
- **Filtres = NOMS pas ids** (`selectedShopIds`/`selectedMenuItemIds`) ; comparer en
  `normalizeStr` des deux côtés ; options et records passent tous deux par la
  réconciliation → mêmes chaînes.
- **Cohérence donut↔filtre** : tout regroupement `resolveX` (analyseDimensions) doit
  avoir son option de filtre sur le MÊME `resolveX`.
- Sentinelles `UNATTACHED_*` : exclues des OPTIONS de filtres, affichées dans les
  donuts (part grise cliquable).
- `EventRevenueByShopChart` a besoin de la prop `events` (`eventMetaById`) : les
  records item-level ne portent que `eventId`.
- Mode predict : `chartRecords = filteredRecords` (shop-level, records `isPredictive`
  inclus) — ne pas brancher l'item-level dessus (il ne couvre que le passé).
- EventPredict : chemins séparés (`state.shopGranularData` brut + ses propres stores) —
  ne consomme NI la réconciliation analyse NI les getters `sales*`.
