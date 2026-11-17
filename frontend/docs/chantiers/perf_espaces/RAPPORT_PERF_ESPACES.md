# Rapport de performance des pages d'espace

Date : 2026-11-13. Statut : analyse de code uniquement, rien n'a été modifié ni committé.

## 1. Méthode et limites

- 31 sections d'analyse (dossier `annexes/`), rédigées par des sous-agents en lecture seule, un périmètre étroit chacune.
- **Aucune mesure réelle** : pas de Network, pas d'EXPLAIN, pas de profil navigateur. Les durées citées (12 à 60 s, 15 à 20 s, etc.) viennent des commentaires du code, pas de nos tests.
- Les constats n'ont pas été re-vérifiés un par un par l'agent principal. Chaque section cite fichier:ligne pour permettre la vérification.
- Chaque section liste en fin ce qui n'a pas été lu (« non vérifié »).

## 2. Corrections de mes premiers messages

Des agents suivants ont corrigé des affirmations antérieures :

| Affirmation initiale | Correction | Source |
|---|---|---|
| `event-timeline` pèse 2 Mo par event | Faux. Les 2 Mo et 4 782 lignes concernent `transaction-baskets`. `event-timeline` : quelques centaines de ko pour 30 events | annexe 03a |
| La CPU de Predict est dans le scoring | Surtout dans environ 4 copies d'objet par ligne et une double agrégation | 03a |
| Commandes a 4 étapes en `v-show` | 3 étapes (`goToStep` borne à 1..3) | 06c |
| `getMarketPrices()` renvoie le catalogue complet | Sans paramètre, il ne renvoie que la page 1 (200 lignes) : le repli fournisseur/photos peut être incomplet | 08c |
| Doublon des vues d'agrégat Inventaire à l'ouverture | Non, exclusives via `isMobile` | 07a |
| `/preferences` est une route NestJS | C'est une Edge Function Supabase absente du dépôt | 01d |
| Le simulateur Live pèse sur la page | Jamais rendu en production | 02c |

## 3. Causes transversales, par impact

### T1. La RPC `get_space_shop_details` en mode granulaire
Pages touchées : Analyse, Event Predict, Commandes, (Live indirectement).
- `_space_event_ids` et `_gran` lisent tout l'historique de l'espace, sans fenêtre de dates ; la pagination ne borne que les ids d'events. `menuItemCostMap` est calculé sur tout le tenant (annexe 03b, migration `20261102120000`).
- `SELECT DISTINCT` sur la table brute `WeezeventTransaction` (annexes 01, 05b).
- Cache Redis de 60 s seulement (`space-cache.service.ts:36`).
- Effet : fin de l'enrichissement d'Analyse, premier calcul de la courbe de Predict, publication du catalogue de Commandes.

### T2. Un portillon à 2 requêtes, côté front et côté serveur
- Front : `space.api.js:266` ; serveur : `analyseBatchSemaphore` (`space-sales-scope.service.ts:29`).
- Partagé entre timelines, paniers et `analyse-unmapped`. 21 paquets pour 100 events sur Analyse (annexe 01).
- Le cache par event est purgé en entier à chaque ré-agrégation (03b).

### T3. `transaction-baskets` sans grain allégé
- Environ 2 Mo par event, paquets de 6, jusqu'à 17 requêtes (annexes 01, 02a).
- Repli sur la table brute pour les events non pré-agrégés, rejoué toutes les 60 s pour un event futur au rollup nul (03b).
- La bande KPI et la Comparaison attendent la fin de tous les paquets.

### T4. La consommation de stock Logistic recalculée sans cache
- Elle ne dépend pas de `configId`, mais Commandes appelle `/logistics/:space/stock` une fois par config (annexe 08b, `stock-level.service.ts:37,214`).
- Aucun cache Redis dans `features/logistics`.
- Même calcul : `GET /live/inventory` toutes les 15 s par onglet (09d), `GET /guest-pin/ventilation` toutes les 30 s par appareil via `packSizes` (08b), checkmarks et envois d'inventaire (07b).
- SQL à 5 jointures sur `WeezeventTransactionItem`, sans borne haute, jointure avec `OR` (`logistics.queries.ts:18-19`).

