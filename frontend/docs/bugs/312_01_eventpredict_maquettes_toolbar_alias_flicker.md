# ÉVOL-312-01 — Event Predict : maquettes 08/2026 (toolbar 2 lignes, alias historique, flicker, auto-sélection)

- **Statut** : 🟡 Implémenté non déployé (migration SQL à appliquer manuellement AVANT déploiement)
- **Type** : évolution (maquettes validées) + 2 correctifs de comportement + 2 gaps 311_02
- **Domaine** : Event Predict (+ Réappro pour les gaps), Analyse (fix flicker uniquement)
- **Repo(s) concerné(s)** : `datafriday-frontend-backend/frontend` **et** `backend` (nouvelle table + CRUD)
- **Source** : artifact « Maquettes — Event Predict (UI proposée) », décisions JLH 2026-08-11
  (une seule branche feature ; alias partout dans EP ; chips + action historique dans les 2 vues)
- **Branche** : `feat/event-predict-maquettes` (base : `fix/bug-290-01…` + merge `origin/develop`)

## En clair

Quatre changements visibles et deux invisibles. 1) La barre d'outils de la page Event Predict
devient plus compacte et gagne deux filtres « Article sans prévision » / « Article hors Space
Menu » avec compteurs globaux : un clic ne montre plus que les cartes concernées, ouvertes sur la
bonne catégorie. 2) La saisie manuelle de quantité existait déjà (fiches 311_01/311_02) — on a
bouché deux trous côté Réappro. 3) Nouveau : « Utiliser l'historique d'un autre article » — quand
un article a changé de nom/marque d'une saison à l'autre, on dit au système « ce nouvel article
reprend les ventes passées de l'ancien » via un tiroir dédié ; les prévisions apparaissent
aussitôt, sans toucher à la page Analyse. 4) La ligne mappée porte un badge « historique
emprunté ». Invisibles : le clignotement au basculement Analyse ↔ Prévu est supprimé, et un
article réactivé au menu depuis le kebab ressort bien coché.

## Chantiers et fichiers

### A — Fix flicker Analyse ↔ Prévu (3 suppressions)
- `src/components/analyse/AnalyseView.vue` : `onToolboxChange`/`closePredictOverlay` committent
  `SET_TOOLBOX` en direct (suppression du double `requestAnimationFrame`+`setTimeout`) ; appels
  `showTransitionLoader` supprimés (bascule toolbox = query-only, l'overlay n'a jamais couvert le
  retour) ; `toolboxLabel`/`showTransitionLoader` mortes supprimées. La navigation de ROUTE réelle
  garde son overlay (watcher `$route` de `RouteTransitionLoader`).
- `src/components/RouteTransitionLoader.vue` : canal externe `datafriday:route-loader` supprimé
  (plus aucun dispatcheur). Timer 2 s conservé pour les vraies routes.
- `src/components/EventPredictView.vue` : `loading` (skeleton plein écran) ne se latch plus quand
  le store est chaud (`events` + `configurations` présents) — le composant est détruit/recréé à
  chaque bascule (v-if côté AnalyseView) et re-flashait son skeleton sur des données déjà là.

### B — Auto-sélection à la réactivation
- Cause : `mergeEffectiveMenuConfig` fait gagner la clé explicite `eventMenuConfig` → le refetch
  Space Menus ne recoche jamais un article réactivé si l'utilisateur a déjà touché ce PDV.
