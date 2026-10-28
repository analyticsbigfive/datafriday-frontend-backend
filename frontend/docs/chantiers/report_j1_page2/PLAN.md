# Rapport J+1, page 2 composable (demande Bertrand 28/10)

Branche : `feat/report-j1-page2`, worktree `../datafriday-report-j1-page2`.

## Demande

- Page 2 du PDF J+1 : grille 2 colonnes × 3 rangées (6 cases).
- Dans Analyse, icône « + » sur chaque chart, widget et table de performance (colonne de droite) pour l'ajouter à la page 2 dans son état de filtre.
- Tailles (colonnes × rangées) :
  - barre KPI du haut, barre de widgets sous les filtres : 2 × 1
  - tables de performance : 1 × 2
  - camemberts : 1 × 1
  - évolution du CA en barres : 2 × 2
  - table articles du menu par PdV : 2 × 2
- Au clic sur « + » : drawer montrant la page 2, cases libres et occupées. Clic sur une case = coin haut gauche. Si les cases nécessaires à droite ou en bas sont prises ou hors grille, la case est indisponible.
- Les éléments sont enregistrés avec leurs filtres du moment ; la période ou l'événement est celui du J+1 au moment de la génération.

## Décisions prises (à confirmer par Bertrand si besoin)

1. Une page 2 par espace, en base, partagée par les utilisateurs de l'espace.
2. Clic sur une case occupée dans le drawer : proposer « Retirer ».
3. Page 2 vide : non générée.
4. Tables longues : N premières lignes selon la place, tri identique à l'écran, mention « + X autres ».
5. « + » masqué en mode Comparaison et en Predict.
6. Filtres figés = tout sauf le périmètre événement/période. Exclus du snapshot : `selectedEventIds`, `timeRange`, `startDate`, `endDate`, filtres d'event (catégories, types, équipes, sponsors, sessions, artistes, adversaires, premières parties, horaires portes/show/entracte), `selectedDaysOfWeek`, `selectedWeather`, `temperatureRange`, billetterie, `comparisonMode`, `searchQuery`. Raison : appliqués à un seul event J+1, ils l'excluraient. Gardés : PdV (ids, types, zones), articles (noms, types, catégories), marques, industriels, fournisseurs, promotions, plage horaire `selectedTimeRange`, `selectedConfigurationId`.
7. Rendu PDF : pas de réemploi des composants Chart.js hors écran (animations, ResizeObserver, capture à mi-rendu). Renderers d'impression dédiés en HTML + canvas 2D synchrone, comme la page 1 (`drawDonut`).

## Validé par Ulrich (28/10)

- « Évolution du CA en barres » : dans la page 2, rendu en barres horizontales du CA par PdV de l'event J+1 (un seul event donnerait une seule barre).
- Tous les camemberts d'Analyse sont éligibles : PdV / type / zone, dimensions article (type, catégorie, DisplayName, industriel, marque, fournisseur), promotions, mix catégories par transaction.

## Contrat partagé (à respecter par tous les lots)

Catalogue des éléments, `frontend/src/utils/reportJ1Page2Catalog.js` :

| kind | variantes | taille (w × h) |
|---|---|---|
| `kpi-bar` | (aucune) | 2 × 1 |
| `widget-bar` | (aucune) | 2 × 1 |
| `donut` | `shop`, `shopType`, `shopArea`, `articleType`, `articleCategory`, `displayName`, `industrial`, `brand`, `supplier`, `promotion`, `promotionType`, `basketMix` (mix par catégorie), `basketMixItem` (combinaisons de produits) | 1 × 1 |
| `perf-table` | `shops`, `events`, `items` | 1 × 2 |
| `revenue-bars` | (aucune) | 2 × 2 |
| `items-by-shop` | (aucune) | 2 × 2 |

Document stocké (JSON) :

```json
{
  "version": 1,
  "slots": [
    {
      "id": "uuid",
      "kind": "donut",
      "variant": "shopType",
      "col": 0,
      "row": 1,
      "filters": { "selectedShopIds": [], "selectedMenuItemCategories": ["Beer"] },
      "options": { "metric": "revenue" },
      "label": "Répartition par type de PdV",
      "addedAt": "2026-10-28T10:00:00Z",
      "addedBy": "userId"
    }
  ]
}
```

