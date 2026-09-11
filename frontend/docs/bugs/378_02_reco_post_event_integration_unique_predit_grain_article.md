# BUG-378-02 — Réco post-event : ventes lues sur une seule intégration, prédit au grain article, lignes orphelines sans nom

- **Statut** : 🟡 Corrigé non déployé (2026-09-10, branche `fix/post-event-reco-grain`, backend + frontend, aucune migration)
- **Sévérité** : 🔴 Bloquant/impact business (document anti-perte illisible : items vides, Vendu = 0 partout, Diff -100 %)
- **Domaine** : Stock — Post-event Inventory (`../modules/10_POST_EVENT_INVENTORY.md` §7)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-09-10 (document SFP-Perpignan, Stade Jean Bouin, `cmtsdc1tr0xmn51clie9q72ze`)
- **Fichiers** :
  - `backend/src/features/logistics/logistics.service.ts` (`deriveEventConsumption`, `explodeSalesToConsumption`)
  - `backend/src/features/inventory/dto/create-post-event-reconciliation.dto.ts`, `inventory.service.ts` (`meta`)
  - `src/components/space-workspace/inventory/views/SpaceInventoryView.vue` (`buildReconciliationLines`)
  - `src/utils/postEventPredicted.js`, `src/utils/reconciliationPerimeter.js`, `src/utils/reconciliationCosts.js` (nouveaux)
  - `src/utils/postEventReconciliation.js`, `src/composables/usePredictedNeed.js`
  - `src/components/space-workspace/inventory/InventoryReconciliationView.vue`, `src/i18n/translations.js`

## Symptôme

Sur le document post-event SFP-Perpignan (1101 lignes), en vue « By item » :

| Constat | Mesure en base |
|---|---|
| Lignes sans nom d'article | 325 (64 articles distincts), toutes « prédit N / vendu 0 / compté 0 » |
| Lignes sans nom de PdV | 51 (Click & Collect, Live Order, Café rose, Quicktap Bodega) |
| Vendu = 0 | 1101 lignes sur 1101, aucun bandeau « ventes non jointes » |
| Diff global | -100 % |

Pourtant la fenêtre du match (05/09) contient 6 599 transactions Weezevent valides, dont 16 169
lignes d'articles sur des PdV du document et 15 288 jointes à un menu item.

## Cause racine

Trois causes indépendantes, cumulées sur le même document.

1. **Une seule intégration par espace côté ventes.** `deriveEventConsumption` faisait
   `locationSpaceMapping.findFirst` puis `t."integrationId" = <id>`. Stade Jean Bouin est alimenté
   par DEUX intégrations (PFC et SFP). Le `findFirst` prenait PFC ; un match SFP sortait 0 ligne,
   donc 0 vente ET rien de « non joint » (les lignes n'existaient pas). Le timeline avait déjà
   corrigé ce cas (BUG-136-01, `findMany`), pas la consommation.
2. **Prédit au grain menu item contre un comptage au grain ingrédient.** La réconciliation lisait
   les records bruts d'Event Predict (`shopId|menuItemId`, via `localDb.getAnyPredictedRecords`,
   donc n'importe quelle version du miroir local) alors que le comptage suit
   `buildConsolidatedInventory` (readyForSale=No ou combo → ingrédients, identité
   `componentIngredientId`). Les clés ne se rejoignaient jamais : chaque menu item décomposé
   produisait une ligne orpheline sans nom (`itemNameById` n'est construit que depuis le comptage),
   et `diffPct` comparait un vendu explosé à un prédit qui ne l'était pas (-100 % structurel).
   63 des 64 articles sans nom n'étaient pas readyForSale=Yes (24 combos). Le `predictableItemIds`
   ajouté par la fiche 242 masquait le symptôme sur les lignes ingrédient sans le résoudre.
3. **Pas de périmètre.** Les clés pré-event / mouvements d'un PdV retiré de la configuration
   fabriquaient aussi des lignes orphelines, et les PdV prédits hors comptage également.

S'y ajoute Q40, ouverte depuis le 27/07 : `menuItemCostMap` étant indexée par menu item, aucun
manquant d'ingrédient n'était valorisé en euros.

## Correction

Décisions prises le 2026-09-10 par Ulrich (délégation Bertrand) : (1) coût par kind pour Q40,
(2) le prédit post-event suit la version PAR DÉFAUT comme le pre-event.

- **Backend, ventes** : `locationSpaceMapping.findMany` et clause `"integrationId" IN (...)`,
  parité BUG-136-01. Sans intégration mappée : mode dégradé inchangé (PdV de l'espace seulement).
- **Backend, identité** : chaque ligne d'`explodeSalesToConsumption` porte `(itemKind, itemRefId)`
  quand l'identité est connue (marketPrice pour un ingrédient lié, ingredient sinon, menuItem pour
  un readyForSale=Yes, menuComponent pour un composant), même chaîne que `componentIngredientId`.
  Les appelants Logistic (reset, simulation) ne lisent que `itemKey`/`quantity` : inchangés.
- **Front, vendu** : `buildSoldUnitsFromConsumption` joint par `itemRefId` d'abord (insensible aux
  renommages), nom normalisé en repli (backend antérieur).
- **Front, prédit** : `loadPredictedNeed` (version par défaut, explosion `buildStockRequirements`,
  mêmes identités que le comptage), puis `buildPredictedUnitsForReconciliation` pose le prédit PAR
  ARTICLE COMPTÉ. Ce qui ne rejoint rien (PdV hors périmètre, ingrédient non assigné) sort dans
  `meta.predictedUnjoined` avec bandeau, jamais en ligne. `predictableItemIds` supprimé.
  `meta.predictedSource` (`'default-version'` | `'none'`) archivé ; sans version par défaut la
  colonne reste à null avec bandeau, jamais un 0 fabriqué.
- **Front, périmètre** : `restrictKeysToPerimeter` écarte les clés pré-event / mouvements dont le
  PdV n'est pas compté ; compteur archivé dans `meta.perimeterExcluded` avec bandeau.
- **Front, noms** : `buildCatalogNameById` (menu items, market prices, composants) en repli du
  comptage : plus aucune ligne sans nom possible.
- **Front/backend, noms des PdV vendeurs** : `deriveEventConsumption` renvoie un dictionnaire
  `elementNames` (id → nom). Un PdV de l'espace qui VEND sans être dans le périmètre compté sort en
  « non joint » côté client, qui n'avait alors aucune source pour le nommer (son référentiel ne
  contient que les PdV comptés) et affichait l'identifiant brut dans le bandeau (`cmsx2mkmd...`).