### T5. N+1 des composants dans Commandes
- Le front appelle `GET /menu-components/:id` par composant (`componentCatalog.js:131-183`), alors que la liste contient déjà `ingredients[]` et `children[]` (05b). Il faut seulement adapter la lecture à la forme brute.

### T6. Chaînes séquentielles au démarrage
- Analyse : `getSession`, puis `/preferences`, puis `loadSpace` (`AnalyseView.vue:2642-2665`) ; `stock-valuation` et `loadMarketPrices` (inutile pour Analyse, environ 60 s à froid) partent au montage.
- Commandes : liste des prédictions, versions par event, attente du catalogue, Logistic, inventaire, état restauré, plan (05).
- Inventaire : un GET de trop après `allSettled` dans `loadContext`, 4 GET en série dans `buildReconciliationLines` (07a).
- Shell : `/onboarding/status`, puis `/me`, puis `GET /spaces?limit=100` à froid (10a).

### T7. Endpoints sans `select`, sans cache ou avec N+1
| Endpoint | Problème | Annexe |
|---|---|---|
| `GET /weezevent/products` | relit tout le catalogue par page, pagination par `slice` en mémoire | 01b |
| `GET /menu-items` | environ 15 à 20 requêtes SQL par page, recette complète | 01b |
| `GET /mappings/product-menu` | renvoie `SalesProduct` complet (Json), tous les prix | 01d |
| `GET /market-prices` | sans `select`, sans cache, colonne `image` | 01d, 05b |
| `GET /events`, `event-costs`, `article-dimensions` | sans cache, relecture du tenant | 01b, 02c |
| `GET /spaces?limit=100` | jamais le cache Redis de liste (réservé à page 1, limit 10) | 10a |
| `GET /builder-v2/spaces/:id/state` | sans cache, tout le state | 10b |
| `GET /events/:id/predict-versions` | 6 colonnes Json sans `select` ; PATCH/DELETE relisent la ligne | 04b |
| `GET /space-menu/shop/:id/items` | 8 requêtes tenant-wide recalculées par PdV | 04b |
| `GET /inventory/.../reconciliations`, `/:s/:e` | sans `select`/`take`, blob de snapshot lu pour rien | 07b |
| `PATCH /restock-plans/:id` | relit la photo entière pour un contrôle d'existence | 05b, 06a |
| `/guest-pin/catalog` | sans cache, 3 allers-retours, jusqu'à 5000 lignes | 07b |
| Cost tracking | 4 GET lourds au montage sans cache, dont 2 recalculs identiques | 09c |
| `/ingredients` | TTL 60 s contre 3600 s ailleurs | 05b |

### T8. Recalculs front sans debounce
- Analyse : chaque coche du panneau gauche passe par `setFilterImmediate` : au moins 6 balayages de grosses listes, 8 composants relus (01e). `abort()` ne transmet pas son signal (`useAnalyseTimeline.js:82,107`).
- Event Predict : le slider émet à chaque `pointermove` et invalide 5 computed (04a).
- Commandes : le curseur de l'onglet stockage relance toute la cascade ; `findStockReference` et `computePackagingForQuantity` balayent 4 catalogues par ligne (estimation 10^7 à 10^8 comparaisons par cran, 06c).
- Inventaire : autosave sans debounce, un POST par frappe ; `getCount` recrée un objet par appel (07, 07a).

### T9. Tout est monté et chargé d'emblée
- Analyse : 14 canvas Chart.js montés ensemble, imports statiques, Comparaison et Rapport J+1 dans le chunk initial, modèle sémantique (environ 120 Mo selon un commentaire) actif par défaut (02a, 01c).
- Commandes : étapes en `v-show`, trois panneaux de colonne droite calculés dès l'étape 1 (06b).
- Space d'analyse sans keep-alive ; changer d'espace vide tout le cache keep-alive (10a).
- Code mort : environ 2 186 lignes sans import trouvé (`AnalyseAppHeader.vue`, `analyse/FilterPanel.vue`, `MultiSelectFilter.vue`, `FilterBottomSheet.vue`).

