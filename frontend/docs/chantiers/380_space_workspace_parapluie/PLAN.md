# Chantier 380 — Regrouper le module Analyse sous un parapluie `space-workspace`

> **Numéro provisoire** (380 = suivant de la série ; à aligner sur le tracker si besoin).
> Statut : **✅ EXÉCUTÉ** (2026-08-24) — les 6 outils + `shared/` déplacés, chaque lot validé au
> build. Dossier cible : `components/space-workspace/`.

## 1. Objectif

Le « module Analyse » n'est pas un dossier : c'est l'ensemble des outils qu'on utilise **à
l'intérieur d'un espace**, réunis uniquement par le préfixe de route `/spaces/:spaceId/*`. Leur
code est éclaté sur 4 emplacements avec 4 conventions différentes. On veut un **parapluie unique**
`components/space-workspace/` qui calque le pattern déjà éprouvé de `menu-fb/` : un sous-dossier par
outil, chacun avec sa structure interne (`views/`, `dialogs/`, `drawers/`, sections…), plus un
`shared/` pour le transverse.

C'est un chantier **de déplacement/rangement**, pas de réécriture : on bouge les fichiers et on
répare les imports, sans toucher au comportement. La factorisation des monolithes est un chantier
**distinct** et **ultérieur** (voir §6).

## 2. Périmètre

**Inclus** (outils du workspace espace) : `analyse`, `event-predict`, `live` (v2), `inventory`,
`logistic`, `restock`.

**Exclus** :
- **Builder v2** (`components/spaces/views/builder2/`) — déjà bien rangé et volumineux ; décision
  antérieure de ne pas l'embarquer. Reste où il est.
- **Live v1** — le `/live` réutilise `AnalyseView.vue` (couplé à Analyse). Tant que le chantier 379
  (Live standalone) n'a pas remplacé v1, on **ne casse pas** ce couplage : `live/` du parapluie =
  la v2 (`/live2`) uniquement. Voir §5.
