# Plan — Logistic : vue agrégée multi-configurations, sélecteur, vue « By Item »

## État d'avancement (2026-08-19)

- [x] Étape 0 — dossier de chantier + plan/artefact commités
- [x] **Codé (2026-08-19) — un commit chacun restant à faire, dans cet ordre :**
  1. [x] Item 1 — backend : agrégation multi-config dans `getSpaceElementsWithItems` + sentinel `configId=all`
  2. [x] Item 2 — store `logistics.js` : plomberie du sentinel `all`, tags de config par élément
  3. [x] Item 3 — `LogisticConfigSelect.vue` (nouveau) : sélecteur dans le header
  4. [x] Item 4 — `SpaceLogisticView.vue` : intégration sélecteur, tag config par ligne, défaut agrégé, 3ᵉ tab
  5. [x] Item 5 — `LogisticByItemView.vue` (nouveau) : vue exhaustive par item
  6. [x] Item 6 — i18n FR/EN
- [x] Questions produit **57** et **58** tranchées (Ulrich, 2026-08-19, voir
  [`QUESTIONS_A_BERTRAND.md`](../../QUESTIONS_A_BERTRAND.md)) : Q57 → option (a), QA désactivé en
  mode agrégé ; Q58 → défaut validé, storages inclus dans « By Item ».
- [x] `pnpm tsc --noEmit` (backend) : 0 erreur. `pnpm test:unit` (frontend) : mêmes 3 échecs
  préexistants qu'au chantier 317 (`apiOrMock`, `spaceMenusInventory`, `eventDetailsEditor`),
  aucune régression sur les fichiers touchés.
- [ ] **Vérification navigateur restante (non faite par Claude — voir Vérification)** : dev server
  non démarré/piloté par Claude, l'utilisateur doit tester le parcours réel avant merge.
- [ ] PR — cible `staging` (CONTRIBUTING)

Artefact maquettes : `artefact-maquettes.html` (même dossier, copie statique de référence) —
publié (canvas interactif, **validé à 100 % par l'utilisateur le 2026-08-19**) :
https://claude.ai/code/artifact/b5f0a7c1-3e4c-430e-b0a2-a0311b071c16

## Contexte

Demande initiale (capture d'écran annotée par l'utilisateur, page Logistic) : la page actuelle
n'affiche jamais qu'**une seule configuration à la fois**, sans sélecteur visible — le backend
résout silencieusement `configId explicite > config de l'event > 1ʳᵉ config de l'espace`
(`logistics.service.ts:1277-1281`), et le seul moyen de voir une autre config est un deep-link
`?configuration=<id>` que rien dans l'UI ne révèle (`SpaceLogisticView.vue:196` affiche juste le
nom en texte, `activeConfigName` computed `:616-619`). Sur un espace à plusieurs configurations
(ex. « Plan Max (SFP+PFC) », « Plan Réduit (SFP) », « Plan Soir Concert »), l'utilisateur ne voit
donc jamais l'inventaire complet de l'espace sans deviner l'URL.

Quatre changements demandés, maquettés et validés (voir artefact) :

1. Vue par défaut = **agrégation de toutes les configurations** de l'espace (PDV dédupliqués,
   articles unionnés) au lieu de la 1ʳᵉ config trouvée en silence.
2. **Sélecteur de configuration** visible dans le header, à côté du titre — remplace le texte
   statique. Propose « Toutes les configurations » (défaut) + chaque config individuelle.
3. Nouvelle **vue « By Item »** (3ᵉ tab) : tous les articles stockables (pas seulement les
   ruptures comme le panneau « Restock alerts » actuel), avec détail PDV par PDV au clic.
4. L'ancien comportement (1 seule config, silencieuse) reste **accessible** mais devient un choix
   explicite via le sélecteur, plus jamais un défaut caché.

### Décisions de conception retenues

- **Sentinel `configId=all`**, explicite, au lieu de « ne pas envoyer `configId` » : aujourd'hui
  omettre `configId` fait retomber le backend sur `configurations[0]?.id` (comportement qu'on
  corrige) — il faut donc un 3ᵉ état distinct de « pas précisé » et de « une config précise ».
  Même sentinel côté front dans l'URL (`?configuration=all`) pour rester deep-linkable, à la place
  de l'ancien deep-link invisible.
