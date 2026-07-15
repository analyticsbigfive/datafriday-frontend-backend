# Pépites extraites des archives (`trash/`)

> Extrait le 2026-07-15, avant suppression définitive de `docs/trash/`.
> Chaque section vient d'un document one-shot (brief, plan, diagnostic) désormais périmé,
> mais contenait une règle métier, une formule ou une décision d'architecture **encore vraie en prod**.
> La source d'origine est citée à chaque fois.
>
> ⚠️ Pour l'algorithme de prédiction complet, la source de vérité reste
> `ALGORITHME_PREDICTION_NEW_RULES.md` (dans ce même dossier). Rien ici ne le remplace.

---

## 1. Prévision (Event Predict)

### 1.1 Poids de scoring figés (« mandatory user »)

*Source : `PORTING_PROGRESS.md` §7 — à recouper avec `ALGORITHME_PREDICTION_NEW_RULES.md` qui fait foi.*

| Critère | Poids | Règle |
|---|---|---|
| Event Type | 100 | Hard filter (exclusion si mismatch) |
| Event Category | 100 | Hard filter |
| Subcategory | 800 | Exact match seulement |
| Visiting Team (sports) | 800 | Exact match |
| Performer (concerts) | 800 | Exact match |
| Sponsor (MICE) | 400 | Exact match |
| Attendance | 200 | Exclu si > 40 % diff. Score = `(1 - diff%) × 200` |
| Day of Week (Sun-Thu) | 500 | 500 exact, 250 autre weekday, 0 weekend |
| Weekend Day (Fri-Sat) | 500 | 500 exact, 250 autre weekend, 0 weekday |
| Show Time | 400 | Exclu > 3 h. 400 exact, 300 ≤ 1 h, 100 ≤ 2 h, 0 ≤ 3 h |

Méthode : filtrer les past events (hard filters) → top 10 par score (sinon fallback 3 random
low-confidence) → scaling `target.attendance / past.attendance` → pour chaque item × shop :
`Σ (past_value × scaling × score/totalScore)` → arrondi qty + revenue à l'entier.

L'équipe à domicile n'est **volontairement pas scorée** : seule `visitingTeam` compte (poids 800).

### 1.2 Règles Space Menu ↔ Event Predict

*Source : `PLAN_EVENTPREDICT_SPACE_MENU_SELECTION.md` (plan implémenté le 2026-07-08).*

- **Source de vérité = Space Menu enabled.** La checkbox d'un item est l'**unique gate du CA ajusté**.
- Attaché + enabled ⇒ coché par défaut (`derivedMenuConfigFromRecords`).
- Shop fermé (`menuItemsCount = 0`) ⇒ brut 0, ajusté 0, exclu des totaux.
- **Sémantique `effectiveMenuConfig`** : une clé **présente** dans `eventMenuConfig` avec la valeur `[]`
  est une **intention réelle** de l'utilisateur (tout décoché) — jamais un défaut corrompu.
  Le fallback vers les items dérivés ne s'applique que si la clé est **absente**.
  (`derivedMenuConfigFromRecords` ne produit jamais `sid: []` : clé absente = 0 item dérivé.)
- `totalPredictedRevenue` = somme de tous les items prédits sur shops ouverts ;
  `totalAdjustedRevenue` = somme des items **cochés** seulement (+ quantités manuelles).
