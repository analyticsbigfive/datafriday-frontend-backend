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
  `reconciliationPerimeter.spec.js`, `reconciliationCosts.spec.js`. Suite front : 1160 verts,
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

## Références

- `../modules/10_POST_EVENT_INVENTORY.md` §7.2, §15
- `../QUESTIONS_A_BERTRAND.md` Q35 (explosion des ventes), Q40 (coût des ingrédients, tranchée ici), Q26
- Fiches liées : 136-01 (intégrations multiples), 238 (non joints jamais avalés), 242 (Q35 Option 1), 292-01 (identité catalogue)
- ADR-0006 (identité produit polymorphe)

Ulrich