- **Merge par `id` stable**, pas par nom normalisé : contrairement à `analyse.js:2237-2241`
  (`loadAllConfigsShopContext`) qui doit dédupliquer par nom parce que les `floorElements` v1
  proviennent d'objets distincts par config, `getSpaceElementsWithItems` part d'une requête
  `SpaceElement.findMany` unique (`logistics.service.ts:1020-1033`) — chaque PDV n'existe qu'**une
  seule fois** en base, donc pas besoin de dédup par nom. Le travail réel est d'unioner, **par
  élément**, les `MenuAssignment` actifs à travers **toutes** ses configs au lieu d'en résoudre
  une seule via `resolveElementConfigId` (`:777-784`).
- **Vue « By Item » entièrement front**, aucun nouvel endpoint : le payload `elements[].items[]`
  déjà retourné par `GET /logistics/:spaceId/stock` contient tout le nécessaire ; on pivote
  élément→items en items→éléments côté client, en généralisant le pattern déjà utilisé par
  `LogisticAggregateView.vue` (`groupedItems` computed, lignes 141-165) à TOUS les statuts (pas
  seulement bad/warn) et à TOUS les articles (pas seulement ceux en alerte).
- **Tag de config par élément** (`configIds: string[]`) : nouveau champ sur chaque objet
  `elements[]` retourné par le backend, peuplé uniquement en mode agrégé (liste des `configId`
  distincts pour lesquels l'élément a au moins un `MenuAssignment` actif). Alimente à la fois le
  tag sur les lignes PDV (maquette A) et le tag par ligne « shop » dans le détail dépliable de
  « By Item » (maquette C).

## Règles repo (`frontend/CLAUDE.md`)

Jamais `pnpm build`, jamais toucher au dev server, jamais commit sans demande explicite, pas de
`Co-Authored-By`. i18n obligatoire (`translations.js` FR+EN, clé au même index dans les 2 blocs —
delta constant de 4468 lignes entre bloc EN et bloc FR sur ce fichier). Flux données : composant →
composable → store Vuex → `api/endpoints/*.api.js`. Un composant = un fichier — ne pas replier les
deux nouveaux composants dans `SpaceLogisticView.vue` (déjà 1691 lignes).

---

## Item 1 — Backend : agrégation multi-config

`backend/src/features/logistics/logistics.service.ts`

1. **`getStock`** (bloc `resolvedConfigId`, `:1274-1281`) : si le `configId` reçu du controller
   vaut la chaîne littérale `'all'`, ne PAS entrer dans la résolution single-config existante.
   Nouvelle branche :
   ```ts
   const aggregateAllConfigs = configId === 'all';
   const resolvedConfigId = aggregateAllConfigs
     ? 'all'
     : (inConfigs(configId) ? configId : null) ??
       (inConfigs(event?.configurationId) ? event!.configurationId : null) ??
       configurations[0]?.id ??
       null;
   ```
   Appeler `getSpaceElementsWithItems(spaceId, tenantId, aggregateAllConfigs ? undefined : resolvedConfigId, { aggregateAllConfigs })`.
   `resolvedConfigId: 'all'` doit être renvoyé tel quel dans la réponse JSON (le front s'en sert
   pour savoir dans quel mode il est, cf. Item 2).

2. **`getSpaceElementsWithItems`** (`:1019-1121`) : ajouter un 4ᵉ paramètre optionnel
   `opts?: { aggregateAllConfigs?: boolean }`.
   - **Sans changement** si `aggregateAllConfigs` est faux (comportement actuel préservé à
     l'identique — c'est le chemin « une config précise »).
   - **Si vrai**, dans la boucle `for (const shop of shops)` (`:1041-1052`) :
     - Ne plus appeler `resolveElementConfigId(shop, configId)` (`:1042`, qui résout UNE config
       effective) — à la place, unioner directement tous les `MenuAssignment` activés, quelle que
       soit leur `configId` :
       ```ts
       const ids = [...new Set<string>(
         (shop.menuAssignments ?? [])
           .filter((a: any) => a.enabled)
           .map((a: any) => String(a.menuItemId)),
       )];
       const configIds = [...new Set<string>(
         (shop.menuAssignments ?? [])
           .filter((a: any) => a.enabled && a.configId)
           .map((a: any) => String(a.configId)),
       )];
       ```
     - Stocker `configIds` dans une nouvelle `Map<string, string[]>` (`configIdsByShop`, miroir de
       `enabledByShop` juste au-dessus) pour l'exposer ensuite sur `elements[]`.
   - Sur la construction de chaque élément shop (`:1088-1094`), ajouter
     `configIds: configIdsByShop.get(shop.id) ?? []` (uniquement peuplé si `aggregateAllConfigs`,
     sinon omettre le champ pour ne rien changer à la shape en mode single-config — vérifier que le
     front tolère son absence, cf. Item 2).
   - **Storages** (`:1097-1118`) : aucun changement de logique — ils mergent déjà les items de
     leurs `selectedShops` sans filtrer par config (le filtrage a déjà eu lieu en amont, dans
     `itemMapByShop`). En mode agrégé, `itemMapByShop` contiendra déjà l'union multi-config par
     construction du point précédent — le merge storage en hérite gratuitement. Ajouter en plus
     `configIds` sur l'élément storage = union des `configIds` de ses `selectedShopIds` (pour le
     tag maquette A sur les lignes storage).