- Catégories affichées = **vraie `ProductCategory.name`** (même source qu'Analyse), fallback
  « Aucune catégorie ». `Food/Beverage/Combo` n'est plus un filtre visible (usage interne shopType).
- **Risque résiduel connu** : `onMenuConfigChange` fige TOUS les shops dans l'explicite au premier
  toggle ; un changement ultérieur d'assignation Space Menu d'un shop non touché ne se reflète plus
  automatiquement. Symptôme futur possible : « Space Menu changé mais Event Predict pas à jour ».
- **Point ouvert non tranché** : les pills CA par shop (`shopRevenues` = catalogue × qty × `htUnitPrice`)
  et le total sidebar (`timelineRevenueTotals` = timeline × prix Weezevent) sont deux chemins de calcul
  indépendants — vérifier sur données réelles qu'ils se recoupent.

### 1.3 Persistance des versions de prévision

*Sources : `eventPredictVersions-manualQuantities-backend.md`, `eventPredictVersions.api.md`.*

Colonnes JSON de `EventPredictVersion` :

```ts
manualQuantities: Record<string, number>
// clé = `${elementId}-${menuItemId}` ; valeur = unités absolues (entier ≥ 0) ; défaut {}
// Raison d'être : pour un item à prédiction 0, le % est inopérant (0 × % = 0)
// → quantité absolue saisie au slider.

predictedRecords: Array<{
  shopId: string; shop: string | null;
  menuItemId: string; mappedMenuItemId: string | null; itemName: string | null;
  totalQuantity: number;  // unités prédites (somme timeline)
  totalRevenue: number;   // CA prédit correspondant
}>  // 1 entrée par shopId|menuItemId ; défaut []
```

- **Règle réarmement cross-device** : l'étape Stock du réarmement dépend de `predictedRecords`
  persistés en BDD. Sans eux (autre navigateur/device, cache vidé), la reconstruction de secours
  est shop-level **sans `menuItemId` → quantités à 0**.
- **Version par défaut exclusive** : `PUT /events/{eventId}/predict-versions/default` en transaction
  *unset all → set one* ; une seule `isDefault=true` par event ; `versionId=null` retire le défaut ;
  supprimer la version par défaut ne réaffecte pas automatiquement.
- **Piège historique** : une route inconnue qui répond 200 au lieu de 404 = faux succès silencieux
  (l'ancien KV Supabase renvoyait 404 → scénarios jamais sauvegardés).

### 1.4 Chaîne prix / coût / marge

*Source : `brief-dev-eventpredict.md` §3.*

Le front reconstruit les items vendus depuis la timeline (`/spaces/{spaceId}/event-timeline/{eventId}`,
champ `weezeventProductId`), puis :

- **Prix** : `weezeventProductId` → `WeezeventProduct.basePrice` (via `GET /weezevent/products`)
- **Coût** : `weezeventProductId` → `WeezeventProductMapping.menuItemId` → `MenuItem.totalCost`
  (via `GET /mappings/product-menu`)
- **Marge** = `(CA − coût) / CA`
- `MenuItem.totalCost` = somme `MenuItemComponent` + `MenuItemIngredient` + `MenuItemPackaging` ;
  s'il est `null`, la marge affiche ~100 % (faux).
- Ces sources sont chargées une fois au load du space (store `analyse.weezeventProducts`,
  `weezeventProductMappings`).

### 1.5 Question produit OUVERTE — articles non identifiés

*Source : `brief-backend-eventpredict.md` §3bis — jamais tranchée formellement.*

Constat : des lignes granulaires de timeline sans identité article (`weezeventProductId`,
`productName`, `menuItemType/Category` = null) → le donut « Top items by revenue » affiche un bloc
unique **« Unidentified transaction item » = 100 % du CA**. Le front applique alors un **repli** par
`shopType` (`fnb-food` → Food, `fnb-beverages`/`fnb-bar` → Beverage, `shop` → Beverage par défaut).
Question restée ouverte : est-ce des données agrégées « normales » sans détail article, ou une
jointure/RPC à corriger ? À trancher si le symptôme réapparaît.

---

## 2. Stock, inventaire, réarmement

### 2.1 Formules d'inventaire

*Source : `spaceInventory.md` (plan de portage exécuté).*

- **Total d'un item** : `totalUnits = packedUnits × (inventoryQuantityPackaged || 1) + looseUnits`
  — à appliquer partout : comptage, sauvegarde, vue agrégée.
- **Expansion récursive des recettes** : un item `readyForSale = "No"` est expansé en ses composants,
  récursivement, avec garde-fou `MAX_DEPTH = 10`. `readyForSale = "Yes"` reste un item vendable tel quel.
  Le packaging n'est **pas hérité** depuis les combos, mais inclus s'il est direct.
- **Filtres de storage** : `dry / cold / belowzero / material / merch`.
- Fallback localStorage des comptages : clé `analyse:space-inventory-counts:{spaceId}:{eventId}`,
  debounce de sauvegarde API 500 ms, counts isolés par event.

### 2.2 Règle métier `readyForSale` + détection packaging

*Source : `menuItems.api.md`.*

| Valeur | Sens | Réarmement |
|---|---|---|
| `"Yes"` | Article livré **prêt** au PDV, déjà emballé (chips, bouteilles, certains sandwichs) | On réarme le Menu Item **tel quel** — packaging non séparé |
| `"No"` | Assemblage/ajout **au PDV** (ex. sandwich + serviette ajoutée sur place) | On **éclate** `components[]` (composants + packaging) |

C'est la fiche technique qui fait foi : si un packaging est ajouté au PDV, l'article est modélisé
`readyForSale = "No"` avec un composant packaging dédié.

- `components[]` = **dénormalisation** des 3 relations `MenuItemIngredient` + `MenuItemComponent` +
  `MenuItemPackaging` en un seul tableau (`sourceId`, `itemType`, `numberOfUnits`, `unit`,
  `category`, `storageType`).
- **Le packaging DOIT être dans `components[]`**, pas dans un champ séparé. Détection front
  (`src/utils/stockPlanning.js → isPackagingComponent`) : `category` contenant `packaging`/`emballage`,
  ou `storageType === 'material'`, ou `sourceId` préfixé `pkg-`.
- Quantité par pièce : `numberOfUnits` vaut pour `numberOfPiecesRecipe` pièces (défaut 1) —
  qté réelle = `numberOfUnits × qtéPlat / numberOfPiecesRecipe`.

### 2.3 RestockState — état du réarmement

*Source : `restockState.api.md`.*

**Décision de design** : un **document unique par space** — `PUT` upsert idempotent keyé
`(tenantId, spaceId)`, **pas** de `POST` create, **pas d'id généré côté client** (évite le bug
EventPredictVersion : id client ≠ id serveur → doublons). Pas de 404 : sans état, `GET` renvoie
`200 body null` (même convention que `GET /inventory/:spaceId/latest`). `state` stocké tel quel en
`jsonb` (blob opaque pour le backend).

Sémantique du snapshot (`RestockStateDto`, produit par `SpaceRestockView.vue → restockPersistSnapshot`) :

| Champ | Sens |
|---|---|
| `objectiveSource` | source de l'objectif : `'sales'` \| `'prediction'` \| … |
| `referenceEventId` | event de référence (mode Ventes) |
| `selectedEventIds` | events sélectionnés (0 ou 1 en pratique) |
| `stockAdjustments` | ajustements de stock par item/clé (`Record<string, number>`) |
| `stockPackedModes` | mode emballé/vrac par item |
| `restockedRows` | lignes confirmées (sorties durables) |
| `restockGenerated` | le tableau de réarmement a été figé |
| `shoppingGenerated` | la feuille de course a été générée |
| `restockViewMode` | `'shop'` \| `'item'` |

---

## 3. Weezevent, agrégation, synchronisation

### 3.1 `SpaceRevenueMinuteAgg` = source de vérité unique

*Source : `STEP4_WEEZEVENT_INTEGRATION.md` (migration effectuée le 21 mai 2026).*

- **`SpaceRevenueDailyAgg` est supprimée.** Toute granularité journalière s'obtient par
  `GROUP BY DATE_TRUNC('day', minute)` sur `SpaceRevenueMinuteAgg`.
- La minute vient de `WeezeventTransaction.transactionDate` (timestamp complet) — aucune re-sync
  nécessaire : `DATE_TRUNC('minute', transactionDate AT TIME ZONE 'UTC' AT TIME ZONE tz)`.
- **`dataPoints`** (affiché dans le wizard à côté de chaque event) =
  `COUNT(SpaceRevenueMinuteAgg WHERE weezeventEventId = event.id)` = nombre de minutes avec au moins
  1 transaction (ex. event 8 h × 5 locations actives en continu = 2 400 pts ; 0 pt = rien d'agrégé).

### 3.2 Formule revenue — une seule source de vérité

*Source : `STEP4_WEEZEVENT_INTEGRATION.md` #7.*

- `tx.amount` (montant encaissé caisse Weezevent) = valeur **authoritative** du CA total.
- La recalculation par items `SUM(unitPrice × qty − reduction)` sert à la **ventilation produit**
  (peut diverger de ±1-2 % selon remises) — **ne jamais comparer les totaux des deux méthodes**.
- Piège historique (résolu, à ne pas reproduire) : deux services écrivaient la même table avec des
  formules différentes (`SUM(tx.amount)` vs `SUM(unitPrice × qty / (1 + vatRate/100))`) — le dernier
  écrasait l'autre silencieusement.
- **Fenêtre temporelle** : borner par `eventEndDate` quand il existe (`[eventDate, eventEndDate+1j[`),
  sinon les concerts finissant après minuit et les festivals multi-jours perdent des transactions.

### 3.3 Étapes de progression d'une intégration (X/5)

*Source : `STEP4_WEEZEVENT_INTEGRATION.md`.*

| Step | Condition |
|---|---|
| step1_space_mapped | `WeezeventLocationSpaceMapping` existe via `integrationId` |
| step2_shops_mapped | merchants des transactions mappés |
| step3_menu_mapped | `WeezeventProductMapping.count > 0` (⚠️ global au tenant, pas par location) |
| step4_events_processed | `completedJobs >= pastEventCount` pour le space |
| step5_synchronized | `SpaceRevenueMinuteAgg.count > 0` pour le space |

Le bouton « Lancer la synchronisation » est gated par : plus aucune date de transaction non couverte
par un Event DataFriday (`unregisteredDates.length === 0`). Couvrir les dates ≠ avoir agrégé.
La popup de sync affiche 4 phases mais les phases 2-3 sont cosmétiques : un seul appel HTTP synchrone
(`POST /aggregation/synchronize`), qui peut dépasser 60 s sur ~200 events.

### 3.4 Prévention des trous de données au resync

*Source : `DIAG_VENTES_VIDES.md` §E (incident du 2026-07-04).*

Par ordre d'impact :

1. **Sync idempotent** — UPSERT sur `weezeventId` (clé externe stable), préserver l'id interne.
   Jamais delete+insert → mappings + agrégats survivent au sync. **Fix racine.**
2. **Contraintes FK réelles** sur `SpaceRevenueMinuteAgg.{weezeventMerchantId, weezeventLocationId,
   spaceElementId}` → un delete d'entité échoue/cascade au lieu de laisser des orphelins invisibles.
3. **Ré-agrégation automatique post-sync** (hook fin de job).
4. **Mapping robuste au re-save config** — clé stable (nom PdV normalisé / `externalMerchId`) ou
   versionner le SpaceElement sans changer son id.
5. **Garde `/weezevent/integrity` en alerte post-sync** (orphan aggs > 0 → alerte immédiate).
6. **Dédupliquer les tenants** — unicité (nom + `weezeventOrganizationId`), afficher l'id/org
   Weezevent dans le sélecteur de tenant (évite le data-integration sur le mauvais homonyme).

### 3.5 Divergence enum `ShopType` (non résolue)

*Source : `BACKEND_TICKETS_CATEGORIES.md` BT2.*

Deux vocabulaires coexistent :
- Prisma : `food, beverages, beer, merchandise, souvenirs, retail`
- Frontend / Space Menu : `food, beverages, beer, gppremium, temporary, drinkee`

Le shopType est stocké dans `FloorElement.attributes` (JSON), donc l'enum Prisma peut être vestigial.
À converger sur UNE liste partagée (`src/constants/shopTypes.js` ↔ backend) — tant que les deux
listes diffèrent, filtres et libellés cassent selon la source.

---

## 4. Conventions transverses

### 4.1 i18n — clés plates uniquement

*Source : `ORGANISATION_MODULE.md` §9.*

Le système i18n custom (`src/i18n/translations.js`) utilise des **clés plates camelCase**.
`t('roleList.title')` est normalisé en `roleListTitle` avant lookup — les objets imbriqués ne sont
**pas** supportés :

```js
roleListTitle: 'Roles'          // ✅
roleList: { title: 'Roles' }    // ❌ ne fonctionne pas
```

### 4.2 Suppliers — variantes de clés de réponse

*Source : `SUPPLIERS_SECTION.md`.*

Les spaces associés à un supplier (appelés « Sites » dans l'UI) peuvent arriver sous 4 clés selon le
backend : `spaceIds: string[]`, `siteIds: string[]`, `sites: string[]` (observé), `spaces: object[]`
(relation jointe). Le front doit tolérer les 4 pour afficher le label.
