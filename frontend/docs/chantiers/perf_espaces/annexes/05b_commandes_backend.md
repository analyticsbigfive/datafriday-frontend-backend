# Page Commandes (/spaces/:id/restock), côté BACKEND

Statut: complet dans la limite du budget de lecture. Les points non lus sont listés en section 7.
Écrit en français, sans tiret cadratin. Chemins relatifs à la racine du dépôt. Les durées citées viennent des commentaires du code.

## 1. Fiche de la page (périmètre backend)

Périmètre: endpoints appelés par la page Commandes et non couverts par les autres agents. Logistique et stock sont couverts par un autre agent (non lus ici).

| Endpoint | Contrôleur | Service | Statut lecture |
|---|---|---|---|
| GET /menu-components | backend/src/features/menu-components/menu-components.controller.ts:60-78 | menu-components.service.ts:352-395 (findAll) | lu |
| GET /menu-components/:id | menu-components.controller.ts:80 | menu-components.service.ts:397-411 (findOne) | lu |
| GET /menu-items?limit=150 | backend/src/features/menu-items/menu-items.controller.ts | services/menu-item-query.service.ts | lu |
| /inventory/:space/reconciliations, /:event, /latest | backend/src/features/inventory/inventory.controller.ts | inventory-reconciliation.service.ts | lu |
| restock-plans (liste, GET :id, PUT/POST) | backend/src/features/restock-plans/restock-plans.controller.ts | restock-plans.service.ts (176 l.) | lu |
| restock-state | backend/src/features/restock-state/restock-state.controller.ts | restock-state.service.ts (44 l.) | lu |
| market-prices (liste, types, catégories) | backend/src/features/market-prices/ | market-prices.service.ts | lu |
| packaging-types / packing-types | backend/src/features/packing-types/, packaging/ | | lu |
| suppliers | backend/src/features/suppliers/ | suppliers.service.ts | lu |
| builder-v2/spaces/:id/state | backend/src/features/builder-v2/builder-v2.controller.ts | builder-v2.queries.ts | lu |
| kitchens | backend/src/features/kitchens/ | kitchens.service.ts | lu |
| ingredients (liste paginée) | backend/src/features/ingredients/ | ingredients.service.ts | lu |

## 2. Arbre des composants

Sans objet pour ce rapport backend (voir 05_commandes_orchestration.md et 06a/06b).

## 3. Appels API, endpoint par endpoint

### 3.1 GET /menu-components (liste)

- Contrôleur: menu-components.controller.ts:60-78, pas de @RequirePermissions (guard JwtDatabaseGuard seulement, :29), DTO MenuComponentsFindAllQueryDto, défaut page=1, limit=100.
- Service: menu-components.service.ts:352-395. Filtre `tenantId` + `deletedAt: null`, et pour un compte restreint `spaceIds isEmpty OR hasSome visible` (:361-364). Appelle `this.visibleSpaces(user)` (:359) avant le cache (coût non lu).
- Prisma: `findMany` + `count` en parallèle (Promise.all :370-379), `orderBy name asc`, `skip/take`, `include: this.includeRelations` (:203-231).
- includeRelations (:203-231): kitchen {id,name}; seasonLinks (componentSeasonLinksInclude); ingredients -> ingredient -> marketPrice {supplier, supplierId, supplierRel.name}; children -> `child: true` (ligne MenuComponent complète); parents -> `parent: true` (ligne MenuComponent complète).
- Cache Redis: `redis.getOrSet(listCache.key(tenantId, "list:<scope>:<page>:<limit>"), ..., { ttl: 3600 })` (:365-389). Invalidation: `listCache.invalidate(tenantId)` appelé à chaque création/mise à jour (:327, :333, commentaire :386-389). La clé dépend de la page ET de la limite: chaque combinaison est une entrée distincte.
- Prisma charge chaque relation par une requête séparée (stratégie par défaut `include`), soit environ 8 requêtes SQL par lot de composants (kitchen, seasonLinks, ingredients, ingredient, marketPrice, supplierRel, children, child, parents, parent). Non mesuré, déduction du schéma d'include.
- Payload: non mesuré. Chaque composant porte sa ligne entière (picture, description, subComponents JSON) + tous ses ingrédients (ingredient complet) + tous ses enfants (child entier) + tous ses parents (parent entier): un même composant très réutilisé est donc répété dans la ligne de chacun de ses parents ET de ses enfants. Limite par défaut 100 (controller :75, service :352).