Grille : `col` ∈ {0,1}, `row` ∈ {0,1,2}. Un slot occupe `[col, col+w-1] × [row, row+h-1]`.

API :
- `GET  /analyse/:spaceId/report-layouts/j1-page2` → `{ layout, version }` (layout vide si absent)
- `PUT  /analyse/:spaceId/report-layouts/j1-page2` body `{ layout, version }` → 409 si version périmée

## Lots

### Lot A, backend (Sonnet, worktree de la branche)
- Prisma : modèle `SpaceReportLayout { id, tenantId, spaceId, kind, layout Json, version Int @default(0), updatedById?, createdAt, updatedAt }`, `@@unique([spaceId, kind])`, `@@index([tenantId])`, cascade vers Space. Migration.
- Service + contrôleur dans `backend/src/features/analyse/`, mêmes garde-fous tenant et permissions que les endpoints Analyse existants.
- Validation DTO du layout : kinds et variantes du catalogue, bornes de grille, pas de chevauchement, `filters` limité aux clés autorisées.
- Verrou optimiste par `version`.
- Un fichier spec, lancé via `scripts/test-serial.sh backend <spec>`.

### Lot B, frontend placement (Sonnet)
- `utils/reportJ1Page2Catalog.js` (tailles, libellés) et `utils/reportJ1Grid.js` (fonctions pures : `occupiedCells`, `canPlace(layout, kind, col, row)`, `placeSlot`, `removeSlot`). Tests unitaires.
- `utils/reportJ1FilterSnapshot.js` : snapshot des filtres selon la décision 6.
- `api/endpoints/report-layout.api.js` et composable `useReportJ1Layout(spaceId)` (chargement, sauvegarde, gestion du 409).
- `components/space-workspace/analyse/report-j1/ReportJ1AddButton.vue` (icône « + »), `ReportJ1PlacementDrawer.vue` et `ReportJ1GridPicker.vue` (aperçu de la page A4, cases libres / occupées / indisponibles, retrait).
- Intégration dans `AnalyseView.vue` : un bouton par élément du catalogue, en ne touchant que le strict nécessaire (pas de logique dans la vue). Masqué en comparaison et en Predict.
- Design : tokens de la charte (`frontend/docs/CHARTE_GRAPHIQUE.md`), contrôles Analyse existants, pas de texte coupé, pas de tiret cadratin.

### Lot C, frontend rendu PDF (Sonnet, après le lot B pour le catalogue)
- `composables/useReportJ1Page2Data.js` : pour l'event J+1, réutilise `useComparisonReport` avec `input = { kind: 'event', eventIds: [eventJ1] }` et `mainFilters` = filtres figés de chaque slot (regrouper les slots qui ont les mêmes filtres). Attend toutes les données (paniers, rendement, dimensions article) avant de rendre la main.
- `components/space-workspace/analyse/report-j1/ReportJ1Page2.vue` : grille A4 794 × 1123, une deuxième `.rj1-page` (la boucle de capture de `useReportJ1` la prend sans modification).
- Renderers d'impression, un fichier par kind dans `report-j1/print/` : HTML pour barres et tables, canvas 2D synchrone pour donuts et barres. Extraire `drawDonut` de `ReportJ1Document.vue` dans un util partagé.
- Rappel du filtre sous chaque titre de case (« Filtres : Bières, PdV Tribune Nord »).
- `useReportJ1` : charger le layout et les données de page 2 avant de poser `reportData` ; pas de page 2 si layout vide ; en cas d'échec d'un slot, case « Données indisponibles » au lieu de bloquer le PDF.

## Ordre

1. Lot A et lot B en parallèle (contrat ci-dessus).
2. Lot C quand B a posé le catalogue et l'util de grille.
3. Agent principal : revue des diffs, tests ciblés, merge local sur develop. Pas de commit ni de push sans demande.

## Garde-fous

- Surveilleur `python3 scripts/agent-token-watch.py` avant délégation ; alerte 130k, arrêt 150k, passation dans `PASSATION.md` de ce dossier.
- Tests lourds uniquement via `scripts/test-serial.sh`, un fichier, un seul à la fois.
