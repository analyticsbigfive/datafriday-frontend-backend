# Carte des données manquantes — Écran Analyse (Vue)

> Audit transversal (juin 2026) de tous les widgets/charts/tables/filtres de `AnalyseView.vue`,
> croisé avec le contrat de données (`STATISTIQUES_REFERENCE.md`, `WEEZEVENT_ANALYTICS_GAPS.md`).
> Objectif : pour chaque « 0 »/vide à l'écran, identifier la donnée, sa source, la cause racine et la remédiation.

L'écran Analyse rend correctement tous ses widgets, mais une grande partie d'entre eux affichent du vide ou des
agrégats dégradés (bucket « — », 0, donut vide) parce que les champs source ne sont pas peuplés en amont. Les causes
sont presque exclusivement des **lacunes d'intégration/configuration** (wizard Steps 2/3/5, sync attendees, absence
d'events N-1), et non des bugs frontend — le seul bug code identifié (Shop Performance txn/min) est déjà corrigé côté
front (commit `aliasToPrimary` sur `useShopPerformance.js`).

## 1. Tableau « Carte complète »

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| KPI CA / CA MOY / Coût / Transac. / Panier | CA, CA moyen, coût, transactions, panier | `r.revenue`, `r.transactionCount`, `r.quantity`, `r.eventId` | ✅ OK | Champs natifs peuplés dès G1/G2 + sync transactions (alias `revenue←revenueHt`) | Aucune |
| KPI % MARGE + carte marge | Marge % = (revenue−cost)/revenue | `r.revenue`, `r.menuItemId`, `r.quantity`, `menuItemCostMap` | 🔶 conditionnel | `menuItemCostMap` vide OU `menuItemId` = fallback `weezeventProductId` non rattaché aux clés du costMap → cost=0 → marge trompeuse à 100% | Step 3 (menu-mapping) + `rebuild-menu-mappings` + `shop-details` renvoie `menuItemCostMap` |
| KPI COÛT MOY + carte coût | Coût matière = Σ costMap[menuItemId]×quantity | `r.menuItemId`, `r.quantity`, `menuItemCostMap` | 🔶 conditionnel | Idem marge : sans costMap ou avec id de fallback → cost=0 | Step 3 + costMap renvoyé par `shop-details` |
| KPI TAUX TRANSACTION (/min) | transactions/minute | `r.transactionCount`, `operatingMinutes` (timeline), `doorsOpening` | 🔶 conditionnel | `operatingMinutes`=0 sans timeline chargée | Step 2 + sync transactions ; ouvrir panel Shop Performance (`enrich()`) |
| KPI Spectateurs (header) | Σ ticketsScanned/attendees | `e.ticketsScanned`, `e.attendees` | ⚠️ vide | Gap G6 : `WeezeventAttendee.scannedAt` non synchronisé → 0 | Sync attendees (webhook scan ou import wallets via `sync-attendees`) |
| KPI Transfo (header) | conversion = transactions/spectateurs | `r.transactionCount`, `e.ticketsScanned/attendees` | ⚠️ vide | Gap G6 : dénominateur=0 → « — » | Sync attendees (G6) |
| KPI Per cap (header) | revenue/spectateur | `r.revenue`, `e.ticketsScanned/attendees` | ⚠️ vide | Gap G6 : dénominateur=0 → perCapita=0 | Sync attendees (G6) |
| Chip variation (4 cartes grille + 8 KPI header) | ±X.X% vs baseline | `summary.variations / variationsYoY` | 🔶 conditionnel | null en single-event mode OU baseline absente ; YoY null sans events N-1 (G9) | ≥2 events sur la période + events historiques N-1 |
| Performance PdV — nom/revenu/unités/rang | top shops par CA | `r.shopName`, `r.revenue`, `r.quantity`, `r.eventId` | ✅ OK | shopName peuplé (Step 2) | Aucune |
| Performance PdV — chip txn/min | cadence par shop | `props.shopRates` (timeline) | 🔶 conditionnel | Dépend de l'enrichissement timeline (`useShopPerformance.enrich`) | Sync transactions + ouvrir le panel |
| Performance Événements — nom/date/revenu/unités | top events | `props.events`, `r.eventId`, `r.revenue` | ✅ OK | eventDate natif Event DataFriday | Vérifier rattachement spaceId |
| Performance Articles — nom/revenu/unités | top articles par CA | `r.menuItemName`, `r.revenue`, `r.eventId` | ⚠️ vide | Step 3 absent → menuItemName=null → bucket « — » | Step 3 + `rebuild-menu-mappings` |
| CA par event — vue « Shops » | CA empilé par boutique | `r.shopName`, `r.revenue`, `r.eventDate` | ✅ OK | shopName peuplé | Aucune |
| CA par event — vue « Menu Types » | CA empilé par type d'article | `r.menuItemType`, `r.revenue` | ⚠️ vide | Step 3 absent → menuItemType=null → segment « — » | Step 3 ; optionnel WeezPay `Product.nature` → originalType |
| CA par event — agrég. Monthly/Quarterly/Yearly | barres par période | `r.eventDate` | 🔶 conditionnel | Skip si `eventDate` non parsable (rare) | Aucune |
| CA par event — CA cumulé / prédictions | courbe cumulée / confiance | `r.revenue`, `r.isPredictive`, `r.confidenceScore` | 🔶 conditionnel | Dépend du mode tri/temporel et de la prédiction | Aucune (natif) |
| GenericByEventChart — métrique Coût | coût par event | `record.menuItemId`, `record.quantity`, `costMap` | 🔶 conditionnel | costMap vide / menuItemId non mappé → 0 | Step 3 + costMap |
| GenericByEventChart — Participants/PerCap/TransferRate | par event | `e.ticketsScanned/attendees/ticketsSold` | ⚠️ vide | Gap G6 (+G3 ticketsSold) → 0 | Sync attendees (G6) ; WeezTicket pour ticketsSold (G3) |
| POS Distribution — « By shop » / « By type » | répartition CA/qté par shop/type | `r.shopName`, `r.shopType`, `r.revenue`, `r.quantity` | ✅ OK | shopName + shopType (Step 2 + quick-create originalType) | Vérifier `attributes.originalType` non nul |
| POS Distribution — « By area » + sous-titre | répartition par zone | `r.shopArea` | ⚠️ vide | Gap G4 : `SpaceElement.attributes.area` JAMAIS rempli | Champ « Zone » dans `StepMapShops.vue` + `PropertiesPanelView.vue` (backend prêt) |
| Menu Distribution — carte FOOD | CA catégorie FOOD (heuristique type) | `r.menuItemType` | ⚠️ vide | Step 3 absent → menuItemType vide → 0 | Step 3 |
| Menu Distribution — carte BEER | CA catégorie BEER (heuristique catégorie) | `r.menuItemCategory` | ⚠️ vide | Step 3 absent → menuItemCategory vide → 0 | Step 3 |
| Menu Distribution — carte BEVERAGE | CA catégorie BEVERAGE (else fourre-tout) | `r.menuItemType`, `r.menuItemCategory` | 🔶 conditionnel | Branche « else » : si type+cat vides, TOUT le CA tombe ici (trompeur) | Step 3 |
| Menu Distribution — donuts items/types/catégories | répartition par item/type/cat | `r.menuItemName`, `r.menuItemType`, `r.menuItemCategory` | ⚠️ vide | Step 3 absent → groupBy skip les clés vides | Step 3 + `rebuild-menu-mappings` |
| Menu Items by Shop — vue PdV | table par PdV | `r.shopName`, `r.quantity`, `r.revenue`, `r.eventId` | ✅ OK | shopName peuplé | Aucune |
| Menu Items by Shop — colonnes Article/Type/Catégorie | table par article | `r.menuItemName/Type/Category` | ⚠️ vide | Step 3 absent → colonnes vides | Step 3 |
| Menu Items by Shop — multi-select Types/Catégories | options de filtre | `r.menuItemType/Category` | ⚠️ vide | Step 3 absent → `filter(Boolean)` → liste vide | Step 3 |
| Menu Items by Shop — vignette article | image article | `r.menuItemPicture` | ⚠️ vide | Champ rarement peuplé → fallback icône | Importer visuels (optionnel) |
| Menu Items by Shop — export Excel | xlsx PdV/Article/Type/Cat/Qté/CA | mixte | 🔶 conditionnel | Colonnes menuItem* vides sans Step 3 | Step 3 |
| Shop Performance — nom/CA/Avg/events/total transactions | par shop | `r.shopName`, `r.revenue`, `r.transactionCount`, `r.eventId` | ✅ OK | Champs granulaires peuplés | Aucune |
| Shop Performance — txn/min, First Hour, Peak, Operating Minutes | métriques timeline | timeline (`r.minute`, `r.transactionCount`), `doorsOpening` | 🔶 conditionnel | Bug clé `shopId vs shopName` **DÉJÀ corrigé** ; reste : timeline doit renvoyer des données + `doorsOpening` (Step 5) | Vérifier `getSpaceEventTimeline` ; saisir `doorsOpening` Step 5 |
| Event Timeline — courbe revenue/quantity + axes/tooltip | aires minute/minute | `r.totalRevenue`, `r.totalQuantity`, `r.minute` | ✅ OK | preprocessing timeline natif | Sync transactions |
| Event Timeline — breakdown « Par shop » | séries par shop | `r.shopId`, `r.shopName` | ✅ OK | shopId/shopName peuplés | Aucune |
| Event Timeline — breakdown « Par item » | séries par article | `r.mappedMenuItemId`, `r.menuItemId`, `r.itemName` | ⚠️ vide | Step 3 absent → ids non résolus → « Unknown » | Step 3 |
| Filtres — Événements / Dates / Config / Billets vendus | sélecteurs events & période | `props.events`, `e.date`, `e.ticketsSold/attendees` | ✅ OK | Natifs | Aucune |
| Filtres — Types de PdV / Shops | options shop/type | `r.shopName`, `r.shopType` | ✅ OK | Step 2 + originalType | Aucune |
| Filtres — Zones | options de zone | `r.shopArea` | ⚠️ vide | Gap G4 : shopArea vide → filtre mort | Gap G4 (champ Zone) |
| Filtres — Articles / Type article / Catégorie article | options menu | `r.menuItemName/Type/Category` | ⚠️ vide | Step 3 absent → options vides | Step 3 |
| Filtres — Billets scannés | slider scannés | `e.ticketsScanned` | ⚠️ vide | Gap G6 : ticketsScanned vide | Sync attendees (G6) |
| Filtres avancés — Catégorie/Type d'événement | multi-select | `e.category`, `e.eventType` | 🔶 conditionnel | Gap G3 : null tant que non saisi au Step 5 | Step 5 (Event Details) |
| Filtres avancés — Équipe/Équipe visiteur/Performer/Opening act/Sponsor | multi-select sport/spectacle | `e.team`, `e.visitingTeam`, `e.performer`, `e.openingAct`, `e.sponsor` | ⚠️ vide | Gap G3 : non saisis (team/visitingTeam via Step 5 ; performer/sponsor non câblés) | Step 5 ; enrichir performer/sponsor |
| Filtres avancés — Ouverture portes / Heure show | multi-select horaires | `e.doorsOpening`, `e.showTime` | 🔶 conditionnel | Gap G8 résolu via Step 5 : null sans saisie | Step 5 (Event Details) |
| Filtres avancés — Entr'acte / Sous-cat / Sessions | multi-select | `e.hasIntermission`, `e.subcategory`, `e.session` | ⚠️ vide | Non saisis (hasIntermission absent du formulaire Step 5) | Ajouter `hasIntermission` au Step 5 |
| Filtres — Configuration (restriction events) | restreint events par config | `configurationId` / `cfg.eventIds` | 🔶 conditionnel | Gap G7 : `configurationId` non stocké sur WeezeventEvent → ne restreint rien | Assigner `configurationId/eventIds` à l'import |
| Comparaisons Précédent / N-1 | variation vs baseline | totaux période courante vs précédente/N-1 | 🔶 conditionnel | Gap G9 : pas d'events N-1 → `variationsYoY` vide ; transferRate dépend de G6 | Events historiques N-1 ; sync attendees |

