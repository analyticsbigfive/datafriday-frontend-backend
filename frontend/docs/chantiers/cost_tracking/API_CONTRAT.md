# Contrat API Cost tracking (lot 2, backend)

Base : `/cost-tracking`. Auth JWT + permission `front.fb.costTracking` (distincte de `back.fb.costTracking`) + accès à l'espace (403/404 sinon). Tous les montants sont des nombres JS (pas de chaînes). Dates : ISO UTC pour les instants, `YYYY-MM-DD` pour les jours.

## GET /cost-tracking/:spaceId/catalog

Réponse :
```json
{
  "spaceId": "...",
  "types": [
    { "id": "t1", "name": "Food",
      "categories": [ { "id": "c1", "name": "Burgers", "articles": [ { "id": "m1", "name": "Cheese" } ] } ],
      "articlesWithoutCategory": [ { "id": "m9", "name": "..." } ] }
  ],
  "articlesWithoutType": [ { "id": "m10", "name": "..." } ]
}
```
Périmètre : articles non supprimés du Space Menu de l'espace (`SpaceMenuItem`). Tout est trié par nom.

## GET /cost-tracking/:spaceId/series

Query (tous optionnels) : `from`, `to` (`YYYY-MM-DD`, jours du fuseau de l'espace, bornes incluses ; défaut : 180 jours jusqu'à aujourd'hui ; max 366 jours, sinon 400), `typeId`, `categoryId`, `menuItemId`, `groupBy` (`article` | `category` | `type`).

`groupBy` absent : `article` si `menuItemId` ou `categoryId` est filtré ; `category` si seul `typeId` l'est ; `article` sans filtre (top 10). Les filtres restreignent les articles, `groupBy` choisit le regroupement des lignes.

Réponse :
```json
{
  "spaceId": "...", "from": "2026-03-01", "to": "2026-06-30", "timezone": "Europe/Paris",
  "groupBy": "article",
  "trackingStartedAt": "2026-10-22T09:00:00.000Z",
  "truncated": true,
  "rankedByRevenue": true,
  "eventsConsidered": 12,
  "lines": [
    { "key": "article:m1", "kind": "article", "id": "m1", "name": "Cheese",
      "typeName": "Food", "categoryName": "Burgers", "articleCount": 1,
      "revenueHt": 1234.5, "quantity": 321,
      "points": [
        { "at": "2026-03-01T00:00:00.000Z", "costPerPiece": 1.25, "price": 9.5, "articleCount": 1,
          "carried": true, "snapshotId": "...", "reason": "baseline", "totalCost": 2.5, "numberOfPieces": 2 },
        { "at": "2026-05-12T08:00:00.000Z", "costPerPiece": 1.4, "price": 9.5, "articleCount": 1, "carried": false,
          "snapshotId": "...", "reason": "market_price", "totalCost": 2.8, "numberOfPieces": 2 }
      ] }
  ],
  "events": [
    { "id": "e1", "name": "A vs B", "eventDate": "2026-04-10",
      "referenceAt": "2026-04-10T16:30:00.000Z", "referenceSource": "doors_open" }
  ]
}
```
Règles :
- **Escalier** : chaque point garde sa valeur jusqu'au point suivant (le front prolonge le dernier jusqu'à `to`). Seuls les changements de coût par pièce ou de prix produisent un point.
- `carried: true` : point posé à `from` pour porter la version déjà en vigueur. Si l'article n'a aucun snapshot avant `from`, `points[0].at` est la date de sa première version (après `from`) ; avant cela, pas de valeur. `points` peut être vide (aucun snapshot) : ligne à ignorer ou à signaler.
- Coût en **par pièce** (`totalCost / numberOfPieces`), pas en fournée. `price` = prix de vente global (`basePrice`) du snapshot, pas le prix par espace.
- Mode `category` / `type` : `kind` vaut `category` ou `type`, `points[].costPerPiece` et `price` sont des **moyennes simples** des articles ayant déjà une version à cet instant, `articleCount` donne leur nombre, `revenueHt` et `quantity` sont `null`, pas de `snapshotId`/`reason`. Lignes triées par nom, sans plafond ; les groupes sans aucun historique sont omis. `categoryName` n'est renseigné qu'en mode `category`.
- Mode `article` : au plus 10 lignes. Plus de 10 articles correspondent aux filtres (et pas de `menuItemId`) : `truncated: true`, lignes classées par CA HT décroissant sur la période (`rankedByRevenue: true`) ; sans aucune vente : repli alphabétique, `rankedByRevenue: false`. Si 10 articles ou moins : tous, triés par nom, `revenueHt`/`quantity` à `null`, `eventsConsidered: 0`. Le CA est calculé sur les 100 derniers events de la période (`eventsConsidered`). Les produits Weezevent non mappés n'y figurent pas.
- `trackingStartedAt` : premier snapshot du périmètre filtré (notice « Suivi des coûts actif depuis le... »), `null` si aucun.
- `events` : events de l'espace dont le jour de début est dans la période (200 max), du plus ancien au plus récent, triés par `referenceAt`. `referenceAt` = ouverture des portes (`doors_open`) sinon minuit local du jour (`midnight`), c'est l'instant à placer sur l'axe du temps.

