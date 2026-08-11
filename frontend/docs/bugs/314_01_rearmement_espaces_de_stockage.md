# BUG-314-01 — Réarmement : onglet « Espaces de stockage » (stock tampon 3D Builder), Item Supplier Name + édition Market Price

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur (feature spec PDF « Réarmement - Stockage », 08/2026)
- **Domaine** : Stock (Réarmement) / Espaces & builder / Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul — RestockState/RestockPlan sont des
  blobs jsonb opaques, `ElementInventory` porte déjà quantity/minStock/maxStock : **aucune
  migration, aucun changement backend**)
- **Découvert le** : 2026-08-11 (spec PDF « Réarmement - Stockage », JLH)
- **Fichiers** : `src/views/SpaceRestockView.vue` (étape 1, netting, styles),
  `src/store/modules/storageInventory.js` (nouveau), `src/composables/useStorageInventory.js`
  (nouveau), `src/api/endpoints/restock.api.js` (extras `storageAdjustments`),
  `src/store/index.js`, `src/i18n/translations.js`

## Symptôme

Le réarmement ne savait remplir que les points de vente : le stock des espaces de stockage
(réserve centrale) était consommé par le netting de la feuille de course (`stockNetting.js`)
mais jamais **réapprovisionné**. Le stock tampon saisi dans la section Inventaire du 3D Builder
(`ElementInventory.quantity`, avec seuils `minStock`/`maxStock`) n'était lu nulle part côté
réarmement, et le fournisseur d'un article n'apparaissait qu'à l'étape 3 (groupes feuille de
course), sans nom sur les lignes de l'étape 1 ni moyen de corriger un Market Price sans quitter
l'écran.

## Décisions produit (JLH, 2026-08-11)

- Stock tampon = `ElementInventory.quantity` existant ; `minStock`/`maxStock` = seuils d'alerte.
- Alertes = badges/bandeaux front dans l'onglet storage (pas de backend notifications, phase
  ultérieure).
- Édition du tampon : **dans le Builder uniquement** (le `PUT /builder-v2/elements/:id/inventory`
  est full-replace — lecture seule côté Restock).

## Correction

**B1 — Onglets étape 1** : segmented control « PDV à stocker » / « Espaces de stockage »
(`stockTab`, pattern `.sr-inline-btn`, pas de `v-tabs`) ; le footer wizard (pagination +
« Générer le réarmement ») reste hors des onglets, la pagination n'apparaît que côté PDV.

**B2 — Données + lignes storage** : nouveau store `storageInventory` (pattern standard TTL
15 min, single-flight, projection LÉGÈRE du `GET /builder-v2/spaces/:id/state` : id/name/type/
`inventoryByConfig` par élément) + composable `useStorageInventory`. Dans SpaceRestockView,
computed `storageRestockGroups` : un groupe par élément Storage des configs objectif (même
source `collectStorageElements` que le pool de netting), lignes = inventaire Builder de la
config (repli clé `''`), avec **Tampon** = `quantity`, **Restant** = comptages agrégés de
l'élément (`aggregateCountsForElements`, identité id puis nom — cascade BUG-299-01),
**Nécessaire** = `max(0, tampon − restant)` par défaut, override slider **absolu** plafonné à
**5× le tampon** (spec), **À commander** = conversion packs existante (`packagingForItem` +
rendu façon `buyInfo`). Overrides `storageAdjustments{}` (clé
`storage:${elementId}:${normalizeStr(name)}`) persistés dans RestockState (extras du PUT,
rétro-compat whitelist) + restaurés au chargement.

**B3 — Seuils (front only)** : `restant ≥ 0,9 × maxStock` → « 90 % de la capacité de stockage
atteint » ; `restant ≤ 1,1 × minStock` → « Ré-approvisionnement à considérer en priorité »
(prioritaire visuellement) ; compteur d'alertes en badge sur l'onglet.

**B4 — Item Supplier Name** : computed mémoïsée `supplierInfoByItem` (page courante, pattern
`buyInfoByItem`) — cascade `findStockReference` → `marketPriceId` → `marketPrices` →
`supplierId`/nom (mêmes règles que `resolveIngredientSupplier`). Chip fournisseur + crayon sous
le nom d'article ; édition via le drawer **réutilisé** `MarketPriceEditSupplierDrawer`
(item = row = ligne MarketPrice brute du store inventory), gaté par la permission
`menu.fb.marketPrices` ; au save : `inventory/invalidateMarketPrices` + rechargement.