3. **`logistics.controller.ts`** : l'endpoint `GET :spaceId/stock` (`:34`, handler `:42-50`) passe
   déjà `configId` en query string tel quel au service — vérifier qu'aucun DTO/pipe de validation
   ne rejette la valeur `'all'` (le paramètre semble aujourd'hui une simple string optionnelle,
   mais à confirmer en lisant le DTO avant de coder — pas vu dans cette passe de recherche).

## Item 2 — Store Vuex `logistics.js`

`frontend/src/store/modules/logistics.js`

1. `loadStock` (`:210-236`) : signature inchangée, `configId` peut désormais valoir `'all'` — pas
   de changement de code, juste s'assurer que `getLogisticsStock(spaceId, configId, eventId)`
   (`api/endpoints/logistics.api.js:17`) transmet la string sans la transformer.
2. `SET_STOCK` (mutation appelée `:218-227`) : `resolvedConfigId: data?.resolvedConfigId || null`
   — `'all'` est une string truthy, passe déjà tel quel, aucun changement nécessaire.
3. `state.elements` (`:60`) : le commentaire de shape (`{ id, name, type, items }`) doit être mis à
   jour pour documenter le nouveau champ optionnel `configIds?: string[]`.
4. **Pas de nouvelle action** — la vue « By Item » (Item 5) consomme `state.elements` +
   `state.levels` tel quel, en computed local au nouveau composant.

## Item 3 — `LogisticConfigSelect.vue` (nouveau composant)

`frontend/src/components/LogisticConfigSelect.vue` — nouveau fichier, `<script setup>`, calqué
visuellement sur la maquette B (pilule blanche translucide sous le titre « Logistic », menu
déroulant ancré dessous).

- **Props** : `configurations: Array` (state.logistics.configurations, configs réelles
  uniquement), `modelValue: String` (id de config ou `'all'`), `loading: Boolean`.
- **Emits** : `update:modelValue`.
- Construit en interne la liste d'options `[{ id: 'all', name: t('logiConfigAll') }, ...configurations]`
  — même pattern que `configurationItems` dans `analyse/filters/FilterPanel.vue:813-821`, mais un
  composant dédié ici (pas un `v-select` Vuetify — le style pilule rouge du header ne passe pas
  par un input Vuetify standard, cf. CSS `.lg-config-select`/`.lg-cfg-menu` de la maquette).
- Affiche sous chaque option un sous-texte (« 4 PDV », etc.) — nécessite que `configurations[]`
  porte un compte de PDV ; **à vérifier à l'implémentation** si le backend le fournit déjà (pas
  trouvé dans cette recherche) ou s'il faut le dériver côté front à partir de `state.elements`
  (uniquement calculable une fois la config sélectionnée et chargée — sinon compte indisponible
  pour les configs non actives). Si non disponible sans coût, dégrader gracieusement : afficher le
  nom seul, sans compte, plutôt qu'inventer un chiffre.

## Item 4 — `SpaceLogisticView.vue` : intégration

`frontend/src/views/SpaceLogisticView.vue`

1. **`TABS`** (`:471-474`) : ajouter une 3ᵉ entrée
   `{ value: 'byItem', labelKey: 'logiTabByItem', icon: 'mdi-view-list' }`.
2. **`currentEntries`** (`:668-670`) : ne change pas — le tab `byItem` ne produit pas des
   « entries » de type élément, il bascule vers un rendu différent. Dans le template, la section
   `<!-- NIVEAU 1 : liste des PDV / Storage -->` (`:288-328`) doit devenir conditionnelle sur
   `activeTab !== 'byItem'`, avec un nouveau bloc `v-else-if="activeTab === 'byItem'"` qui monte
   `<LogisticByItemView>` (Item 5).
3. **Défaut agrégé** — `routeContextKey` (`:723-726`) et `loadForSpace` (`:883-892`) : remplacer
   ```js
   const configId = this.route?.query?.configuration || this.route?.query?.config || null
   ```
   par
   ```js
   const configId = this.route?.query?.configuration || this.route?.query?.config || 'all'
   ```
   dans les deux endroits (`:724` et `:889`) — c'est LE changement qui bascule le défaut de
   « 1ʳᵉ config silencieuse » à « toutes les configs ». `refresh()` (`:968-972`) utilise déjà
   `this.selectedConfigId` (résolu par le store), pas la query — aucun changement là.