- **Stock de départ PAR PdV (2026-09-11, `utils/postEventBaseline.js`)** : deux défauts de plus,
  vus sur le document régénéré. (a) Un comptage pré-event PARTIEL (PFC-Lyon : 5 PdV sur 41)
  fabriquait un départ de 0 sur les PdV non comptés (`toUnits(undefined)`), donc un « surplus »
  égal aux ventes. (b) Le registre Logistic, source d'attendu des écrans depuis le PDF v3
  (2026-08-21) et du « Doit rester » affiché pendant le comptage, n'était jamais consulté par le
  document. Règle désormais, par PdV compté : pré-event s'il y figure (formule §14.3 inchangée),
  sinon attendu Logistic tel quel (`expectedUnits`, ventes et mouvements déjà nettés), sinon
  Restant/Manquant null. Chaque ligne porte `baselineSource`. Garde anti-circularité : le
  registre est recalé depuis le comptage d'après-match à chaque génération (`pushCountToLogistic`,
  marqueur BUG-352-01) ; `GET post-event-baseline` renvoie `holdsPostEventCount` et le client
  n'utilise pas un registre qui porte déjà le comptage de CET event. Archivé dans
  `meta.baseline` : `source` (`'logistic-live'` quand aucun pré-event), `fallback` (PdV en repli),
  `uncoveredElements` ; trois bandeaux.
- **Unité et conditionnement par ligne (2026-09-11, demande Ulrich, `utils/reconciliationUnits.js`)** :
  chaque ligne archive `unit`, `unitsPerPack`, `packaging` (article compté d'abord : `unit`,
  `inventoryQuantityPackaged`, `inventoryPackaging` ; Market Price en repli). Affichage
  « 3 626,85 L » sur Vendu/Prédit, « 840 L (28 Fut de 30 L) » sur Restant/Inventaire/Manquant ;
  en mode PdV la ligne de total ne porte une unité que si toutes ses lignes la partagent. Vérifié
  sur « 1664 - 30L » : recette en L (0,45 pour une 45cl, 1,5 pour une 1,5L), Market Price
  `unit='L'`, `packedUnits=30`, `inventoryPackaging='Fut'` ; le Vendu est donc bien en litres.
  DTO : `baselineSource`, `unit`, `unitsPerPack`, `packaging` ajoutés sur la ligne (whitelist
  stricte : sans eux la génération répondait 400).
- **Front, Miss €** : `buildUnitCostByItemId`, coût par kind : `MarketPrice.pricePerUnit` pour un
  article compté sous une market price, `MenuComponent.unitCost` pour un composant,
  `menuItemCostMap` pour un article compté tel quel. Jamais un 0 € fabriqué (coût nul ou absent →
  unités seulement).
- **DTO** : `predictedSource`, `predictedUnjoined`, `perimeterExcluded` optionnels ; le front garde
  le repli BUG-228 (backend antérieur → document sans contexte).