## 2. Groupement par cause racine

### 🐛 Bug code — Shop Performance txn/min (DÉJÀ corrigé)
Mismatch de clé d'agrégation `shopId` vs `shopName` entre records granulaires et timeline → taux nuls. **Résolu côté frontend**
(`aliasToPrimary` dans `useShopPerformance.js`). Reste à vérifier que `getSpaceEventTimeline(spaceId, eventId)` renvoie des
records non vides — sinon `transactionRate`/`operatingMinutes`/`First Hour`/`Peak` retombent à 0 par **manque de données**,
pas par bug.

### 📊 Wizard Step 3 (mapping produits) — cause la plus large (~14 widgets)
Sans Step 3 (`menu-mapping` + `rebuild-menu-mappings`) : `menuItemName/Type/Category=null` (donuts items/types/catégories,
cartes FOOD/BEER, table Menu Items, filtres article/type/catégorie, breakdown timeline « Par item ») **ET** `menuItemId`=fallback
`weezeventProductId` non rattaché aux clés du `menuItemCostMap` → **cost=0 → marge=100% trompeuse**, KPI Coût/Coût moyen à 0.

### 📊 Gap G4 — shopArea jamais renseigné (~3 widgets)
`SpaceElement.attributes.area` n'est alimenté par **aucun** éditeur. `uniqueShopAreas` toujours `[]`. Touche : POS Distribution
donut « By area » + sous-titre, filtre Zones. **Levier purement frontend** : ajouter un champ « Zone » dans `StepMapShops.vue`
(quick-create) et `PropertiesPanelView.vue` (propriétés d'élément). Le backend accepte déjà `attributes.area`.

### 📊 Gap G6 — ticketsScanned / ticketsSold (~7 widgets)
Sync attendees non configurée → KPI Spectateurs/Transfo/Per cap, GenericByEventChart (Participants/PerCap/TransferRate),
filtre Billets scannés, variation transferRate. Action : webhook WeezPay « scan » OU import wallets via `syncWeezeventEventAttendees`.

### 📊 Step 5 / enrichissement events (~9 filtres avancés)
`doorsOpening/showTime/category/eventType/team/visitingTeam` saisis manuellement au Step 5 « Event Details »
(PATCH `weezevent-events/:eventId` → metadata). `hasIntermission` pas encore dans le formulaire. Alimente aussi le « First Hour rate ».

### 📊 Gap G9 — pas d'événements N-1
Comparaisons année/année (`variationsYoY`) vides sans historique. Action : charger des events N-1 ; sélectionner ≥2 events.

### 📊 Gap G7 — configurationId non stocké
Le filtre Configuration ne restreint pas réellement les events. Action : assigner `configurationId/eventIds` à l'import.

### ✅ Ce qui fonctionne nativement (G1/G2 + sync transactions)
KPI CA/CA moyen/Transactions/Panier ; Performance PdV & Événements ; CA par event « Shops » + agrégations temporelles ;
POS Distribution « By shop »/« By type » ; Menu Items by Shop vue PdV ; Shop Performance CA/Avg/events/transactions ;
Event Timeline (revenue/quantity, « Par shop ») ; filtres Événements/Dates/Config/Shops/Types/Billets vendus.

## 3. Plan d'action priorisé

1. **Wizard Step 3 (menu-mapping) + `rebuild-menu-mappings` + costMap** — débloque ~14 widgets **et** corrige COÛT/MARGE. *Priorité absolue.*
2. **Sync attendees (G6)** — débloque ~7 widgets (Spectateurs/Transfo/Per cap…).
3. **Event Details au Step 5** (+ ajouter `hasIntermission`) — ~9 filtres avancés + First Hour rate.
4. **Champ « Zone » (G4)** dans `StepMapShops.vue` et `PropertiesPanelView.vue` (backend prêt) — donut « By area » + filtre Zones. *Seul levier purement frontend.*
5. **Vérifier la timeline** (`getSpaceEventTimeline`) — txn/min, Operating Minutes, Peak, First Hour.
6. **Events historiques N-1 (G9)** — comparaisons année/année.
7. **Vérifier `originalType` (Step 2)** — fiabilise donut « By type » et filtre Types de PdV.
8. **Optionnel/structurel** : `configurationId/eventIds` à l'import (G7) ; WeezTicket pour `ticketsSold` (G3) ; enrichir performer/sponsor/subcategory/session.
