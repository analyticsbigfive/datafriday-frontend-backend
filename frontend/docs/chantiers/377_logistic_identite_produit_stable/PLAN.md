# Plan — Logistic : identité produit stable, en remplacement progressif d'`itemKey` (nom)

Voir [ADR-0006](../../../../backend/docs/adr/0006_stock_identite_produit_polymorphe.md) pour la
décision de fond. Cette fiche porte le diagnostic complet et le plan d'exécution.

## État d'avancement (2026-08-26)

- [x] Étape 0 — audit complet du périmètre (cette session)
- [x] ADR-0006 rédigée et acceptée
- [x] Étape 1 — schéma additif (`itemKind`/`itemRefId` nullables sur `StockLevel`/`StockMovement`/`StockTransferLoss`), migration `20260826154241_add_stock_item_identity_columns` appliquée
- [x] Étape 2 — double-écriture backend (`applyLevelDelta`, `createMovement`, `confirmTransfer`, `reset`), vérifiée sur données réelles (339/339 résolus lors d'un push Inventaire→Logistic)
- [x] Étape 3 — backfill historique (`backend/prisma/backfill-stock-item-identity.ts`, `npm run stock-identity:backfill`) — 1116/1162 lignes résolues (96%) sur 24 tenants, 46 orphelines (article renommé/supprimé depuis le mouvement, `itemKey` continue de fonctionner comme filet)
- [x] Étape 4 — bascule des lectures (portion sûre livrée) :
  - [x] `getLevelsAndConsumption` (partagée par `getStock` + `getExpectedStockIndex`) : canonicalise `itemKey` à la volée via `itemRefId` quand l'entité a été renommée depuis (jamais en base) — vérifié sans effet aujourd'hui (0/316 désynchro), s'active au prochain renommage
  - Reclassé sous étape 5 (pas indépendamment corrigeable) : `explodeSalesToConsumption` et `aggregateItems` fusionnent par homonyme parce que l'ÉCRITURE (`StockLevel.uniq_stock_level`) reste sur `itemKey` texte — les corriger côté lecture seule aurait affiché 2 entrées catalogue pointant vers 1 seul chiffre de stock partagé, plus trompeur que le bug d'origine.
- [~] Étape 5 — bascule d'écriture, en cours :
  - [x] `applyLevelDelta` (mouvement unitaire) + `reset()` (bulk) : repli par `itemRefId` avant de conclure à une création — sans ça, un mouvement/reset posté avec le nom COURANT d'un article renommé depuis le dernier écrit créait une ligne `StockLevel` fantôme à partir de 0 au lieu de mettre à jour la vraie. La ligne trouvée par id voit aussi son `itemKey` réaligné (auto-guérison du stockage, symétrique de la lecture). Vérifié : 0/316 désynchro inchangé (changement de code, aucune donnée touchée).
  - [x] DTO publics (`CreateMovementDto`/`ResetLineDto`) : champs optionnels `itemKind`/`itemRefId` ajoutés (`StockItemKind`/`STOCK_ITEM_KINDS`, renommés depuis `ItemKind` pour éviter la collision avec le type homonyme déjà présent dans `logistics.service.ts` — sens différent), préférés à la résolution serveur par nom quand fournis
  - [x] Référentiel `/stock` expose `refKind` (table d'origine réelle : marketPrice/ingredient/packaging/menuComponent/menuItem) sur chaque item, calculé aux 4 points de construction (`itemRefsForMenuItem`, `componentRefsForComponent`, `aggregateItems`, entrées orphelines)
  - [x] Frontend Logistic envoie `itemKind`/`itemRefId` sur les 2 chemins d'écriture manuels (`submitMovement`, `confirmReset` dans `SpaceLogisticView.vue`)
  - [x] Pont Inventaire→Logistic (`pushCountToLogistic`, `autoInitLiveStockFromPreEventInventory`) : `resolveItemKeysByIds` renvoie aussi le `kind` résolu, transmis directement à `reset()` au lieu d'être re-résolu par nom
  - [x] Contrainte unique basée sur l'id : `@@unique([tenantId, elementId, itemRefId], name: "uniq_stock_level_by_ref")` sur `StockLevel`, coexiste avec `uniq_stock_level` (texte) — vérifié 0 violation avant application (NULL jamais considéré dupliqué par Postgres, donc aucun impact sur les lignes orphelines)
  - [x] Garde anti-homonyme dans `applyLevelDelta`/`reset()` : recherche par identité D'ABORD, repli par nom SEULEMENT si la ligne trouvée par nom n'est pas déjà rattachée à une autre identité — sinon deux articles homonymes (même nom, catalogue différent) auraient continué à fusionner silencieusement même avec la contrainte unique en place. Vérifié : 0 collision active dans l'historique (`StockMovement`), donc aucun risque de régression sur l'usage actuel.
  - [ ] `explodeSalesToConsumption`/`aggregateItems` : l'aggregation reste par nom (`ref.key`) — pas encore basculée sur `ref.id`, la garde anti-homonyme protège déjà l'écriture mais le référentiel affiché peut encore fusionner deux homonymes par nom

## Contexte : pourquoi ce chantier

Demande utilisateur (session 2026-08-26) suite à une série de bugs réels rencontrés en cascade sur
la même session : recherche de market price cassée par un renommage, garde-fou de validation trop
strict, item silencieusement exclu du push Inventaire→Logistic (mauvais id capturé côté front),
comptage devenu invisible après correction de cet id. Chaque bug corrigé isolément était correct,
mais tous sont des symptômes du même trou : **aucune identité produit stable et unique** à travers
le domaine Stock.

## Diagnostic — le problème de fond

Il existe au moins quatre conventions d'identité concurrentes pour désigner "un article" :

| # | Convention | Où | Fiabilité |
|---|---|---|---|
| 1 | **Nom texte** (`itemKey`) | Logistic (`StockLevel`, `StockMovement`, `StockTransferLoss`) | Aucune FK, comparé par égalité/`contains` insensible à la casse à 3 endroits indépendants du backend |
| 2 | **Cascade `marketPriceId → sourceId → id`** (`componentIngredientId`) | Inventaire, Réarmement (mode produits finis), Stock-up, aperçu feuille de course | Fiable seulement si `marketPriceId` a été correctement propagé en amont — cassé jusqu'au 2026-08-26 (bug corrigé cette session, `menuItemNormalize.js`) |
| 3 | **Cascade différente** `ingredientId → componentId → packagingId → id → nom` | Réarmement mode "ingrédients" (`bomPlanning.js`), feuille de course réelle groupée fournisseur | Protégée du bug #2 par un chemin de données séparé, mais incohérente avec #2 — même article, clé différente selon l'écran |
| 4 | **Union d'ids + repli nom** (`stockNetting.js`) | Netting stock↔achat | La plus robuste des quatre, hérite quand même des erreurs de #2/#3 en amont |

**Piège de nommage actif** : le champ `itemKey` désigne un nom texte dans `logistics.dto.ts`, mais
un vrai id de `MenuItem` dans `create-post-event-reconciliation.dto.ts` — même nom de champ, deux
concepts opposés, dans le même domaine.

### Déjà documenté ailleurs dans le repo

- `frontend/docs/modules/06_STOCK_INVENTAIRE.md` — "Piège n°1" : *"un renommage d'entité côté Menu
  Catalogue casse silencieusement le rapprochement avec le stock déjà suivi sous l'ancien nom."*
- `QUESTIONS_A_BERTRAND.md` Q39 (🔴 ouverte) — question adjacente sur la taille de paquet, jamais
  élargie à l'identité elle-même.
- BUG-032, 033, 049, 239, 260-02, 288-01, 291-01, 292-01, 299-01, 352-01 — chacune corrige un
  symptôme local ; les plus explicites (292-01, 299-01, 288-01) reconnaissent elles-mêmes le
  caractère systémique sans jamais le traiter à la racine.
- Aucun ADR ni chantier n'existait avant celui-ci sur le sujet précis de l'identité produit.

### Bonne nouvelle architecturale

Le référentiel Logistic (`itemRefsForMenuItem`, `logistics.service.ts:909-981`) calcule **déjà**,
à la volée, un id stable et correct par article :

| Kind | `id` calculé | Stabilité |
|---|---|---|
| product (MenuItem readyForSale='Yes') | `item.id` (MenuItem.id) | Stable |
| ingredient | `mp?.id ?? ing.id` (MarketPrice.id si résolu, sinon Ingredient.id) | Stable — la requête `recipeSelect()` (l. 714-751) inclut correctement la relation `marketPrice`, vérifié le 2026-08-26 (le cas "Bun - Burger" qui semblait instable venait en réalité d'un pipeline différent, `/menu-items` → `menuItemNormalize.js`, sans rapport avec Logistic, déjà corrigé) |
| packaging | `pkg.id` (Packaging.id) | Stable |
| component | `comp.id` (MenuComponent.id) | Stable |

**Il n'existe donc pas de prérequis bloquant côté Logistic.** Le travail consiste à faire persister
cet id déjà calculé comme clé, au lieu du nom.

## Périmètre backend touché

Concentration principale dans `backend/src/features/logistics/logistics.service.ts` (~15 fonctions)
et `backend/src/features/inventory/inventory.service.ts` (traduction id↔nom bidirectionnelle en
continu, avec perte silencieuse documentée à chaque échec). Contrats publics à faire évoluer plus
tard (étape 5, hors scope immédiat) : `CreateMovementDto`, `ResetLineDto`,
`spaces.controller.ts` (`GET /:id/live/inventory`).

## Périmètre frontend touché

Module Logistic (11 fichiers, identité 100% par nom aujourd'hui — le plus fragile) : `SpaceLogisticView.vue`,
`LogisticAggregateView.vue`, `LogisticByItemView.vue`, `LogisticMovementDialog.vue`,
`LogisticHistoryDrawer.vue`, `LogisticLossesDrawer.vue`, `LogisticSimulateSaleDialog.vue`,
`LogisticTransferConfirmDrawer.vue`, `LogisticElementRow.vue`, `LogisticItemCard.vue`,
`LogisticConfigSelect.vue`, plus le store `store/modules/logistics.js` (fonctions `keyOf`,
`itemByKey`, `levelFor`/`consumedFor`/`expectedFor`). Ces fichiers ne sont touchés qu'à partir de
l'étape 4 (bascule des lectures) — étapes 1-3 sont backend seul, transparentes pour le front.

Hors scope immédiat (identité déjà partiellement id-first, chantiers séparés si besoin d'aligner) :
Inventaire, Réarmement, Event Predict.

## Risques structurels identifiés

1. **Contrainte unique texte** `StockLevel.uniq_stock_level` (`@@unique([tenantId, elementId, itemKey])`)
   — ne pas y toucher avant l'étape 5, une fois les lectures stabilisées sur `itemRefId`.
2. **3 implémentations indépendantes** de comparaison de nom insensible à la casse
   (`resolveUnitsPerPackForItemKey`, `getMarketPricesForItem` avec `contains` — le plus dangereux,
   faux positifs possibles —, `checkConsumptionFeasibility`) — à consolider en un seul helper à
   l'occasion de ce chantier, pas à dupliquer une 4e fois.
3. **Fusions silencieuses par nom déjà en production** (`aggregateItems` backend l. 1010-1031,
   `groupedItems` dans `LogisticByItemView.vue` l. 176-205) — la bascule des lectures (étape 4)
   doit corriger ce comportement explicitement, pas seulement le contourner.
4. **Historique figé en JSON** (`StockReconciliation.lines`, `InventorySnapshot.inventoryCounts`,
   `RestockPlan.recipeCoeffs`) — ne sera jamais migré rétroactivement, reste au format nom pour
   toujours. Les lecteurs d'historique (export CSV notamment) doivent le savoir.
5. **Repli "silencieux + warning"** répété partout dans `inventory.service.ts` — à remplacer par
   quelque chose de plus visible au moins pour les nouveaux chemins de code de ce chantier.

## Plan d'exécution, en étapes indépendamment sûres

**Étape 1 — Schéma additif** (risque nul)
`itemKind String?` + `itemRefId String?` sur `StockLevel`, `StockMovement`, `StockTransferLoss`.
Nullable, aucune contrainte, `ADD COLUMN` pur. Aucun comportement existant modifié.

**Étape 2 — Double-écriture backend**
Dans `applyLevelDelta`, `createMovement`, `confirmTransfer`, `reset` : à chaque écriture
d'`itemKey`, résoudre et écrire aussi `itemKind`/`itemRefId` via le référentiel
(`itemRefsForMenuItem`, qui le calcule déjà). Comportement observable inchangé.

**Étape 3 — Backfill historique**
Script one-shot : résoudre `itemKey` → `(itemKind, itemRefId)` pour les lignes existantes, sur le
modèle de `resolveItemKeysByIds` (inventory.service.ts). Lignes non résolvables = `null`, loguées
pour revue, continuent de fonctionner par nom comme aujourd'hui.

**Étape 4 — Bascule progressive des lectures**
Une fonction à la fois, en préférant `itemRefId` (repli `itemKey` si absent) : `getStock`,
`getExpectedStockIndex`, `explodeSalesToConsumption`, `aggregateItems`, puis le store front
`logistics.js`. Chaque bascule isolée et testable seule.

**Étape 5 — hors scope immédiat**
Contrainte unique `itemId`-based, DTO publics (`CreateMovementDto`/`ResetLineDto`), retrait du code
mort de résolution par nom. À ne considérer qu'une fois 1-4 stables en prod depuis un moment.

## Vérification

- `tsc --noEmit` (backend) après chaque étape backend.
- Pas de `pnpm build` frontend (interdit par `frontend/CLAUDE.md`) — relecture de fichier après
  édition.
- Étape 3 (backfill) : vérifier en base le taux de résolution avant de passer à l'étape 4 (cible
  indicative : >95% des lignes actives résolues).
- Aucune bascule de lecture (étape 4) sans avoir comparé le résultat avant/après sur des données
  réelles (space Auxerre, déjà utilisé comme cas de test cette session).