### T10. Polling et flux sans pause onglet caché
- Live : `/live/inventory` 15 s ; double `loadSpace` au premier montage (confirmé par le code) ; `/live-status` appelé par la page et le flux global ; 2 connexions Redis par onglet (09d).
- POS staff : poll 30 s, environ 12 SQL en série (09e).
- Logistique : timer 10 s remplaçant tout l'état + 3 relectures de Ventilation ; panneau Tâches 20 s (08, 08c).
- Inventaire : tick staff 20 s en trois appels en série, `InventoryPinBand` 30 s, poll invité 30 s à 4 requêtes (07, 07a).
- Liste des espaces : chaque carte appelle `live-status` au montage (10a).

## 4. Page par page

| Page | Chemin critique (d'après le code) | Premiers correctifs | Annexes |
|---|---|---|---|
| Analyse `/spaces/:id` | chaîne séquentielle, `shop-details` granulaire, paniers via portillon | preferences en parallèle, sortir `loadMarketPrices`, debounce filtres, grain `summary` des paniers | 01, 01b-e, 02a-c |
| Event Predict | granulaire, batch timeline, calcul client | éviter le double calcul après swap, borner le granulaire, shopMenuAvailability groupé | 03a, 03b, 04, 04a, 04b |
| Commandes | catalogue (N+1, granulaire), Logistic par config, chaîne finale | supprimer le N+1, cache de la consommation, restock-state en parallèle | 05, 05b, 06a-c |
| Inventaire pre/post + PIN | `loadContext`, autosave, push Logistic | debounce autosave, `select` des relectures, cache catalogue invité | 07, 07a, 07b |
| Logistique + Ventilation | `/stock` + polling 10 s, checkmark séquentiel | cache consommation, affichage optimiste, pause onglet caché | 08, 08b, 08c |
| Live | `/live/inventory` sans cache, double `loadSpace` | cache court, pause onglet caché, une seule connexion | 09, 09d |
| POS (staff + caisse) | poll 30 s, vente à 20 requêtes en série | cache du détail, accélérer la vente | 09b, 09e |
| Cost tracking | 4 GET lourds au montage, `force:true` | cache serveur, ne pas contourner le cache de 15 min | 09c |
| Liste des espaces, shell | 3 à 4 allers-retours à froid, `live-status` par carte | cache de `GET /spaces?limit=100`, un seul flux pour le live | 10a |
| Builder, Space Menu | state sans cache, 3 requêtes en cascade | cache Redis du state, fusion des appels | 10b |

## 5. Plan d'action proposé

Règles du projet : une branche et un worktree par lot ; tests lourds via `scripts/test-serial.sh` ; aucun push ni merge hors develop sans go explicite ; aucun commit sans demande ; démarrer le backend en local avant tout déploiement.

### Lot 0. Mesurer (avant de toucher au SQL)
- Mesure du temps jusqu'au premier contenu utile par page, à froid et à chaud, tableau de bord simple.
- EXPLAIN de `get_space_shop_details`, `logistics.queries.ts:salesByElementSince`, `transaction-baskets` (repli brut). SELECT seulement, `begin read only`, jamais de `SET` de session sur le pooleur 6543.
- Relever dans Network les tailles réelles de `shop-details`, `transaction-baskets`, `/menu-components`, `/live/inventory`.

### Lot 1. Gains rapides, risque faible (frontend)
1. Commandes : supprimer le N+1 `menu-components/:id` (T5).
2. Analyse : `/preferences` en parallèle de `loadSpace` ; ne plus appeler `loadMarketPrices` ; passer le signal d'annulation ; minuteurs de filtres au niveau du module.
3. Commandes : `restock-state` et liste des plans dès le départ ; Map indexées dans `stockPlanning.js` ; debounce du curseur.
4. Inventaire : debounce de l'autosave ; supprimer les doubles appels de `buildReconciliationLines`.
5. Pause des polls quand l'onglet est caché (Live, POS, Logistique, Inventaire, PinBand).

### Lot 2. Gains rapides, risque faible à moyen (backend)
1. `select` et `take` sur `reconciliations`, `predict-versions` (route légère de version par défaut), `PATCH restock-plans`.
2. Cache Redis court sur `GET /spaces?limit=100`, `market-prices`, `builder-v2 state`, `/live-status`, `/guest-pin/catalog` ; TTL `/ingredients` à 3600 s.
3. Cache de `getLevelsAndConsumption` (clé : espace + dernière réconciliation, invalidation à l'écriture), sans dépendre de `configId`.
4. Partager le calcul de disponibilité de l'espace par (tenant, espace) dans `space-menu/shop/:id/items`.

### Lot 3. Structurel
1. Refonte de `get_space_shop_details` : borner `_gran` par la page d'events, remplacer le `DISTINCT` brut par les agrégats, chargement non granulaire pour le premier rendu.
2. Grain `summary` de `transaction-baskets` et démarrage conditionnel au panneau visible.
3. Throttle d'envoi Logistic en Redis (aujourd'hui en mémoire, non partagé entre instances) ; régénérations hors requête HTTP.
4. Commandes : composants enfants pour les étapes 2 et 3, `v-if` + `keep-alive` ciblé.
5. Analyse : composants asynchrones (Comparaison, J+1, dialogues), montage différé des donuts sous la ligne de flottaison, suppression du code mort.

### Objectif de 3 secondes
Réaliste comme premier contenu utile (structure + chiffres clés, données lourdes ensuite avec squelettes), pas comme chargement complet à froid de chaque page. À valider par le lot 0.

## 6. Ce qui n'a pas été couvert (agrégé)
- Aucun EXPLAIN, aucune taille de réponse, aucun profil navigateur.
- Backend : `stock-movement.service.ts`, `stock-reconciliation.service.ts`, `inventory-baseline.service.ts`, `post-event-draft.service.ts`, `pos-admin.controller`, `JwtDatabaseGuard`, `SpaceAccessService`, `getStaffing`, `getEventContext`, `ShopMenuService`, `getSpacesLight`, endpoints propres au tiroir Comparaison, Edge Function `/preferences`.
- Frontend : `SpacesPage.vue` (1 718 lignes), `space-workspace/shared/` (6 composants), `SyncJobFloatingWidget`, 13 composants de `comparison/`, 15 composants POS (en-têtes seulement), `EventPredictRowActions`, `menuItemExpansion.js`, les computed 1136-1262 et 1332-1700 de `SpaceInventoryView.vue`, `FilterBottomSheet`, `MultiSelectFilter`, `DayOfWeekFilter`, `AnalyseAppHeader`.
- Hors périmètre de ce rapport : les pages Menu F&B (composants, menu items, prix du marché, etc.), Configurations, RH, Événements, Administration.

## 7. Index des annexes

`annexes/01_analyse_orchestration.md`, `01b_analyse_backend.md`, `01c_analyse_template_filtres.md`, `01d_analyse_backend_reste.md`, `01e_analyse_filtres_entete.md`, `02a_analyse_graphiques_tableaux.md`, `02b_analyse_comparaison_j1.md`, `02c_j1_simulateur_comparaison_reste.md`, `03a_predict_front.md`, `03b_predict_backend.md`, `04_predict_sections.md`, `04a_predict_composants_restants.md`, `04b_predict_backend_reste.md`, `05_commandes_orchestration.md`, `05b_commandes_backend.md`, `06a_commandes_sous_composants.md`, `06b_commandes_template_calculs.md`, `06c_commandes_calculs_restants.md`, `07_inventaire.md`, `07a_inventaire_front_restant.md`, `07b_inventaire_backend.md`, `08_logistique.md`, `08b_logistique_backend.md`, `08c_logistique_composants.md`, `09_live_pos_cost.md`, `09b_pos.md`, `09c_cost_tracking.md`, `09d_live_restes.md`, `09e_pos_staff.md`, `10a_shell_liste_espaces.md`, `10b_builder_space_menu.md`.

Les sections 01, 02b, 03 (remplacée par 03a et 03b), 04, 07, 08 et 09 ont été complétées ou corrigées par les sections suffixées. En cas de contradiction, la version suffixée (la plus récente) prévaut.