**B5 — Feuille de course** : computed `storageRefillLines` (lignes nécessaires > 0, fournisseur
résolu) injectée dans `nettedShopping` **APRÈS** `consumeFromPool` — demande ADDITIVE, upsert
par groupe fournisseur (cumul si l'article est déjà acheté pour les PDV, sinon nouvelle ligne
`fromStorage: true`, nom de la réserve dans `shopNames`). Le nécessaire se calcule sur le
restant **BRUT** (spec PDF) : le stock storage « prêté » aux PDV par le netting n'est pas
racheté automatiquement — règle ambiguë consignée en **question no 54** de
`QUESTIONS_A_BERTRAND.md`. Un plan sauvegardé APRÈS la feature fige ces lignes dans sa photo
(`liveShoppingGroups` → `buildPlanSnapshot`) ; un plan antérieur rejoue sa photo sans lignes
storage (comportement inchangé).

**Non fait (assumé)** : onglet storage en mode « plan chargé » (les lignes storage d'un plan
figé ne sont pas ré-affichées dans l'onglet, seulement dans la photo de l'étape 3) ; vraies
notifications (cloche) ; édition du tampon depuis Restock.

## Correctifs post-test JLH (2026-08-11, même session)

1. **Drawer fournisseur affichait l'id brut** (`cmpa2xuy…` dans le select Supplier) : le
   catalogue `/suppliers` (`bomSuppliers`) n'était chargé qu'à la génération de la feuille de
   course (`ensureRecipesLoaded`) — jamais à l'étape 1. Loader extrait en
   `ensureBomSuppliers()`, appelé au `loadAll()` (chips) et **attendu** dans
   `openSupplierEdit()` avant l'ouverture (le drawer copie ses props à l'ouverture). Options
   Good Type / Good Category également passées (stores `marketPriceTypes`/`productCategories`,
   fetch attendu avant ouverture — cache TTL, coût nul dès la 2e fois).
2. **« Aucun espace de stockage » alors que 2 storages existent (Auxerre, config principale)** :
   la découverte reposait sur `collectStorageElements` seul, qui exige `el.type === 'storage'`
   STRICT dans le blob de config — les éléments builder v2 portent des types non normalisés
   (`Storage`, code département…) → 0 groupe. Nouvelle computed `storageDisplayElements` :
   UNION du chemin blob (inchangé) et du builder state (`normalizeType(type) === 'storage'` +
   adhésion aux configs objectif via `memberships`, projetées dans le store
   `storageInventory` ; adhésions inconnues = inclus ; si le filtre d'adhésion élimine tout —
   id config v1 ≠ id builder — repli sur tous les storages de l'espace). Lecture des lignes
   d'inventaire tolérante (`pickInventoryRows` : configs objectif → clé `''` → unique config
   porteuse). Tous les groupes sont rendus, un storage sans tampon affiche `srStorageNoBuffer`
   au lieu de disparaître. ⚠️ Le chemin blob strict reste utilisé par `storageElementIds`
   (pool de netting) — dette préexistante, non touchée ici : si le pool est vide sur des
   configs v2, même cause.

## Risque de régression / à surveiller

- **Netting étape 3** : cas témoin — tampon 100, restant storage 40, besoin PDV 50, stock
  storage 40 → achat PDV = 10, ligne refill storage = 60, total acheté 70. Jamais d'injection
  AVANT `consumeFromPool` (double comptage).
- **Plans figés** : recharger un ancien plan → étape 3 strictement identique à avant la feature
  (`recomputeShoppingFromOverrides` ne passe pas par `nettedShopping`).
- **Onglet PDV** : sliders %, presets 80/100/120, pagination, génération — inchangés ; la
  colonne « À commander » (`stockOrderByItem`/`orderQuantitiesByItemKey`) est intouchée.
- **Perf** : le builder state complet est fetché 1×/15 min (projection légère en store) — à
  observer sur les gros espaces ; option de repli notée (GET inventaire par élément).
- **Matching nom** : `ElementInventory` est keyé nom (+ `menuItemId` optionnel), les comptages
  par itemId — homonymes possibles, cascade id-d'abord réutilisée (BUG-299-01).
- **Drawer Market Price** : conçu pour l'écran Market Prices — vérifier son hydratation hors de
  cette page (repli prévu : mini-drawer `updateMarketPrice` seul si problème).

## Références

- Spec : PDF « Réarmement - Stockage » (2 pages, 08/2026) — onglets, stock tampon 3D Builder,
  slider 5×, notifications seuils, Item Supplier Name + Edit.
- Question métier : `docs/QUESTIONS_A_BERTRAND.md` no 54 (netting refill : restant brut vs
  post-consommation du pool).
- Feature sœur : fiche 313-01 (kebab article EventPredict). Netting existant : BUG-299-01,
  question 13 (composants non décomposés).
- Backend vérifié : `ElementInventory` (schema.prisma), `restock-state.controller.ts` (blob
  opaque), `builder-v2.service.ts` (inventoryByConfig).

— JLH