## GET /cost-tracking/:spaceId/articles/:id/history

Query : `limit` (1 à 500, défaut 100). 404 si l'article n'est pas dans le Space Menu de l'espace.

Réponse (versions de la plus récente à la plus ancienne) :
```json
{
  "spaceId": "...", "article": { "id": "m1", "name": "Cheese" },
  "versions": [
    { "id": "...", "effectiveFrom": "2026-05-12T08:00:00.000Z", "reason": "market_price",
      "sourceRef": { "marketPriceIds": ["..."] },
      "totalCost": 2.8, "numberOfPieces": 2, "costPerPiece": 1.4,
      "basePrice": 9.5, "vatRate": 5.5, "costPerPieceDelta": 0.15,
      "recipe": [ { "kind": "ingredient", "refId": "...", "name": "Steak haché", "quantity": 0.12, "unitCost": 8.4 } ] }
  ]
}
```
`reason` : `baseline | created | market_price | recipe_edit | component_edit | combo_edit | manual_refresh | price_sync`. `recipe[].kind` : `component | ingredient | packaging | combo`. `costPerPieceDelta` : écart avec la version précédente (`null` pour la plus ancienne).

## Côté serveur (lot 4)

`CostTrackingAsOfService.costsAsOf(tenantId, { eventId, menuItemIds })` (exporté par `CostTrackingModule`) retourne `{ eventId, referenceAt, referenceSource, costs: { [menuItemId]: { totalCost, numberOfPieces, costPerPiece, basePrice, versionAt, source: 'snapshot' | 'baseline' } } }`. Un article sans aucun snapshot est absent de `costs` (repli sur le coût courant). 404 si l'event est inconnu.

## Lot 4a : GET /analyse/:spaceId/event-costs?eventIds=a,b,c

Permission `front.fb.analyse` (comme les autres endpoints Analyse), accès à l'espace vérifié. `eventIds` : CSV d'`Event.id`, 1 à 100 (400 au-delà). Complète `menuItemCostMap` (inchangée, RPC `shop_details` non touchée), même sémantique : coût de fournée (`MenuItem.totalCost`), pas par pièce.

```json
{
  "events": {
    "<eventId>": {
      "<menuItemId>": { "totalCost": 4.2, "source": "snapshot", "versionAt": "2026-03-01T08:00:00.000Z" }
    }
  },
  "unknownEventIds": ["<id absent de l'espace>"]
}
```
- Clés d'article : les articles rattachés à un produit Weezevent du tenant (`ProductMapping`) ayant un `totalCost` courant, soit le périmètre de `menuItemCostMap`.
- `source` : `snapshot` (dernière version <= instant de référence), `baseline` (event antérieur au suivi, toute première version), `current` (aucun snapshot : `MenuItem.totalCost` actuel, `versionAt: null`). Le front se replie sur `menuItemCostMap` si un article ou un event manque.
- Instant de référence : portes ouvertes, sinon minuit local (voir `costsAsOf`).
- Les events inconnus ou d'un autre espace ne font pas échouer l'appel, ils sont listés dans `unknownEventIds`.
- Coût : 2 requêtes de périmètre + 4 requêtes par event (5 events en parallèle), à EXPLAIN en recette sur 100 events.
- Non fait : marge Weezevent par jointure latérale (`soldLinesWithMenuItemCost`). L'instant de référence dépend du fuseau, des sessions et du lien Event vers WeezeventEvent, non reproductibles proprement en SQL sans dupliquer `resolveEventReference` ; à traiter à part si Bertrand l'exige.