4. **Header** (`:190-198`) : remplacer le `<p class="lg-header__subtitle">` (texte statique
   `activeConfigName`) par `<LogisticConfigSelect :configurations="configurations" v-model="selectedConfigIdInput" :loading="loading || stockLoading" />`.
   `selectedConfigIdInput` = nouveau computed writable (get depuis `selectedConfigId`/store, set
   qui (a) dispatch `logistics/loadStock` avec le nouveau `configId`, (b) met à jour la query route
   (`router.replace({ query: { ...route.query, configuration: newId } })`) pour rester
   deep-linkable — remplace l'ancien deep-link invisible par un deep-link piloté par l'UI.
5. **Tag config par ligne** — dans la boucle `<LogisticElementRow>` (`:314-327`), passer une
   nouvelle prop `:config-tags="configNamesFor(entry.element)"` où `configNamesFor` est une
   méthode qui mappe `entry.element.configIds` (Item 1) vers les noms via `this.configurations`.
   `LogisticElementRow.vue` : ajouter la prop `configTags: { type: Array, default: () => [] }`,
   rendue comme chip(s) `.lg-cfg-tag` (voir CSS maquette) juste après le badge de statut existant
   dans `.lg-row-name` (`LogisticElementRow.vue:5-13`) — additif, n'affecte pas le rendu quand le
   tableau est vide (mode single-config).
6. **QA gating (question 57, tranchée — option a)** — désactiver les boutons « Simulate a sale » /
   « Reset inventory » (`:210-231`) quand `selectedConfigId === 'all'`, avec un tooltip explicite
   (nouvelle clé i18n `logiQaDisabledAggregate`). Ne pas les cacher : l'utilisateur doit comprendre
   qu'il doit choisir une config précise, pas croire que la fonctionnalité a disparu.

## Item 5 — `LogisticByItemView.vue` (nouveau composant)

`frontend/src/components/LogisticByItemView.vue` — nouveau fichier, généralise
`LogisticAggregateView.vue` (garder ce dernier intact, c'est le panneau « Restock alerts », un
besoin différent : alertes seulement, colonne étroite, toujours visible).

- **Props** : `elements: Array` (shops + storages combinés — `state.elements` complet ; question 58
  tranchée, les deux types sont inclus, même périmètre que les onglets F&amp;B Shops/Storage
  existants), `levels`, `consumption`
  (pour dériver le statut par élément×item — réutiliser la méthode `itemStatus(elementId, item)`
  déjà présente dans `SpaceLogisticView.vue` — **localiser sa définition exacte au moment du
  code**, non trouvée dans cette passe de recherche, mais son usage est visible au template
  `:345`), `itemKindFilter` (filtre « Item Type » déjà existant, panneau de gauche), `search`.
- **Structure** : reprend le pattern carte-accordéon de `LogisticAggregateView.vue` (`:39-97`,
  classes `.lg-agg-group-card`/`.lg-agg-group-trigger`/`.lg-agg-group-detail`) mais :
  - groupe **tous** les items (pas de filtre bad/warn en amont comme `groupedItems`, `:143-165`
    du fichier existant) ;
  - badge de synthèse par carte = 4 compteurs (rupture/stock bas/OK/jamais compté), pas 2 ;
  - le détail dépliable liste TOUS les éléments qui portent l'article (pas seulement ceux en
    alerte), avec statut complet par ligne et tag de config (`element.configIds`, Item 1) —
    conforme à l'artboard C validé.
- **Émission** : même contrat `@go="{ elementId, itemName }"` que `LogisticAggregateView.vue`
  (`:82`) pour réutiliser `goToItem` déjà câblé côté `SpaceLogisticView.vue`.
- Respecte le filtre « Item Type » du panneau gauche existant (`itemKindFilter`,
  `SpaceLogisticView.vue:79-107`) — pas de nouveau panneau de filtres, on branche juste ce
  composant sur l'état de filtre déjà là.

## Item 6 — i18n

`frontend/src/i18n/translations.js` — insérer juste après la ligne **2912** (fin du bloc EN
Logistic) et juste après la ligne **7363** (fin du bloc FR Logistic), pour rester dans la section
existante et garder EN/FR au même offset relatif.

Nouvelles clés (réutiliser l'existant dès que possible — `logiPackedShort`, `logiLooseShort`,
`logiAggStatRuptures`, `logiAggStatLow` sont déjà là et directement réutilisables dans le nouveau
composant) :

