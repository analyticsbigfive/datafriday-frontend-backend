# Réponses aux questions ouvertes — 2026-07-24

Compagnon de [`QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md). Deux sources :

1. **Réponses métier** collectées le 2026-07-24 (échange Bertrand Jame / Jean-Luc Houedanou /
   Emmanuel Kouevi).
2. **Audit base de données** du 2026-07-24 (lecture seule, base Supabase `alsgdtewqeldrrquypdy`
   pointée par `frontend/.env` — celle servie par `datafriday-api.onrender.com`). État mesuré :
   61 events, 540 410 transactions, ~22 tenants.

Chaque réponse validée ici doit ensuite suivre le circuit normal : mise à jour de la doc
canonique (module/bug/ADR), puis passage 🔴 → 🟢 dans le tracker.

---

## 1. Réponses métier (tranchées le 2026-07-24)

| # | Question (résumé) | Réponse |
|---|---|---|
| 8 | TTL cache store `events.js` (5 min vs 15 min) | **2 minutes max pour le live.** Le TTL events doit servir le module Live → raccourcir à 2 min, pas allonger à 15. Documenter l'écart avec la convention 15 min des taxonomies. |
| 17 | KPI « CA moyen par événement » — 3 formules concurrentes | **Total des CA des events enregistrés ÷ nombre d'events enregistrés.** Pas de filtre « CA > 0 », pas de repli conditionnel. Unifier `useMetricsCalculator.js`, `AnalyseView.vue` (itemTotals) et le store `analyse.js` sur cette formule unique. |
| 18 | Combo items dans Stock up (explosés ou comptés 1 pièce ?) | **Exploser les combos en leurs menu items constitutifs**, et appliquer à chaque constituant les règles standard des menu items. S'applique aux 3 implémentations dupliquées : front `expandMenuItem`, backend `logistics.service.ts` (`deriveSales`), inventaire `buildConsolidatedInventory`. |
| 22 | Onglet Staff dans Event Predict Configuration Settings | **Voir la Google Slide interface** (spec de référence pour le contenu de l'onglet). Reste planifié séparément de `feat/postEventInventory` ; algo RH à revalider avant (question 28 toujours ouverte). |
| 23 | Élargissement `spaceInventory` + `preInventoryExpected` aux rôles « Directeur de site » / « Chef exécutif » | **Élargissement validé.** Rejouer le seed du catalogue de permissions. |
| 24 | Pre-event : reset logistique intercalé non déduit (double comptage possible) | **Inventaire attaché à son event. Reset automatique sur Door opening, sauvegarde en réconciliation rattachée à l'événement.** L'ancrage devient l'event lui-même, plus une fenêtre globale de mouvements — recoupe la question 25 (bornes de fenêtre). |
| 26 | Post-event : métriques client stockées verbatim, sans contrôle serveur | **Mettre en place le recalcul/validation serveur.** Résultat visible **uniquement par Directeur de site et Admin.** |
| 27 | Photos base64 dans `MenuItem.picture` (une ligne à 915 ko) | **Redimensionnement nécessaire** pour limiter la taille mémoire. Implique un redimensionnement client avant upload (recoupe BUG-082) ; migration des 3 lignes legacy et normalisation des 79 `''` restent à traiter dans la foulée. |

---

## 2. Réponses par l'audit base de données (2026-07-24)

### 2.1 Décidables sans arbitrage métier — les données tranchent

| # | Constat mesuré | Conclusion |
|---|---|---|
| 2 | Colonnes `performerName`/`sponsor`/`openingActName`/`allSessions` absentes du modèle `Event` (schéma vérifié). **0 `CsvMapping` sauvegardé en base** — aucun mapping stocké ne référence ces champs. | **Retirer ces colonnes du mapping CSV.** Coût zéro : aucune donnée existante à préserver, aucun mapping utilisateur à casser. |
| 4 | Contrainte `Team_tenantId_eventCategoryId_eventSubcategoryId_name_key` **déjà posée en DB** (backstop BUG-70). **0 doublon insensible à la casse** dans les 11 teams existantes. | **Question quasi close.** La contrainte existe et aucun conflit réel n'existe. Seul raffinement optionnel : index unique fonctionnel sur `lower(name)` pour reproduire la sémantique insensible du check applicatif. |
| 5 | **1 seule** `EventPredictVersion` orpheline (1 `eventId` inexistant sur 3 versions). | **Ajouter la vérification `eventId` à la création** ; le nettoyage se réduit à 1 ligne. |
| 12 | **0 doublon** (eventId + name) — 3 versions au total en DB. `KvStore` : 0 clé predict. Les « jusqu'à 76 doublons » de la fiche 181 **n'existent pas dans cette base**. | **Contrainte unique posable immédiatement, sans nettoyage préalable.** ⚠️ Vérifier quelle base la fiche 181 mesurait (autre environnement ou localStorage front) avant de la clore. |
| 15 | 418 mappings PdV : **418 keyés location, 0 keyé merchant, 0 inconnu.** La convention legacy merchant est absente des données. | **Aucune migration nécessaire.** Supprimer le support merchant du code legacy (`space-aggregation.service.ts:184-186`) et corriger le commentaire de `schema.prisma` (modèle `LocationShopMapping`). |
| 10 | 44 rôles « PDV Superviseur » / « Technicien Logistic » (sur ~22 tenants) ont `front.fb.restockBoard` sans `front.fb.restock` — mais **0 utilisateur assigné** à ces rôles (ni `UserTenant`, ni legacy `User.roleId`). | **Fenêtre idéale pour aligner les permissions : personne n'est affecté.** La décision RBAC (élargir le PUT/DELETE vs lecture seule) reste à prendre, mais elle est aujourd'hui sans impact utilisateur. |

### 2.2 Éclairées par les données — arbitrage métier encore utile

| # | Constat mesuré | Éclairage |
|---|---|---|
| 7 | 38 events avec `ticketsSold` **et** `ticketsScanned` remplis : **0 cas** `scanned > sold`. | Les données réelles ne violent jamais la règle. Un avertissement non bloquant ne gênerait aucun cas existant ; la question bloquant/avertissement reste métier. |
| 11 | `InventoryCount` : 134 lignes, 4 events, dernière écriture **2026-07-23**. `InventorySnapshot` : 33 docs, tous `kind = legacy`, dernier **2026-07-18**. Pour 3 events sur 4, le granulaire est plus frais que le snapshot. | L'usage réel penche vers **granulaire = canonique** (c'est le chemin vivant), snapshot = historique. À confirmer avant d'enrichir le DTO granulaire. |
| 14 | Bucket « Non rattachés » : **160 850 tx / 540 410 (29,8 %)**, CA **2 555 555,65 € / 8 497 194,91 € (30,1 %)**. 107 locations vendues sans mapping. | Près d'un tiers du CA. L'inclusion dans les vues par article change massivement les totaux → un toggle « inclure les non rattachés » paraît justifié, mais c'est un choix d'affichage métier. |
| 16 | 4 jours en collision (9 events impliqués — ex. « Fc Rennes vs Fc Lorient », « Paris SG vs OL Lyonnais » et « Test » le même 2026-05-09). Lien stocké `weezeventEventId` rempli sur **8/61 events (13 %)** seulement. | La jointure par date est ambiguë sur des cas réels, mais le lien stocké est trop peu rempli pour être canonique en l'état. Ordre pratique : **backfill du lien d'abord, puis lien stocké = règle canonique.** |
| 21 | 3 versions predict en DB, **toutes** avec `predictedRecords` non vide, 3 events couverts. | La bascule de lecture Qty Pred du pont localStorage vers l'API (`EventPredictVersion.predictedRecords`) est **techniquement viable dès maintenant**. |
| 25 | `StockMovement` : 38 mouvements au total, **1 seul space** (pilote). Répartition : 14 DELIVERY, 10 TRANSFER_SHOP, **8 INVENTORY_RESET**, 4 TRANSFER_STORAGE, 2 EXPIRY. `StockReconciliation` : 1 doc (reset legacy). | Les 8 INVENTORY_RESET polluent déjà l'« attendu » sommé toutes-raisons. Volume minuscule → corriger la formule maintenant ne coûte rien. La réponse métier à la question 24 (ancrage à l'event, reset sur Door opening) donne le cadre cible. |
| 3 | Échelle réelle des taxonomies : 12 types, 21 catégories, 20 sous-catégories, 61 events. Pire cas mesuré : supprimer « Sport » (tenant `cmovsic…`) cascaderait 2 catégories + 2 sous-catégories et détacherait 19 events. | Volume faible mais perte réelle possible sur un clic. Le choix garde-fou transverse vs statu quo reste métier. |

### 2.3 Non décidables par la base

| # | Pourquoi |
|---|---|
| 6 | Choix d'architecture front (unifier ou garder les 2 implémentations de création de catégorie). |
| 9 | Choix d'architecture front (`EventDrawerShell` : migrer les 3 drawers ou assumer la duplication). |
| 13 | Règle métier pure (asymétrie inventaire au composant / restock aux ingrédients). |
| 20 | Règle métier pure (Miss € au coût unitaire vs prix de vente). |
| 28–31 | Specs RH et Live à valider (algo staffing, backend `/hr`, fusion ElementStaff/bibliothèque RH, polling live-status Home). |

---

## 3. Prochaines étapes

1. ✅ **Fait le 2026-07-24** : réponses métier (§1) reportées dans la doc canonique concernée
   (`02_ANALYSE.md`, `01_EVENT_PREDICT_ALGORITHME.md` + fiche 188, `11_RH_STAFFING.md`,
   `10_POST_EVENT_INVENTORY.md`, fiches bugs 147/227/82), lignes correspondantes passées 🟢
   (résolues) dans [`QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md). **Aucune de ces 8 réponses
   n'est encore codée** — voir chaque fiche pour le détail du reste à faire (§4 ci-dessous).
