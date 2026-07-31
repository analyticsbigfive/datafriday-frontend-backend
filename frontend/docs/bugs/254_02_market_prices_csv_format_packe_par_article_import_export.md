# BUG-254-02 — Market Prices : absence d'un format CSV « packé par article » pour la reprise de données historiques

- **Statut** : 🟡 Corrigé non testé (vérifié par script contre la vraie base de dev, tenant "test" ;
  jamais exercé via le drawer réel dans un navigateur)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web` (le backend `api-datafriday-staging` est en fait le
  même repo ici, dossier `backend/` — pas de repo miroir séparé pour ce projet)
- **Découvert le** : 2026-07-29
- **Fichiers** :
  `frontend/src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue`
  (avant fix : uniquement le format plat, 1 ligne = 1 `MarketPrice`),
  `frontend/src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue:593-679`
  (export, idem),
  `backend/src/features/market-prices/market-prices.service.ts:357-...` (`bulkCreate`, avant fix :
  jamais d'upsert, uniquement create + dédoublonnage).

## Symptôme

L'utilisateur dispose d'un jeu de données historique (`frontend/docs/example/market-prices-2026-07-29.csv`,
368 articles réels) dans un format où **1 ligne CSV = 1 Item**, avec un champ `Market Prices` qui
empile tous les prix fournisseurs de cet article (séparés par `|`, sous-champs séparés par `>`,
avec un `Item ID`/`Market Price ID`/`Supplier ID` venant d'un autre système). Ni l'import
(`MarketPriceCsvImportDrawer.vue`) ni l'export (`MarketPriceListView.vue`) ne géraient ce format —
seul le format plat existant (1 ligne = 1 prix fournisseur, dédoublonnage par
nom+fournisseur+prix+unité, aucun `id` transmis) était accepté. Impossible d'importer ce fichier
tel quel, et aucun moyen de ré-exporter/ré-importer un fichier édité en gardant le lien vers les
lignes déjà en base (pas d'upsert).

## Cause racine

Fonctionnalité jamais implémentée — pas un bug de régression. `MarketPrice.itemName` est une
simple chaîne (pas de table "Item" séparée en base, `schema.prisma:807-857`), et
`CreateMarketPriceDto` n'avait pas de champ `id` optionnel : `bulkCreate()`
(`market-prices.service.ts`) ne pouvait donc que créer ou ignorer un doublon exact, jamais mettre à
jour une ligne existante depuis un import CSV.

## Correction

Ajout d'un second format CSV, **coexistant** avec le format plat (aucun des deux ne remplace
l'autre — détection automatique à l'upload selon la présence d'une colonne `Market Prices`),
sans aucune migration Prisma :

- **Backend** : `CreateMarketPriceDto.id?` (optionnel) + `bulkCreate()` tente un upsert quand
  `dto.id` est fourni et correspond à un `MarketPrice` existant de ce tenant (met à jour via un
  helper partagé avec `update()`, `buildMarketPriceUpdateData()`) ; sinon retombe sur le flux
  création + dédoublonnage existant, inchangé (cas normal du tout premier import d'un fichier
  legacy dont les ids ne correspondent à rien ici). La réponse de `bulkCreate()` inclut désormais
  `updated: [...]` en plus de `created`/`skipped`/`errors`.
- **Import** (`MarketPriceCsvImportDrawer.vue`) : détection de format (`detectPackedFormat`),
  mapping dédié niveau Item (`packedFields`/`autoMapPacked`), dépaquetage
  (`parsePackedRow`/`PACKED_SUBFIELD_ORDER`/`parsePackedSubRecord`), résolution/auto-création des
  référentiels sur les sous-enregistrements (`scanNamesPacked`, factorisé avec `scanNames` via
  `_classifyCandidate`), branche dédiée dans `doImport()`, alerte "N prix mis à jour" sur l'écran
  de résultats, bouton de téléchargement d'un modèle au format packé.
- **Export** (`MarketPriceListView.vue`) : `exportToCSVPacked()`, réutilise le computed `items()`
  déjà groupé par `itemName` pour produire le format packé avec les vrais `id`/`supplierId` de
  cette base (permet le cycle export → édition externe → réimport en upsert).
- Le `Supplier ID`/`Market Price ID` du fichier CSV externe (id d'un autre système, jamais un cuid
  de cette base) n'est **jamais** utilisé tel quel comme FK — uniquement pour une tentative
  d'upsert (id) ou ignoré (`supplierId`, résolution par nom uniquement, comme le format plat).
- **Limite assumée, non corrigée** : "Inventory Information > Number of units" et "Packing
  Information > Packed Units" du format cible pointent vers le **même champ** `packedUnits` en
  base (`MarketPriceEditSupplierDrawer.vue` lie `form.packedUnits` aux deux sections) — pas deux
  valeurs distinctes aujourd'hui. L'import prend "Packing > Packed Units" comme canonique et
  ignore l'autre position ; l'export écrit la même valeur aux deux endroits.

Détail du mapping de champs et des décisions produit (Item ID = itemName, coexistence des deux
formats, upsert par id, conflation packedUnits) : voir
[`docs/modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md#import-export-csv--deux-formats-coexistants).

## Risque de régression / à surveiller

- **Non vérifié dans le navigateur.** La logique métier (dépaquetage, résolution, création,
  upsert, dédoublonnage) a été vérifiée par un script Node exécutant directement les vrais
  services NestJS (`MarketPricesService`/`SuppliersService`/`MarketPriceTaxonomyService`) contre
  la vraie base de dev (tenant "test", vide avant/après — nettoyage vérifié indépendamment après
  coup) : 3 passes (création initiale, réimport identique → dédoublonné, upsert par id réel →
  mise à jour sans doublon), ~35 assertions, toutes passées. **Mais** le drawer Vue réel (étapes
  upload/mapping/résolution des noms ambigus/résultats) et l'appel HTTP réel via
  `importMarketPrices()` n'ont jamais été exercés — à valider en navigateur avant de considérer
  ceci réellement "corrigé" (d'où le statut 🟡, pas 🟢).
- Le fichier réel `frontend/docs/example/market-prices-2026-07-29.csv` (368 articles, ~600 prix)
  n'a été testé qu'à l'échelle d'un extrait de 2 articles / 3 prix — le passage à l'échelle réelle
  (durée, éventuels timeouts, quotas rate-limiter comme documenté dans
  [[252_02_csvimportdrawer_rate_limit_429_import_masse_echec_definitif]] pour l'import événements)
  n'a pas été mesuré pour ce volume côté market-prices.
- Le format plat existant n'a pas été retesté après ce chantier (changements dans `doImport()`
  restructurés en deux branches `if/else` — relire le diff avant de faire confiance à un
  "non-régression par construction").

## Références

- [`docs/modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md#importexport-csv--deux-formats-coexistants)
  — section "Import/Export CSV — deux formats coexistants".
- [[47_market_prices_export_import_champs_incomplets]] — précédent chantier d'alignement
  export/import sur ce même écran (format plat), même esprit (coexistence, aucun champ perdu).
- Fiches 41 à 51 (`41_market_prices_import_csv_*` à `51_market_prices_import_csv_*`) — historique
  complet des corrections fiabilité de l'import CSV Market Prices existant (format plat), non
  reprises une à une ici mais toutes dans le même dossier.