| Clé | EN | FR |
|---|---|---|
| `logiConfigAll` | All configurations | Toutes les configurations |
| `logiConfigAllMeta` | Aggregated · {count} configurations | Agrégation · {count} configurations |
| `logiConfigSelectLabel` | Configuration | Configuration |
| `logiTabByItem` | By Item | By Item |
| `logiByItemSearchPlaceholder` | Search an item... | Rechercher un article... |
| `logiByItemShopsSuffix` | locations | PDV concernés |
| `logiByItemStatusOk` | OK | OK |
| `logiByItemStatusNeverCounted` | Never counted | Jamais compté |
| `logiRowConfigTagMore` | +{count} more | +{count} autres |
| `logiQaDisabledAggregate` | Pick a single configuration to use this action | Choisissez une configuration unique pour utiliser cette action |

## Fichiers critiques

- `backend/src/features/logistics/logistics.service.ts` — `:33` (`SHOP_TYPES`), `:777-784`
  (`resolveElementConfigId`), `:1019-1121` (`getSpaceElementsWithItems`), `:1248-1338`/`:1274-1281`
  (`getStock`/`resolvedConfigId`)
- `backend/src/features/logistics/logistics.controller.ts` — endpoint `GET :spaceId/stock`
  (`:34`, `:42-50`)
- `frontend/src/store/modules/logistics.js` — `state` (`:55-83`), `loadStock` (`:210-236`),
  getters `shopElements`/`storageElements` (`:87-88`)
- `frontend/src/views/SpaceLogisticView.vue` — `activeConfigName` (`:614-619`), `TABS`/
  `ITEM_KIND_OPTIONS` (`:471-481`), `routeContextKey` (`:723-726`), `loadForSpace` (`:883-892`),
  `refresh` (`:968-972`), template header (`:170-234`), template tabs (`:245-258`), template
  liste (`:288-328`), CSS (`:1253-1691`)
- `frontend/src/components/LogisticElementRow.vue` — carte PDV, ajout prop `configTags`
- `frontend/src/components/LogisticAggregateView.vue` — référence de pattern carte-accordéon,
  **ne pas modifier**, `LogisticByItemView.vue` est un composant frère, pas une extension
- `frontend/src/api/endpoints/logistics.api.js` — `:17` (`getLogisticsStock`)
- `frontend/src/i18n/translations.js` — bloc EN `:2155-2912`, bloc FR `:6623-7363`
- Pattern de référence pour l'agrégation multi-config (approche différente, par nom, à ne PAS
  copier telle quelle ici) : `frontend/src/store/modules/analyse.js:2195-2284`
  (`loadAllConfigsShopContext`) + `frontend/src/components/analyse/filters/FilterPanel.vue:813-831`
  (sélecteur « All Configurations »)

## Vérification

1. Ouvrir `/spaces/:id/logistic` **sans** query `?configuration=` → doit charger en mode agrégé
   (tag « Toutes les configurations » dans le sélecteur), pas la 1ʳᵉ config silencieuse.
2. Sélecteur : ouvrir le menu, choisir une config précise → la liste PDV se refiltre, l'URL se met
   à jour (`?configuration=<id>`), rechargement de la page sur cette URL reste sur la même config
   (deep-link fonctionnel).
3. Tag de config sur les lignes PDV : un PDV présent dans plusieurs configs affiche bien tous les
   noms ; un PDV mono-config n'affiche pas de tag superflu (ou un tag à 1 seul nom, à trancher
   visuellement à l'implémentation en cohérence avec la maquette D qui n'en montre aucun).
4. Tab « By Item » : tous les articles apparaissent (pas seulement les ruptures), filtre Item Type
   fonctionnel, une carte dépliée montre tous les PDV avec statut complet (rupture/stock
   bas/OK/jamais compté) et tag de config.
5. QA (Simulate a sale / Reset inventory) désactivés en mode agrégé avec tooltip explicite
   (question 57) — vérifier qu'ils se réactivent bien après sélection d'une config précise.
6. Non-régression : drill-in (grille de cartes-articles), `LogisticMovementDialog`,
   `LogisticTransferConfirmDrawer`, réconciliation, pertes — strictement inchangés en mode
   single-config.
7. Dark mode : nouveau sélecteur et nouvelle vue « By Item » lisibles (cf. règles `--lg-*` déjà en
   place, `SpaceLogisticView.vue:1682-1691`).
8. `pnpm test:unit` — vérifier la baseline d'échecs préexistants avant/après (ne pas introduire de
   régression, ne pas corriger des échecs préexistants hors scope de ce chantier).