### 3.2 GET /menu-components/:id (détail)

- Service: menu-components.service.ts:397-411. `findFirst` avec le MÊME `includeRelations` que la liste, AUCUN cache Redis, puis `assertComponentSpaces` (:409).
- Donc le détail ne renvoie pas plus de données que la liste: la liste contient déjà ingredients et children (voir 5, constat a).

Constat (a), vérifié: la LISTE et le DÉTAIL partagent exactement le même `includeRelations` (service :203-231, utilisé en :374 et :401). La liste renvoie donc déjà `ingredients[]` (avec `ingredientId`, `quantity`, `unit`, `ingredient` complet + `marketPrice{supplier,supplierId,supplierRel.name}`) et `children[]` (lignes ComponentComponent: `childId`, `quantity`, `unit`, `cost`, `child` = ligne MenuComponent complète). Le commentaire du front (frontend/src/utils/componentCatalog.js:5-16 et frontend/src/composables/useSpaceData.js:370-372) qui dit "la LISTE ne renvoie pas subComponents" n'est vrai que pour le champ JSON legacy `subComponents`, pas pour les relations. Le détail n'apporte AUCUNE donnée de plus (aucun champ calculé, pas de cache Redis, il fait `findFirst` + `assertComponentSpaces`).

Ce qu'il manque pour supprimer le N+1 sans toucher au backend: uniquement l'adaptation front de `buildSubComponentsFromDetail` (componentCatalog.js:78-113) à la forme brute de `children[]`. Les lignes enfants brutes portent `childId`, `child.name`, `quantity` alors que le code lit `ch.componentId || ch.id` (id de la ligne de liaison, pas du composant), `ch.itemName || ch.name` et `ch.numberOfUnits` (componentCatalog.js:102-111), puis filtre `.filter(s => s.name)` (:113). A vérifier côté front (non lu ici): si aucune normalisation n'est faite en amont, les composants de composants seraient écartés ou à quantité 0. C'est le même risque pour le détail aujourd'hui (même forme), donc ce n'est pas une régression de la bascule liste.

### 3.3 GET /menu-items?limit=150

- Service: backend/src/features/menu-items/services/menu-item-query.service.ts:32-112. `limit` borné à 500 (:40), clé de cache `list:<page>:<limit>:<scope>:<search>:<typeId>:<categoryId>:<seasonIds>:<readyForSale>` (:59-62), `redis.getOrSet` TTL 3600 (:107). Invalidation: `invalidateCache()` d'après le commentaire :101-106 (non relu dans menu-item-support).
- Prisma: `findMany` + `count` + `getTenantDefaultVatRate` en parallèle (:85-95). `include: includeRelations` (backend/src/features/menu-items/services/menu-item-support.service.ts:30-71): kitchen, productType, productCategory, brand, displayName, seasonLinks, `components{component: true}`, `ingredients{ingredient{marketPrice sans image}}`, `packagings{packaging{marketPrice sans image}}`, `comboChildren{child: true}`, promotion (+2 sous-relations), `menuAssignments{station{config{spaceId}}}`, spaceLinks. Soit environ 15 à 18 requêtes Prisma par appel (une par relation et sous-relation), avec `component: true` et `child: true` qui ramènent des lignes MenuComponent/MenuItem entières (picture, description, subComponents JSON).
- Le seul `getAccessibleSpaceIds(user)` est appelé AVANT le cache (:47-48), donc même un hit Redis paie cette requête pour un compte restreint.
- Payload estimé: 150 articles x (recette complète + lignes composants/ingrédients/packagings entières). Non mesuré.

### 3.4 GET /inventory/:spaceId/reconciliations, /:spaceId/:eventId, /:spaceId/latest