2. Traiter les actions « coût zéro » de §2.1 (retrait colonnes CSV, vérif `eventId` à la création
   des versions predict, contrainte unique predict, nettoyage code merchant legacy) — chacune sur
   sa fiche bug existante. **Toujours à faire.**
3. Clarifier l'origine des doublons de la fiche 181 (autre base ? localStorage ?) avant de la clore.
4. ✅ **Fait le 2026-07-24 (2ᵉ passe, plus tard le même jour)** : les 23 questions du tracker (+ 4
   dormantes de l'ancien tracker backend) ont été rejouées une à une contre le code réel pour
   séparer ce qui est authentiquement produit de ce qui est technique/déjà résolu. Résultat : 6
   fermées (déjà résolues dans le code), 12 décisions techniques déplacées vers
   [`DECISIONS_TECHNIQUES.md`](DECISIONS_TECHNIQUES.md) (Ulrich, pas Bertrand), 9 questions
   produit authentiques restantes dans
   [`QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md) : #2, #13, #14, #20, #25, #28, #30, #31,
   #33.

## 4. Code restant à écrire pour les réponses du §1 (2026-07-24)

Chaque réponse ci-dessus est une **décision**, pas un fix livré :

| # | Fix à coder | Fichiers |
|---|---|---|
| 8 | Aucun — `events.js` reste à 15 min (confirmé). Le « 2 min » vise le futur module Live, mécanisme séparé à concevoir avec ce module, pas une modif de ce store. | — |
| 17 | Unifier la formule CA moyen/event (total ÷ nb, sans filtre) | `useMetricsCalculator.js`, `store/modules/analyse.js`, `AnalyseView.vue` |
| 18 | Brancher `comboItem` dans l'explosion Stock up (3 endroits) | `EventPredictStockUpSection.vue`, `logistics.service.ts` (backend), `utils/inventoryUtils.js` |
| 22 | Implémenter l'onglet Staff (bloqué sur #28) | — planifié séparément |
| 23 | Rejouer le seed RBAC en prod (spaceInventory/preInventoryExpected) | `backend/prisma` seed RBAC |
| 24 | Reset auto sur Door opening, ancrage attendu sur l'event | `backend/src/features/inventory/inventory.service.ts`, `logistics.service.ts` |
| 26 | Recalcul/contrôle serveur des métriques post-event + gate visibilité Directeur/Admin | `backend/src/features/inventory/*` (dto + service), permission catalog |
| 27 | Redimensionnement client à l'upload + migration Storage des 3 lignes + normalisation des 79 `''` | `MenuItemCreateView.vue`, backend Supabase Storage |

— JLH, 2026-07-24
