# BUG-242 — Réconciliation post-event : les ventes de produits préparés n'imputaient jamais leurs ingrédients (faux manquants à 100 % de la consommation)

- **Statut** : 🟡 Corrigé non déployé (2026-07-27, branche `feat/postEventInventory` — redéploiement backend requis, aucune migration)
- **Sévérité** : 🟠 Majeur (sur toute ligne comptée au grain ingrédient, `Qty Sold` restait 0 → la totalité de la consommation des produits préparés vendus s'affichait en `Missing`, dans un document à vocation anti-perte/vol)
- **Domaine** : Stock — Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §7.2)
- **Repo(s) concerné(s)** : les deux (backend : nouvel endpoint ; frontend : nouvelle source « Vendu »)
- **Découvert le** : 2026-07-24 (contre-audit, consigné en Q35 — question métier tranchée par l'owner le 2026-07-27 : Option 1)
- **Fichiers** :
  - `src/views/SpaceInventoryView.vue` (`buildReconciliationLines` — collecte des ventes)
  - `src/utils/postEventReconciliation.js` (`buildSoldUnitsFromConsumption`, `buildPostEventReconciliationLines`, `computeReconciliationSummary`)
  - `backend/src/features/logistics/logistics.service.ts` (`deriveEventConsumption`, réutilise `explodeSalesToConsumption`)
  - `backend/src/features/inventory/inventory.controller.ts` (`GET :spaceId/event-consumption/:eventId`)

## Symptôme

Le référentiel compté de l'écran inventaire éclate les articles `readyForSale=No` en leurs
ingrédients/composants (`buildConsolidatedInventory`) : on compte « Budweiser Fût », pas
« PINTE BIERE 50cl ». Mais la source « Vendu » de la réconciliation post-event était
l'event-timeline **au grain article vendu** (`menuItemId`/nom) : la vente d'une pinte ne
rejoignait jamais la ligne « Budweiser Fût ».

Conséquence arithmétique (`leftFromSales = preEvent − sold`, `missing = left − counted`) : sur
une ligne ingrédient, `sold = 0` → `missing` = exactement la consommation réelle des ventes.
Le faux manquant vaut 100 % du volume consommé par les produits préparés vendus.

Cas réel (Auxerre, PdV « 1 A ») : « Ketchup - Bidon » et « Salade Iceberg » comptés pour des
ventes encaissées sous « 2 X TENDERS FRITES » ; « Budweiser Fût » pour « PINTE BIERE 50cl ».
Latent au moment de la découverte (0 transaction POS sur les events du space) : exposition
structurelle, pas encore de perte affichée.

## Cause racine

Deux grains jamais réconciliés : le comptage suit le référentiel inventaire (éclaté par
`readyForSale`), les ventes suivaient le référentiel POS (article vendu). La Logistique possède
pourtant déjà la traduction (`deriveSalesRaw` → `explodeSalesToConsumption`, « en miroir du
référentiel front ») — la réconciliation ne l'utilisait pas.

## Correction (Q35 — Option 1, décision owner 2026-07-27)

Réutiliser la cascade Logistique, ne pas la dupliquer (le jour où Q18 — explosion des combos —
y atterrit, la réco en hérite sans modification) :

- **Backend** — `LogisticsService.deriveEventConsumption(spaceId, eventId, tenantId)` :
  transactions de l'event sélectionnées avec les MÊMES clauses que
  `SpacesService.getEventTimelineBatch` (fenêtre `eventDate → fin+1j`, scope intégration,
  `status='V'`, `deletedAt IS NULL` — duplication à dessein, pointeurs croisés en commentaire),
  puis `explodeSalesToConsumption` **inchangée**. PdV non mappé / hors espace et produit sans
  mapping sortent dans `unjoined` (jamais avalés — même contrat que BUG-238). Exposé
  `GET /inventory/:spaceId/event-consumption/:eventId` (permission `front.fb.spaceInventory`,
  celle de l'écran — pas `front.fb.logistic`).
- **Front** — `buildReconciliationLines` consomme cet endpoint comme source « Vendu » :
  jointure PdV par **id** (plus fiable que le matching par nom d'avant), article par nom
  normalisé via `buildSoldUnitsFromConsumption` (util pur, testé). Repli **grain article**
  (timeline brut, chemin pré-Q35 conservé tel quel) si la route n'existe pas encore (404
  backend antérieur) ; échec réseau → pas de document (`salesFetchFailed`, inchangé).
- **Traçabilité** — `meta.salesSource` (`'consumption'` | `'timeline'`, null = document
  antérieur) archivé avec le document ; bandeau `invRecoMetaSalesTimeline` sur les documents
  générés en repli. Un backend antérieur rejette le champ (whitelist stricte) → repli sans
  contexte déjà en place (réflexe BUG-228).
- **Prédit** — le scénario Event Predict reste au grain article : les lignes hors catalogue
  vendable reçoivent `predictedUnits = null` (`predictableItemIds`), et `diffPct` ne compare
  que les lignes prédites (`totalSoldPredictable`) — sinon les unités d'ingrédients gonflaient
  le vendu face à un prédit qui ne les contient pas. `totalSold` (chip) somme tout, inchangé.

## Limites assumées (v1)

- **Unités des recettes** : le calcul suppose `numberOfUnits` exprimé dans l'unité de stock de
  l'ingrédient — même contrat que le stock attendu Logistique. Décision owner 2026-07-27 :
  recettes réputées bien remplies, pas de préflight données.
- **Miss € des ingrédients** : `unitCostByItemId` est au grain menu item → un manquant
  d'ingrédient n'est pas valorisé (« — »). Source de coût à trancher (Q40).
- **Jointure par nom** article ↔ itemKey d'explosion : contrat existant partout ailleurs
  (Logistique ↔ front), fragilité connue aux renommages.
- Les documents déjà archivés ne sont pas recalculés (photos figées).

## Tests

- Backend : `logistics.service.spec.ts` — 4 nouveaux (404 event hors space, partition
  mappé/unjoined, 0 vente ≠ échec, espace sans PdV) ; 15/15 verts, inventory 41/41 inchangés.
- Front : `postEventReconciliation.spec.js` — 6 nouveaux (jointure normalisée, unjoined jamais
  avalé, entrée vide, `predictableItemIds` avec/sans, diffPct comparable) ; 17/17 verts. Suite
  complète : 484 verts, 4 échecs préexistants hors périmètre (vérifiés identiques sans ces
  modifications, via stash).

JLH