## Risque de régression / à surveiller

- Tests : backend `logistics.service.spec.ts` (+4 : deux intégrations, mode dégradé, identité par
  kind, identité inconnue), `inventory.service.spec.ts` (meta) ; front
  `postEventReconciliation.spec.js` (jointure par id, prédit au grain inventaire),
  `usePredictedNeed.spec.js` (rows, version), `postEventPredicted.spec.js`,
  `reconciliationPerimeter.spec.js`, `reconciliationCosts.spec.js`, `postEventBaseline.spec.js`
  (répartition par PdV, registre contaminé, formule par ligne), `reconciliationUnits.spec.js`.
  Suite front : 1160 verts,
  10 échecs préexistants hors périmètre (4 suites, identiques sans ces modifications).
- Déploiement conjoint : un front à jour sur un backend antérieur joint les ventes par nom (repli)
  et perd les intégrations multiples jusqu'au redéploiement backend.
- **Les documents déjà archivés ne sont pas recalculés** (photo figée). SFP-Perpignan doit être
  supprimé puis régénéré ; il restera sans Restant/Manquant tant qu'aucun comptage pre-event
  n'existe pour ce match (aucun en base, et PFC-Nice n'a pas de post-event).
- La réconciliation appelle `listEventPredictVersions` pour tout utilisateur : sans la permission
  Event Predict, l'API répond 403 et le miroir localStorage prend le relais (comportement de
  `loadPredictedNeed`, jamais bloquant).
- Q26 (recalcul serveur des métriques, tranché mais jamais codé) reste la suite naturelle : tant
  que les lignes viennent du client, un navigateur sans miroir local ni permission peut produire un
  document sans prédit.

## Vérification après régénération (2026-09-10 18:15, document `cmtvul2k5000210szip0xxb1s`)

Document régénéré sur la branche : 589 lignes (contre 1101), **toutes nommées**, Vendu renseigné,
Diff global -51,5 % (contre -100 %). `meta.predictedSource = 'default-version'`,
`meta.perimeterExcluded = null`. Les trois causes sont éteintes.

Restent visibles, et ce ne sont PAS des régressions :

1. **Restant / Manquant à « — »** : `meta.baseline.source = 'none'`. Aucun stock de départ n'existe
   en base pour ce match — pas de snapshot `kind='pre-event'` pour SFP-Perpignan, et le repli
   (post-event du match précédent) échoue car PFC-Nice (30/08) n'a qu'un snapshot pre-event du
   21/08. Le stock Logistic vivant (352 `StockLevel`) ne peut pas servir de repli : il est recalé
   par `pushCountToLogistic` à chaque génération de réconciliation (INVENTORY_RESET du 10/09
   18:15:31), donc il porte le comptage d'ARRIVÉE — `left = Logistic − vendu` donnerait
   `missing = −vendu`. Zéro mouvement Logistic dans la fenêtre du match (05/09 → 06/09).
   **Le cycle repose sur le comptage pre-event, qui n'a pas été fait pour ce match.**
   Le prochain (PFC-Lyon, 12/09) a bien son snapshot pre-event du 09/09, mais sur **5 PdV / 92
   articles** seulement (l'espace en compte 41 / 570). Depuis le 2026-09-11 les 36 autres PdV
   prendront l'attendu Logistic comme départ (voir « Stock de départ PAR PdV » ci-dessus).
   Pour SFP-Perpignan, rien n'est récupérable : le registre a été recalé trois fois depuis son
   comptage d'après-match (08/09 ×2, 10/09), `holdsPostEventCount = true`, le document restera à
   « — » même régénéré.
2. **3 071 unités vendues non jointes** dont celles de **Click & Collect** et **Live Order** : ces
   deux PdV sont des `SpaceElement` de l'espace (rattachés par `zoneId`, 6 et 9 mappings POS) qui
   VENDENT mais ne sont jamais comptés — le périmètre de l'écran inventaire vient de
   `/spaces/:id/shops?configId=` filtré par config. Question de configuration, hors de cette fiche.
   S'y ajoutent des produits Weezevent sans mapping (`TENDERS FRITES + BOISSONS`, `PULLED + FRITES`).
3. **Comptage incomplet 230/570** au moment de la génération (bandeau déjà présent).

## Références

- `../modules/10_POST_EVENT_INVENTORY.md` §7.2, §15
- `../QUESTIONS_A_BERTRAND.md` Q35 (explosion des ventes), Q40 (coût des ingrédients, tranchée ici), Q26
- Fiches liées : 136-01 (intégrations multiples), 238 (non joints jamais avalés), 242 (Q35 Option 1), 292-01 (identité catalogue)
- ADR-0006 (identité produit polymorphe)

Ulrich