- `src/utils/menuConfigSelection.js` : nouvelle fonction pure `applyAssignToExplicit` (n'agit que
  si la clé shop est présente dans l'explicite).
- `EventPredictView.handleAssignShopItem` : après POST réussi, répercute l'assignation dans
  `eventMenuConfig` (elementId destructuré du payload).

### C — Gaps 311_02 (saisie manuelle, chantier 2 des maquettes déjà livré)
- `src/views/SpaceRestockView.vue:mapBddVersion` : `manualQuantities` lit la **colonne BDD**
  d'abord (miroir localStorage en repli) — le commentaire « non stocké en BDD » était périmé
  (migration 20260625) ; cross-device réparé.
- `EventPredictView.buildPredictedRecords` : recopie `isManual: true` sur les records manuels →
  le chemin Réappro « predictedRecords BDD » ne ré-applique plus le % (`isManualOnlyForElement`).

### D — Toolbar 2 lignes + chips globaux (2 vues)
- `EventPredictView.vue` : tabs sections `min-width` 190→120 px, padding 18→12 ; toggle
  Par PDV / Par article en **icônes seules** (libellés en title/aria-label).
- `EventPredictMenusSection.vue` : recherche `max-width` 520→340 px ; 2 chips-toggle
  `.ep-chip-filter` (état `globalChipFilter`, un seul actif, reset au changement d'onglet/vue) ;
  **compteurs DYNAMIQUES « reste à traiter »** (retour JLH sur 1re version) : une ligne « sans
  vente prévue » sort du compteur dès que `getAdjustedQuantity > 0` (quantité manuelle posée) —
  le bucket, lui, ne bouge pas ; mémo `chipCountsByElement` (1 passe) ; vue article : entrées
  `_mapGroup === 'unmapped'` / `shops.every(adjustedQty === 0)` ; filtrage des cartes dans
  `filteredElementsByTypeEntries` et des entrées dans `filteredMenuItemsForItemView` (même
  critère dynamique) ; à l'activation en vue PDV, `setShopTab(el.id, kind)` bascule le bucket
  des cartes retenues. Style aligné DS (retour JLH) : pilule 38 px comme la recherche et les
  tabs (`--fb-subtle`/`--fb-border`), actif = accent produit (`--fb-primary-soft`/#ff3131,
  comme `.ep-remap-btn`), le point coloré porte seul la sémantique.
- i18n : `epmChipNoForecast(+Hint)` « Encore sans vente prévue » / `epmChipOutsideMenu(+Hint)`
  « Vendus hors Space Menu » (EN+FR, vocabulaire aligné sur les buckets, hints expliquant le
  décrément).

### E — Alias historique : backend
- `backend/prisma/schema.prisma` : modèle **`MenuItemHistoryAlias`** (tenantId, spaceId,
  sourceMenuItemId?, sourceName, targetMenuItemId, `@@unique([tenantId, spaceId, sourceName])`,
  sans FK — zone KV).
- **Migration `backend/prisma/migrations/20260811090000_add_menu_item_history_alias/migration.sql`
  — À APPLIQUER MANUELLEMENT (ADR-0002) AVANT déploiement, sinon 500 P2021.** Zéro backtick.
- `backend/src/features/history-aliases/` : DTO + service (list/create upsert avec vérif
  ownership space + MenuItem du tenant, garde-fou anti-chaîne A→B→C, remove avec ownership) +
  contrôleur `GET|POST|DELETE /menu-item-history-aliases` (`menu.events.manage`) + module,
  enregistré dans `app.module.ts`.
- Frontend : `src/api/endpoints/historyAliases.api.js`, store réactif
  `src/store/modules/historyAliases.js` (fetchForSpace TTL 15 min, createAlias/removeAlias avec
  MAJ locale sans refetch, 404 backend → liste vide silencieuse), enregistré dans `store/index.js`.

### F — Alias historique : résolution + drawer + kebab
- `src/utils/historyAliases.js` : `applyHistoryAliases(records, aliases, targetNameById)` —
  match id (`menuItemId || mappedMenuItemId`) prioritaire puis nom minuscules (conventions
  `buildTimelineQuantityIndex`), réécrit id + nom vers la cible, `_aliasSourceName` en trace,
  **stabilité référentielle** (sans alias/match → même tableau). + `buildAliasLookup`,
  `aliasSourceByTargetId`.
- **Injection au point unique** `EventPredictView.activeTimelineData` (l'ancien corps devient
  `rawActiveTimelineData`) : tout l'aval (index de quantités → buckets, CA ajusté, stock-up,
  `buildPredictedRecords` → Réappro cross-device) voit l'article cible sans autre modification.
  S'applique aux events passés ET futurs dans EP. **La page Analyse ne lit jamais cette donnée**
  (aucune jointure backend Analyse touchée) — contrainte « Analyse non modifiée » structurelle.
- Fetch des alias dans `loadAll` (fire-and-forget, réactif).
- `src/components/EventPredictRowActions.vue` : props `allowHistory` (entrée
  « Utiliser l'historique d'un autre article », emit `use-history`) et `historyOnly` (lignes
  « sans ventes prévues » : masque Remapper/Ajouter, sans objet sur un article déjà actif).
- `EventPredictMenusSection.vue` : kebab historique sur les lignes `unmapped` ET `noSales`
  (prédit 0, ni fantôme ni indisponible), **vue PDV et vue article** ; emit
  `history-alias-request {shopName, elementId, item}`.
- `src/components/EventPredictHistoryAliasDrawer.vue` (nouveau, shell `EventDrawerShell`) :
  source = items distincts de la timeline **brute** (volume + prix moyen, suggestion
  `findBestMatch` par nom seul — le filtre dur prix <1 centime est inadapté aux « prix
  proches ») ; cible pré-remplie (catalogue espace) ; liste des alias de l'espace supprimables
  (retour arrière immédiat) ; « Mapper & recalculer » → `createAlias` → recalcul par computeds,
  zéro refetch timeline.
- i18n : `epraUseHistory`, famille `epha*` (EN+FR).

### G — Badge « historique emprunté »
- `EventPredictMenusSection.vue` : computed `aliasSourceByTarget` (prop `historyAliases` passée
  par le parent) ; badge `.ep-map-badge--history` (vert succès + variante `.dark`) sur le titre
  de ligne vue PDV et le titre de carte vue article, title = nom de la source.
- i18n : `epmHistoryBadge`, `epmHistoryTitle` (EN+FR).

## Sémantique de l'alias (décisions)

- Portée **espace** (toutes configs, tous events EP) ; unicité par source (`sourceName`) —
  re-mapper = upsert ; chaînes A→B→C interdites (400 backend).
- L'alias **déplace** tout l'historique de la source (la ligne source disparaît d'« hors menu »,
  sa quantité prédite tombant à 0) ; il ne modifie aucun volume.
- Source + cible déjà vendue : les 2 records fusionnent sous la clé cible — l'indexation somme,
  la lecture multi-clés prend le MAX (BUG-290-01) → 20 + 78 = 98, jamais 196 (testé).
- La quantité manuelle éventuelle de la cible s'efface au profit du prédit
  (`predictedItemKeySet` saute les clés couvertes).

## Tests

- `tests/unit/historyAliases.spec.js` (nouveau, 10 cas) : match id/nom, priorité id, stabilité
  référentielle, non-match intact, fusion source+cible via l'index réel.
- `tests/unit/menuConfigSelection.spec.js` (+8 cas `applyAssignToExplicit`).
- `backend/src/features/history-aliases/history-aliases.service.spec.ts` (nouveau, 10 cas,
  PrismaService mocké) : ownership tenant sur space/cible/suppression, sourceName vide,
  garde anti-chaîne (2 sens), clé d'upsert trimée, scoping du list. Vert 10/10
  (après `npx prisma generate` — requis en local après la modif du schema).
- **Suite Jest frontend complète (2026-08-11) : 1007 verts / 1011, 4 échecs dans 3 suites
  (`apiOrMock`, `spaceMenusInventory`, `eventDetailsEditor` — erreurs de parse) PROUVÉS
  préexistants : mêmes échecs sur l'arbre nettoyé (stash) au commit de merge develop.**
  Build : JLH.

## Vérification manuelle (à dérouler en staging)

1. Aller-retour Analyse ↔ Event Predict ×5 (froid puis chaud, clair + sombre) : plus de voile
   2 s ni de flash skeleton ; back/forward `?toolbox=` OK ; une navigation de route réelle
   (ex. /spaces → space) garde son overlay.
2. Chips : compteurs = somme des badges par carte ; chip actif → cartes filtrées + bucket
   basculé ; interaction avec recherche et Ouverts/Fermés ; ≤900 px (chips passent dessous).
3. Kebab « Réactiver au menu » sur un PDV déjà touché → l'article ressort coché.
4. Drawer : mapper une source → la ligne migre en « Ventes prévues » + badge + CA ajusté +
   stock-up alimenté sur la recette de la cible ; supprimer l'alias → retour arrière immédiat.
5. Sauver la version → Réappro sur un autre navigateur : `manualQuantities` présents (BDD),
   quantités NON re-scalées par le % (isManual).
6. **Page Analyse strictement identique avant/après création d'alias** (même dataset, mêmes KPI).

## Réserves / questions

- `totalCost` (batch) vs `costPerPiece` : réserve #53 de QUESTIONS_A_BERTRAND (préexistante,
  non bloquante ici).
- Suggestion du drawer : nom seul (pas de pondération prix) — assumé, cf. F.

— JLH, 2026-08-11