- Le domaine **`events/`** (`components/events/`, CRUD d'événements) — c'est un domaine à part, pas
  un outil du workspace. Analyse et Event Predict le **consomment** (drawers), on n'y touche pas.

## 3. État actuel — cartographie vérifiée (2026-08-24)

Le parapluie n'existe qu'au niveau du **router** (`router/index.js`, routes `/spaces/:spaceId/*`).

| Outil | Route | Entrée réelle | Emplacement actuel | LOC entrée |
|---|---|---|---|---|
| **Analyse** | `/spaces/:spaceId` | `components/analyse/AnalyseView.vue` | `components/analyse/` (30 fichiers, **bien rangé** : `charts/ dialogs/ filters/ panels/ tables/` + racine) | ~1 640 |
| **Event Predict** | `/spaces/:spaceId/predict` | `views/SpacePredictView.vue` (wrapper 214 l.) → `components/EventPredictView.vue` | `views/` **+ racine `components/`** | **10 301** |
| **Inventory** (pre+post) | `/inventory`, `/pre-inventory` | `views/SpaceInventoryView.vue` (1 fichier, 2 modes via `meta.inventoryMode`) | `views/` | 4 213 |
| **Logistic** | `/logistic` | `views/SpaceLogisticView.vue` | `views/` | 1 944 |
| **Restock** | `/restock` | `views/SpaceRestockView.vue` | `views/` **+** `components/restock/` (2 fichiers) | **8 999** |
| **Live v2** | `/live2` | `components/live/LiveView.vue` | `components/live/` (6 fichiers) | — |
| Live v1 | `/live` | `components/analyse/AnalyseView.vue` (réutilisé) | — | — |

### Problèmes constatés
1. **4 conventions d'entrée** : `components/analyse/AnalyseView`, `views/Space*View`,
   `views/…→components/…View`, `components/live/LiveView`. Aucune règle.
2. **Pollution de `components/` racine** : 6 fichiers `EventPredict*.vue` posés **à plat** +
   `GlobalLiveIndicator.vue`. Aucun dossier de domaine.
   - `EventPredictHistoryAliasDrawer.vue`, `EventPredictSourcesDrawer.vue` (drawers)
   - `EventPredictMenusSection.vue`, `EventPredictStaffSection.vue`, `EventPredictStockUpSection.vue` (sections)
   - `EventPredictRowActions.vue`
3. **Monolithes** : EventPredictView **10 301 l.**, Restock **8 999 l.**, Inventory 4 213 l.,
   Logistic 1 944 l. (rangement d'abord, factorisation plus tard).
4. **Couplage Analyse → Event Predict** : `AnalyseView.vue:681` importe
   `@/components/EventPredictView.vue` (`defineAsyncComponent`). Le déplacement d'Event Predict doit
   mettre à jour **le router ET AnalyseView**.
5. Seul `components/analyse/` a une structure interne propre — **c'est le modèle** à généraliser.

### Pièges de migration (vérifiés)
- **Imports absolus internes** : plusieurs fichiers d'`analyse/` s'importent entre eux en absolu
  (`@/components/analyse/...` — au moins `tables/MenuItemRevenueDistribution`, `panels/SummaryPanel`,
  `tables/MenuItemsByShopTable`, `charts/DonutChartCard`). Un simple `git mv` ne suffit pas : il faut
  **sweeper tous les anciens chemins** après déplacement (`@/components/analyse/`,
  `@/components/EventPredictView`, `./EventPredict*` relatifs, `@/components/live/`,
  `@/components/restock/`, `@/views/Space*View`).
- **Sous-dossier caché** : `components/analyse/panels/live-inventory/RestockerDrawer.vue` (à
  préserver dans le déplacement d'analyse).
- **`src/utils/api.js`** (monolithe legacy) n'est utilisé QUE par Restock, en import absolu → non
  impacté par le déplacement (à ne pas toucher).
- **keep-alive** : la plupart des routes ont `meta.keepAlive` — le déplacement ne change que les
  chemins d'`import()`, pas le keep-alive.

## 4. Structure cible — `components/space-workspace/`

Calquée sur `menu-fb/` (chaque outil = un sous-domaine avec `views/dialogs/drawers/`).

```
components/space-workspace/
├── analyse/                     # (depuis components/analyse/)
│   ├── views/AnalyseView.vue
│   ├── charts/  dialogs/  filters/  panels/  tables/
│   └── AnalyseAppHeader.vue, AnalyseSkeletonVeil.vue, FilterPanel.vue,
│       LiveSaleSimulatorWidget.vue, LiveSimulationHistoryDialog.vue, ReportJ1Document.vue
├── event-predict/               # (depuis views/ + racine components/)
│   ├── views/SpacePredictView.vue      # wrapper (depuis views/)
│   ├── views/EventPredictView.vue      # (depuis components/EventPredictView.vue)
│   ├── drawers/EventPredictHistoryAliasDrawer.vue, EventPredictSourcesDrawer.vue
│   ├── sections/EventPredictMenusSection.vue, EventPredictStaffSection.vue, EventPredictStockUpSection.vue
│   └── EventPredictRowActions.vue
├── live/                        # (depuis components/live/ — v2 uniquement)
│   ├── views/LiveView.vue
│   └── LiveHeader.vue, LiveKpiRow.vue, LiveShopList.vue, LiveTimelineChart.vue, LiveCategoryBreakdown.vue
├── inventory/
│   └── views/SpaceInventoryView.vue
├── logistic/
│   └── views/SpaceLogisticView.vue
├── restock/
│   ├── views/SpaceRestockView.vue
│   └── RestockEventScenarioPicker.vue, RestockPlansPanel.vue
└── shared/                            # composants utilisés par ≥2 outils du workspace
    ├── EventTimelineChart.vue          # analyse + event-predict (depuis analyse/charts/)
    ├── LogisticMovementDialog.vue      # analyse + inventory + logistic (depuis components/ à plat)
    ├── LogisticSimulateSaleDialog.vue  # idem
    ├── KpiCard.vue                     # analyse + live v2 (depuis analyse/panels/)
    └── LiveInventoryPanel.vue          # analyse + live v2 (depuis analyse/panels/)
```

> ⚠️ `GlobalLiveIndicator.vue` n'est **pas** un transverse du workspace : il est consommé par
> `App.vue` (global). Il va dans `components/common/`, **pas** dans `space-workspace/shared/`.

> Le placement précis des fichiers racine de chaque outil (drawers vs sections vs flat) sera
> tranché à l'exécution de chaque lot ; l'important est : **1 outil = 1 dossier**, entrée dans
> `views/`.

## 5. Plan de migration — outil par outil

**Principe** : un outil par lot, **déplacer sans refactorer**, réparer les imports (router + cross-
refs + sweep des anciens chemins), l'utilisateur build et rapporte, on passe au suivant. `git mv`
pour préserver l'historique. Nettoyage du code mort **après** le déplacement, pas pendant.

Ordre exécuté (du plus isolé au plus couplé) — **tous validés au build** :

1. ✅ **Live v2** — 6 fichiers → `live/` (`views/LiveView` + Live*). Imports frères `./`→`../`.
2. ✅ **Logistic** — `SpaceLogisticView` → `logistic/views/` (imports absolus, rien à réparer).
3. ✅ **Inventory** — `SpaceInventoryView` → `inventory/views/` (2 routes mises à jour).
4. ✅ **Restock** — vue → `restock/views/` + `Restock*` à la racine ; imports absolus repointés.
5. ✅ **Event Predict** — 9 fichiers (dont **`StockElementRow`** découvert) → `event-predict/`
   (`views/ drawers/ sections/`). Relatifs → absolus `@/` ; 3 imports d'entrée corrigés
   (`SpacePredictView`, `AnalyseView:681`, router).
6. ✅ **Analyse** — dossier entier → `analyse/` (`AnalyseView` → `views/`, `./`→`../`). Sweep global
   `@/components/analyse/` → `@/components/space-workspace/analyse/` (self + live + event-predict) +
   2 routes.
7. ✅ **Consolidation `shared/`** — promus dans `space-workspace/shared/` : `EventTimelineChart`
   (analyse+event-predict), `KpiCard` + `LiveInventoryPanel` (analyse+live), `LogisticMovementDialog`
   (inventory+logistic) et **`LogisticSimulateSaleDialog`** (1 seul conso analyse, gardé avec sa
   paire — à rebasculer en `analyse/dialogs/` si on veut la règle stricte).
   `GlobalLiveIndicator` → `components/common/` (global, App.vue), **pas** `shared/`.

### ✅ Lot 8 — FAIT : helpers Logistic & Inventory (sous-dimensionnés au Lot 0)

La cartographie initiale n'avait retenu que la **vue d'entrée** de Logistic et Inventory. Les ~18
helpers restés à plat ont été rangés (méthode : relatifs → absolus AVANT `git mv`, puis sweep global
`@/components/<Nom>.vue` → nouveau chemin) :
- **Logistic (9)** → `logistic/` (`*Drawer` → `logistic/drawers/`).
- **Inventory (9)** → `inventory/` (`*Drawer` → `inventory/drawers/`).
- **Laissés à plat volontairement** : `InventoryFilterPanel` (aussi consommé par HR
  `HrMenuItemMultiSelect` → cross-domaine, hors parapluie) et `InventoryView` (aucun importeur
  `.vue` ni route → mort probable ; suppression = décision séparée).
- **Tests** : ✅ 8 imports event-predict repointés (`EventPredictStockUpSection`/`MenusSection`/
  `EventDetailsEditor` → `space-workspace/event-predict/…`).

### Résidus
- ✅ `EventDetailsEditor.vue` + `AlgoTraceTerminal.vue` (event-predict-only) rangés à la racine de
  `event-predict/`.
- ✅ `analyse/panels/live-inventory/RestockerDrawer.vue` (dépendance privée de `LiveInventoryPanel`,
  promu en `shared/`) déplacé en `shared/live-inventory/` — corrige un `Can't resolve` au build.
- Reste (chantiers distincts, voir §6) : factorisation des monolithes + purge du code mort
  d'`analyse/`.

Pour **chaque** lot :
- [ ] `grep` des consommateurs de chaque fichier déplacé (hors router) avant de bouger.
- [ ] `git mv` vers `space-workspace/<outil>/…`.
- [ ] Mettre à jour `router/index.js` (chemins `import()`).
- [ ] Réparer les cross-refs identifiés + **sweep** des anciens chemins (absolus et relatifs).
- [ ] L'utilisateur build → corriger les `Can't resolve` restants.

## 6. Hors périmètre (chantiers ultérieurs)
- **Factorisation** des monolithes (EventPredictView, Restock, Inventory) en composants
  réutilisables — distinct, après le rangement.
- **Nettoyage du code mort** de `components/analyse/` : liste confirmée dans
  [`docs/modules/02_ANALYSE.md`](../../modules/02_ANALYSE.md) §« Code mort confirmé » — à purger
  après déplacement.
- **Live v1 → v2** : quand le chantier 379 valide la v2, `/live` bascule sur `live/` et le couplage
  Analyse↔Live v1 disparaît.

## 7. Décisions prises (2026-08-24)
- **Builder v2** : reste hors parapluie (sous `components/spaces/`). ✅
- **event-predict** : on **garde** le wrapper `SpacePredictView` **et** `EventPredictView`
  (déplacement pur, pas de fusion). ✅
- **`shared/`** : règle actée — *un composant passe dans `space-workspace/shared/` dès qu'un **2ᵉ**
  outil du workspace en dépend* ; un composant global (consommé par `App.vue` / hors workspace) va
  dans `components/common/`, pas dans `shared/`. `shared/` se remplit **au fil des lots** (on
  promeut un composant au moment où le 2ᵉ outil le réclame). Candidats déjà identifiés :
  `EventTimelineChart` (analyse + event-predict), `LogisticMovementDialog` +
  `LogisticSimulateSaleDialog` (analyse + inventory + logistic), `KpiCard` + `LiveInventoryPanel`
  (analyse + live v2). `GlobalLiveIndicator` → `common/` (pas `shared/`). ✅

## 8. Références
- [`docs/modules/02_ANALYSE.md`](../../modules/02_ANALYSE.md) — pipeline de **données** (agrégation,
  KPI, pièges backend, code mort). Complémentaire : ce PLAN traite l'**architecture frontend**.
- [`docs/FRONTEND_ARCHITECTURE.md`](../../FRONTEND_ARCHITECTURE.md) — conventions dossiers/imports.
- Pattern de référence : `components/menu-fb/` (sous-domaines `views/dialogs/drawers`).
