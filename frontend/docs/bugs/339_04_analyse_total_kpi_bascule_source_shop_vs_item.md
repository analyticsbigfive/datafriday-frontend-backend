# BUG-339-04 — Analyse : le total KPI change pendant le chargement (2,71M → 2,69M) — bascule silencieuse de source shop-level → item-level

- **Statut** : 🟢 Corrigé le 2026-08-19 (branche `fix/analyse-page-load-perf`) — JLH
- **Sévérité** : 🟠 Important (le CA total affiché change sous les yeux de l'utilisateur en fin
  de chargement — perte de confiance dans les chiffres, tenant client réel)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : frontend (fix) — l'écart de fond entre les deux sources est
  backend, documenté en suivi ci-dessous
- **Découvert le** : 2026-08-19 — réunion de suivi du bug 339-02 (« les revenus totaux
  affichent des valeurs incohérentes pendant le chargement, par ex. 2,71M → 2,69M »)
- **Fichiers** :
  - `frontend/src/components/analyse/AnalyseView.vue` (`kpiRecords` — le computed corrigé ;
    `chartRecords` volontairement inchangé)
  - `frontend/src/utils/analyseDimensions.js` (`hasItemOnlyFilters` — nouveau helper pur)
  - `frontend/src/composables/useAnalyseItemRecords.js` (source item-level, cap
    `MAX_EVENTS = 50`)
  - `backend/supabase/migrations/20260818120000_shop_details_rpc_costmap_from_mappings.sql`
    (source shop-level, RPC `get_space_shop_details`)
  - `backend/src/features/spaces/spaces.service.ts` (`getEventTimelineBatch`, source
    item-level)

## Symptôme

Page Analyse : le CA total (bande KPI) affiche d'abord 2,71M pendant le chargement, puis
« se corrige » sur 2,69M une fois le chargement terminé, sans action de l'utilisateur.

## Cause racine

Les KPI totaux sont calculés par `useMetricsCalculator` sur `kpiRecords` (`AnalyseView.vue`),
qui basculait de `filteredRecords` (shop-level, chargé vite) vers `itemLevelRecords`
(item-level, préchargé en arrière-plan par `useAnalyseItemRecords`) dès que ce dernier était
non vide. Or les deux sources ne calculent pas le même chiffre, par construction :

- **shop-level** : RPC `get_space_shop_details` → somme `SpaceRevenueMinuteAgg` par **lien
  exact** `weezeventEventId` — alignée sur `Event.revenue`, désignée source de vérité par la
  fiche 339-02 ;
- **item-level** : `getEventTimelineBatch` → `SpaceRevenueMinuteItemAgg` par **fenêtre de
  dates** (`computeEventSalesWindow`) ; les events sans fenêtre (conteneurs de saison,
  fenêtre vide) perdent 100 % de leur CA ; cap à 50 events (`MAX_EVENTS`) ; formule
  `revenueHt` non garantie identique (`SpaceRevenueMinuteItemAgg` ne soustrait pas
  `ti.reduction`, cf. `space-aggregation.service.ts`).

→ le total change à la fin du chargement parce que la SOURCE change, pas les données. Même
mécanisme de bascule que le symptôme « correct puis faux » de la fiche 339-02, mais au niveau
du TOTAL, et toujours présent après le fix 339-02 (les sommes des deux sources restent
proches sans être égales).

## Correction implémentée (2026-08-19) — option A validée (JLH)

Les KPI totaux restent épinglés sur le shop-level ; l'item-level ne prend la main que quand il
est indispensable :

- `hasItemOnlyFilters(filters)` (`analyseDimensions.js`) : vrai si un filtre au grain que le
  shop-level ne porte pas est actif — article (`selectedMenuItemIds`), type/catégorie
  d'article, tranche horaire (`selectedTimeRange` borné, via `hasActiveRange`). Les filtres
  PdV (ids/types/zones) ne comptent pas : le getter store `filteredShopGranularData` les
  applique déjà au shop-level.
- `kpiRecords` (`AnalyseView.vue`) : `filteredRecords` (shop-level) par défaut, y compris une
  fois l'item-level chargé ; `itemLevelRecords` seulement si `hasItemOnlyFilters` — le
  changement de chiffre est alors sémantiquement attendu (périmètre filtré, pas la même
  mesure). Mode predict inchangé.
- `chartRecords` volontairement inchangé : les vues au grain article (Item performance, table
  articles, cartes events du SummaryPanel) ont besoin de l'item-level, et leur CA par event
  est correct depuis 339-02.

Tests : `tests/unit/analyseDimensions.spec.js`, describe « hasItemOnlyFilters (BUG-339-04) »
(4 cas). ✅

**Résidu assumé** : bande KPI (shop-level) et vues article (item-level) peuvent différer de
~1 % — c'est l'écart de fond entre les deux pipelines, qui existait déjà, plus visible
maintenant qu'il ne bouge plus sous les yeux.

## Suivi (non traité ici) — option B, alignement backend des deux sources

Faire converger les sommes elles-mêmes : `getEventTimelineBatch` attribuerait par lien exact
`weezeventEventId` quand la ligne d'agrégat est taguée (en acceptant les DEUX conventions
d'id — id `Event` DataFriday vs id `WeezeventEvent` brut, cf. BUG-123-01), fenêtre de dates
seulement en repli pour les lignes non taguées ; et harmoniser la formule `revenueHt`
(`reduction`). Chemin chaud touché par 4 fixes récents (BUG-130/328/329/330-02) — à valider
séparément avant toute implémentation.

## Références

- [BUG-339-02](339_02_analyse_event_revenue_double_compte_fenetre_jour_entier.md) — même
  mécanisme de bascule, au niveau d'une carte event ; y documente les deux sources.
- [BUG-339-03](339_03_reco_logistique_inventaire_miroirs_fenetre_vente_non_alignes.md) —
  miroirs backend corrigés dans la même passe.