- Contrôleur: backend/src/features/inventory/inventory.controller.ts:39 (permission de classe `front.fb.spaceInventory`), :68-79 (latest), :84-97 (reconciliations). Aucun cache Redis sur ces trois routes (non trouvé dans les fichiers lus).
- reconciliations (inventory-reconciliation.service.ts:172-201): `assertSpaceInTenant` puis `stockReconciliation.findMany` SANS `select` ni `take`, filtre `tenantId, spaceId, kind in (pre-event, post-event)`, `orderBy createdAt desc` (:174-182). La colonne `lines` (Json) de TOUS les documents de l'espace est ramenée (commentaire :163-166 assume "quelques documents"). Index: `@@index([tenantId, spaceId, createdAt])` (schema.prisma, modèle StockReconciliation), couvre le filtre et le tri. Puis `withLivePostEventDraft` (:185-201) recalcule l'état des brouillons post-event (requête supplémentaire `loadPostEventDraftStates`, non lue) et `redactPreEventDoc` (:227-247) réécrit toutes les lignes en mémoire si pas de permission "attendus".
- latest (inventory-count.service.ts:102-130+): 2 `findFirst` parallèles (inventoryCount par `updatedAt desc`, inventorySnapshot par `createdAt desc`), puis `findMany` de TOUS les comptages de l'event (+ `event.findFirst`). `latestSnapshot` est chargé en ligne entière, donc avec la colonne Json `inventoryCounts`, alors que seule la comparaison de dates sert quand les comptages sont plus récents. Index: InventoryCount `[tenantId, spaceId, updatedAt desc]`, InventorySnapshot `[spaceId, createdAt]`, OK.
- /:spaceId/:eventId (inventory-count.service.ts:31-71): 3 requêtes parallèles (snapshot findFirst complet, `inventoryCount.findMany` tous les comptages de l'event, pre-snapshot `select createdAt`). Même défaut: le snapshot complet (Json) est lu même quand la branche comptages l'emporte et que seuls `id/createdAt/updatedAt` sont renvoyés (:64-71). Index: InventorySnapshot `[spaceId, eventId]`, InventoryCount `[spaceId, eventId]` et unique, OK.

### 3.5 Restock plans et restock state

- restock-plans: contrôleurs backend/src/features/restock-plans/restock-plans.controller.ts:43 (`spaces/:spaceId/restock-plans`: GET liste :47-49, POST :64) et :89 (`restock-plans`: GET :id :93, PATCH :103, POST :id/duplicate :119, DELETE :133). Permissions `front.fb.restock` / `front.fb.restockBoard`. Aucun cache Redis.
- Liste (restock-plans.service.ts:103-110): `where tenantId, spaceId`, `orderBy updatedAt desc`, `take` par défaut 1000 (MAX_LIST_TAKE :8), `select: LIST_SELECT` (:42-54) sans les blobs de photo, mais AVEC `eventsSnapshot` (Json, petit tableau [{id,name,date}] par plan). Index `@@index([tenantId, spaceId, updatedAt])` (schema.prisma, modèle RestockPlan): couvre exactement la requête. Bon point. Pas de requête `assertSpaceInTenant` sur la liste.
- GET :id (:113-117): `findFirst` ligne entière. Les colonnes Json `stockLines`, `restockLines` (jusqu'à 5000 lignes, MAX_RESTOCK_LINES :12), `shoppingGroups`, etc. sont toutes lues. Commentaire :39-41: restockLines peut peser "des centaines de kilo-octets" (durée/volume cités du code, non mesurés). Plafond payload écriture 1 000 000 octets (:13).
- PATCH (:144-156): appelle `findById` (:149) donc LIT la ligne entière avec tous les blobs rien que pour un contrôle d'existence/tenant, puis `update`. Idem `remove` (:172-175). Correctif trivial: `select: { id: true }`. `duplicate` (:160-170) charge la ligne entière, c'est nécessaire ici.
- POST (:119-142): `assertPayloadSize` fait `JSON.stringify(body)` (:69) sur tout le corps (déjà parsé par Fastify, double coût CPU, jusqu'à 1 Mo), puis `assertSpaceInTenant` (1 requête) puis `create`.
- restock-state (backend/src/features/restock-state/restock-state.service.ts:11-43): GET `findUnique` sur la clé unique `tenantId_spaceId` (:14-16), ligne entière dont le blob `state` (Json opaque, taille non bornée côté service). PUT = `assertSpaceInTenant` + `upsert` qui réécrit tout le blob à chaque appel (:32-37). Index: `@@unique([tenantId, spaceId])` couvre. Aucune limite de taille dans le service (contrairement à restock-plans). Contrôleur: restock-state.controller.ts:29-68, permissions `front.fb.restock`.

### 3.6 Référentiels (market-prices, types/catégories, suppliers, kitchens, packing-types, ingredients, builder state)

- GET /market-prices (backend/src/features/market-prices/market-prices.controller.ts:96-109, service services/market-price-query.service.ts:67-91): `findMany` + `count` parallèles, `where tenantId (+ filtre fournisseur.sites pour compte restreint :27-34)`, `orderBy itemName asc`, `include: { supplierRel: true }`, SANS `select`, `take` 200 par défaut. AUCUN cache Redis. La colonne `MarketPrice.image` (schema.prisma, modèle MarketPrice, ligne image String?) est donc renvoyée pour chaque ligne; le commentaire de menu-components.service.ts:208-214 précise que cette image "peut être un base64 volumineux" (affirmation du code, non vérifiée sur les données). `serialize` (:44-66) ne retire pas l'image. Index: tenantId, supplierId, itemName, category, goodType... (schema.prisma), le tri `itemName` avec filtre `tenantId` n'a pas d'index composite (tri en mémoire sur le tenant).
- GET /market-price-types et /market-price-categories (market-price-taxonomy.controller.ts:28-34, :88-94; service market-price-taxonomy.service.ts:61-90): `findMany` + `count`, `where OR tenantId/null`, `include categories` (filtrées), limite 200 par défaut. Pas de cache Redis. Petite table, coût bas.
- GET /suppliers (backend/src/features/suppliers/suppliers.service.ts:65-90): `$transaction([findMany, count])`, limite 100, filtre `sites hasSome` pour compte restreint (tableau, pas d'index GIN lu). Pas de cache Redis. Coût bas.
- GET /kitchens (backend/src/features/kitchens/kitchens.service.ts:77-88): même patron, `$transaction`, pas de cache, coût bas.
- GET /packing-types (backend/src/features/packing-types/packing-types.service.ts:12-30): findMany + count, limite 200, pas de cache, coût bas. GET /packaging (packaging.controller.ts:30): non lu en détail.
- GET /ingredients (backend/src/features/ingredients/ingredients.service.ts:71-94): cache Redis `list:<page>:<limit>` TTL 60 s seulement (:89), alors que menu-components et menu-items sont à 3600 s. `include marketPrice` sans image (`marketPriceSelectNoImage`). Index `[tenantId, deletedAt]`. Un TTL de 60 s donne un miss quasi systématique entre deux ouvertures de la page.
- GET /builder-v2/spaces/:spaceId/state (backend/src/features/builder-v2/builder-v2.controller.ts:42-50, service services/builder-v2-zone.service.ts:30-73, SQL builder-v2.queries.ts:20+): UNE requête SQL (CTE `sp`, `zone_rows`...) qui construit un JSON complet. Pour CHAQUE élément: sous-requêtes corrélées sur ElementPerformance, ElementStaff, ElementInventory, ConfigurationElement, WeezeventLocationShopMapping (EXISTS + JOIN WeezeventLocation), MenuAssignment (COUNT DISTINCT, et par config) (:49-95). Il embarque `se.image` (:45) et tout l'inventaire par config (:64-71). Pas de cache Redis, `getBuilderState` fait ensuite un reshape JS (:43-60). Index présents: ElementInventory `[elementId]`, ElementStaff `[elementId]`, ElementPerformance `unique(elementId, configId)`, MenuAssignment `[elementId, enabled]`. WeezeventLocationShopMapping: aucun @@index/@@unique repéré par mon grep (à vérifier dans les migrations).

## 4. Cascade au premier affichage (vue backend)

Je n'ai pas relu l'orchestration front (voir 05_commandes_orchestration.md). Du point de vue backend, au montage la page peut déclencher:
t0: listes catalogue (menu-components, menu-items?limit=150, ingredients, market-prices, suppliers, kitchens, packing-types, taxonomie), la plupart en parallèle. Les deux plus lourdes à froid sont menu-items (15 à 18 requêtes Prisma) et menu-components (environ 8). A chaud, menu-components et menu-items sont servis par Redis (TTL 3600 s), market-prices et builder state ne le sont jamais.
t1: après la liste menu-components, `hydrateSubComponents` lance jusqu'à N appels GET /menu-components/:id (concurrence 5, componentCatalog.js:131-148), pour chaque composant sans `subComponents`. Chaque appel paie un `findFirst` + 8 requêtes de relations, sans cache, pour des données déjà présentes dans la liste. C'est le chemin critique évitable.
t2: restock-state GET, restock-plans GET (liste), inventory reconciliations/latest/:eventId, builder state.

## 5. Problèmes de performance

1. N+1 GET /menu-components/:id alors que la liste porte déjà ingredients[] et children[] (menu-components.service.ts:203-231, :371-376, :399-402; front componentCatalog.js:131-183). Impact: haut. Pages: Commandes et tout écran passant par useSpaceData (composables/useSpaceData.js:373).
2. `includeRelations` de la liste charge `parents: { include: { parent: true } }` (menu-components.service.ts:228-230), inutile pour la page, et `children.child: true` / `ingredients.ingredient` complets. Chaque composant est répété dans ses parents et ses enfants. Impact: moyen à haut (payload et requêtes Prisma), le détail et la liste partagent la même forme donc le coût du détail est identique.
3. GET /menu-items?limit=150 charge environ 15 à 18 relations dont `components.component: true` et `comboChildren.child: true` (menu-item-support.service.ts:38-53), et exécute `getAccessibleSpaceIds` avant le cache (menu-item-query.service.ts:47-48). Impact: moyen (froid), bas (chaud grâce au cache 3600 s :107).
4. GET /market-prices sans cache Redis et sans `select`: renvoie `image` (potentiellement base64 d'après le commentaire de menu-components.service.ts:208-214) et `supplierRel` complet pour 200 lignes (market-price-query.service.ts:73-78). Impact: moyen à haut selon la taille réelle des images (non mesurée).
5. GET /inventory/:spaceId/reconciliations: pas de `select`, pas de `take`, toutes les `lines` Json de tous les documents pre et post event de l'espace, plus requête `loadPostEventDraftStates` et copie en mémoire par `redactPreEventDoc` (inventory-reconciliation.service.ts:172-201, :227-247). Impact: moyen, croît avec le nombre d'événements de l'espace.
6. GET /inventory/:spaceId/latest et /:eventId lisent la ligne InventorySnapshot entière (Json `inventoryCounts`) même quand la branche comptages l'emporte (inventory-count.service.ts:111-115 et :40-43). Impact: moyen.
7. restock-plans PATCH et DELETE appellent `findById` (ligne entière avec tous les blobs Json) uniquement pour un contrôle d'existence (restock-plans.service.ts:149, :173). Chaque autosave d'un plan relit jusqu'à plusieurs centaines de Ko pour rien. Impact: moyen (écriture fréquente d'après le commentaire :5-7: sauvegarde à chaque "Générer la Commande").
8. `assertPayloadSize` fait `JSON.stringify` du corps entier (restock-plans.service.ts:69) et restock-state PUT n'a aucune borne de taille ni de contrôle (restock-state.service.ts:20-38), réécriture complète du blob à chaque appel. Impact: bas à moyen.
9. GET /ingredients avec TTL 60 s (ingredients.service.ts:89) alors que l'invalidation par écriture existe (listCache) et que les deux autres catalogues sont à 3600 s. Impact: moyen (miss fréquent).
10. GET /builder-v2/spaces/:id/state: sous-requêtes corrélées par élément + `se.image` embarquée, sans cache (builder-v2.queries.ts:45-95). Impact: moyen, dépend du nombre d'éléments de l'espace (non mesuré).
11. Contrôle d'accès coûteux avant cache: `visibleSpaces`/`getAccessibleSpaceIds` appelé avant `getOrSet` pour menu-components (:359) et menu-items (:47-48), donc une requête DB même sur hit Redis pour un compte restreint. Impact: bas à moyen (coût de `getAccessibleSpaceIds` non lu).
12. Clé de cache dépendante de `limit`: une page qui change de `limit` (100 vs 150 vs 200) multiplie les entrées et les miss (menu-components.service.ts:365, menu-item-query.service.ts:59-62). Impact: bas.

## 6. Recommandations

| # | Action | Gain attendu | Risque | Effort | Fichiers |
|---|---|---|---|---|---|
| F1 | Frontend: construire `subComponents` depuis `ingredients[]`+`children[]` de la LISTE (appeler `buildSubComponentsFromDetail` sur chaque composant de la liste) et supprimer `hydrateSubComponents` du chemin chaud. Adapter la lecture de `children[]` à la forme brute (`childId`, `child.name`, `quantity`). | Supprime N appels GET /menu-components/:id (chacun 9 requêtes SQL, sans cache). Gain principal de la page. | Moyen: la normalisation des enfants doit être testée (composants de composants, BUG-292-01, BUG-291-01). | M | frontend/src/utils/componentCatalog.js, frontend/src/composables/useSpaceData.js, SpaceRestockView.vue |
| B1 | Backend: allègement de la liste `/menu-components` (option `?light=1` ou select ciblé): retirer `parents`, réduire `children.child` à `{id,name,unit,unitCost}` et `ingredients.ingredient` aux champs utiles. | Payload et requêtes Prisma divisés environ par 2 (estimation, non mesurée). | Moyen: les autres écrans qui lisent `parents`/`child` complet doivent garder l'ancien mode. | M | backend/src/features/menu-components/menu-components.service.ts, DTO query |
| B2 | Backend: `select: { id: true }` dans `findById` pour PATCH et DELETE des plans (créer `assertExists`). | Évite la lecture des blobs à chaque autosave. | Bas | S | backend/src/features/restock-plans/restock-plans.service.ts:144-175 |
| B3 | Backend: `select` sans `image` sur GET /market-prices (ou cache Redis `getOrSet` + invalidation par tenant). | Allège le payload, supprime la requête à chaud. | Bas si aucun écran liste n'a besoin de l'image dans cette route (à vérifier côté front), sinon ajouter un endpoint d'image. | S à M | backend/src/features/market-prices/services/market-price-query.service.ts:67-91 |
| B4 | Backend: passer le TTL de GET /ingredients de 60 s à 3600 s (l'invalidation existe déjà). | Plus de miss entre deux ouvertures de page. | Bas | S | backend/src/features/ingredients/ingredients.service.ts:89 |
| B5 | Backend: GET /inventory/:space/reconciliations: `select` sans `lines` pour la liste + endpoint détail, ou `take` borné; GET /latest et /:eventId: `select` sans `inventoryCounts` quand la branche comptages gagne. | Réduit la lecture Json. | Moyen: le front lit `lines` tel quel (commentaire :163-166), changer le contrat demande un double fetch. | M | backend/src/features/inventory/services/inventory-reconciliation.service.ts, inventory-count.service.ts |
| B6 | Backend: cache Redis court (60 à 300 s) du builder state avec invalidation sur les écritures builder, et retirer `se.image` du payload d'état. | Évite la requête SQL lourde à chaque ouverture. | Moyen (invalidation à brancher sur les mutations builder). | M | backend/src/features/builder-v2/builder-v2.queries.ts, services/builder-v2-zone.service.ts |
| B7 | Backend: sortir `visibleSpaces`/`getAccessibleSpaceIds` de la zone avant cache ou le mémoïser par requête. | Retire une requête DB sur chaque hit Redis (comptes restreints). | Bas | S | menu-components.service.ts:359, menu-item-query.service.ts:47-48 |
| B8 | Backend: borner la taille de `state` dans restock-state PUT comme pour restock-plans. | Protège le débit et la table. | Bas: peut rejeter un état déjà lourd, calibrer. | S | backend/src/features/restock-state/restock-state.service.ts:20-38 |
| SQL1 | Index: ajouter `@@index([tenantId, deletedAt, name])` sur MenuComponent (filtre tenant+deletedAt+tri name) et vérifier l'index sur WeezeventLocationShopMapping(spaceElementId). | Tri sans passe mémoire. | Bas, mais EXPLAIN d'abord (règle du projet sur les grosses tables; MenuComponent est petite, gain probablement faible). | S | backend/prisma/schema.prisma + migration |

Priorité: F1 (gain maximal, aucun changement backend), puis B3 et B4 (triviaux), puis B2, B1.

## 7. Points non vérifiés

- Taille réelle des réponses (menu-components, menu-items?limit=150, market-prices, reconciliations, builder state) et durée des requêtes: aucune mesure, aucun EXPLAIN (accès base interdit).
- Contenu réel de `MarketPrice.image` (URL ou base64) et de `MenuComponent.picture`.
- Normalisation de `children[]` côté front avant `buildSubComponentsFromDetail` (store `analyse`, utils/api.js): non lue.
- Coût de `SpaceAccessService.getAccessibleSpaceIds` et de `loadPostEventDraftStates`; invalidation `invalidateCache` des menu-items (menu-item-support non relu en entier).
- GET /packaging, GET /ingredients/:id, GET /market-prices/with-ingredients non lus; PUT restock-state contrôleur (:43-65) non lu (limite de taille éventuelle côté contrôleur).
- Index WeezeventLocationShopMapping: aucun @@index repéré dans schema.prisma par grep, migrations CREATE INDEX non lues.
- Logistique et stock: laissés à l'autre agent, non lus.
