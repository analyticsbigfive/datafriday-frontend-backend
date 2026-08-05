# HT vs TTC dans Analyse / Predict / EventPredict — constat, preuves, plan

> Document de travail. Partie **Front** = **LIVRÉE** (voir statut ci-dessous).
> Partie **Backend** = **complétée le 2026-08-04** (voir §7 : l'affirmation "le backend ne gère
> pas le HT" était fausse, un moteur HT complet existe et est déjà branché sur plusieurs
> endpoints. Seul `GET /weezevent/products` reste TTC-only, cf. §5.2 mis à jour).

---

## 0. STATUT — Fix front LIVRÉ (2026-07-05)

Le §4 (Predict + EventPredict en HT) est **implémenté**. Audit des 5 surfaces
confirmé :
- **Analyse** : HT ✅ (aucune reprise). **Inventory** : counts only, aucune valeur
  monétaire ✅. **Mapping wizard** : HT ✅.
- **EventPredict / Restock** : étaient en TTC → **corrigés en HT**.

**Source de vérité** : le HT pilote tout CA / marge / prédiction. Le TTC (`basePrice`
Weezevent, `displayPrice` catalogue) est détaxé au **point d'entrée unique** via le
helper partagé **`src/utils/price.js` → `htFromTtc(ttc, vatRate)`** (taux en %,
garde-fou taux 0/absent → passthrough). Le chemin `revenueHt` / `rev÷qty` est DÉJÀ
HT et n'est **jamais** re-détaxé (anti-double-conversion).

Points d'application (les 2 seuls, complémentaires) :
1. `EventPredictView.weezeventProductPriceMap` → détaxe la map Weezevent (levier
   principal ; `timelineRevenueTotals`, `manual*Records`, snapshot version, Restock
   en héritent). `manualQuantityRecords` détaxe aussi le fallback catalogue.
2. `EventPredictMenusSection.htUnitPrice(it)` → préfère `basePrice` (HT), sinon
   détaxe `displayPrice` (catalogue TTC). Utilisé par `shopRevenues`, `itemMargin`,
   prix affiché.

Helper mutualisé : `StepMapMenuItems` (mapping) utilise désormais le même
`htFromTtc` importé (dédup, plus de copie locale).

**Labels** : « Total Revenue (HT) » (EventPredict), « CA prédit HT » (Restock picker),
prix item « … HT » (MenusSection).

**⚠️ Anciennes versions EventPredict en base restent TTC** (fix front sans backend) :
seules les versions **re-sauvegardées** après ce fix passent en HT. Pas de migration
(décision produit). Le bug backend `+ reduction` (§5.1) reste indépendant et ouvert.

---

## 1. Réponse à la question de Bertrand

> « Il va falloir tout reprendre dans Analyse, Predict, Event Predict pour avoir le prix HT ? »

**Non, pas tout reprendre.**
- **Analyse** : déjà en HT, rien à reprendre côté front.
- **Predict + EventPredict** : un seul correctif front, ciblé (prix en TTC aujourd'hui).
- Le vrai sujet HT « global » (remises) est **côté RPC backend**, pas le front.

---

## 2. Faits & preuves

Les deux outils consomment le **même appel API** : `GET /spaces/:spaceId?granular=1`
([space.api.js:63-69](../src/api/endpoints/space.api.js)), mais lisent **deux champs
différents** :

```jsonc
{
  "shopGranularData": [
    { "menuItemName": "2 X TENDERS FRITES", "quantity": 1, "revenueHt": 10.00 } // HT
  ],
  "weezeventProducts": [
    { "name": "2 X TENDERS FRITES", "basePrice": 11.00, "vatRate": 10 }          // TTC + taux
  ]
}
```

### Analyse → HT
Affiche `revenue` (= `revenueHt`, alias) :
- `src/components/analyse/tables/MenuItemsByShopTable.vue:158` → `formatCurrencyDetailed(s.revenue)`
- normalisation `revenue := revenueHt` → `src/composables/useSpaceData.js:150`

### EventPredict / Predict → TTC
Affiche et calcule avec `basePrice` (prix Weezevent brut = TTC) :
- prix unitaire affiché → `src/components/EventPredictMenusSection.vue:247`
- `basePrice` posé depuis le map Weezevent → `src/components/EventPredictMenusSection.vue:835-837`
- CA = qté × basePrice → `src/components/EventPredictMenusSection.vue:947-958`
- map source TTC → `src/components/EventPredictView.vue:1360` (`out[id] = p.basePrice`)
- agrégateur central → `src/components/EventPredictView.vue:1724-1782`
- `SpacePredictView` = simple wrapper d'`EventPredictView` (aucune logique propre)

### Pourquoi
Même item, même appel ; Analyse prend `revenueHt` (TVA déjà retirée backend) → **HT**.
EventPredict prend `basePrice` (prix de vente brut Weezevent) et fait `qté × basePrice`
sans jamais retirer la TVA → **TTC**. `basePrice` ne peut pas être du HT : Weezevent
ne stocke que du TTC (`WeezeventPayment.amount` = TTC, `api-datafriday-main/prisma/schema.prisma:725`).

---

## 3. Exemple — « 2 X TENDERS FRITES » (item unique, AJA 21 sept)

Hypothèse basePrice 11,00 € TTC, TVA 10 %.

| Surface | Champ lu | Valeur | Nature |
|---|---|---|---|
| **Analyse** | `revenueHt` | **10,00 €** | ✅ HT |
| **EventPredict / Predict** | `basePrice` | **11,00 €** | ❌ TTC |

Écart = 1,00 € = la TVA. (« 2 X TENDERS FRITES » = nom du plat, pas quantité 2.)

### Vérifier sur les vrais chiffres (console, onglet authentifié)
```js
const sid = 'cmovsjbiz01lzvwyn30wweqpf'
fetch(`https://datafriday-api.onrender.com/api/v1/spaces/${sid}?granular=1`,
  { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
  .then(r => r.json()).then(d => {
    const g = d.shopGranularData || d.data?.shopGranularData || []
    const p = (d.weezeventProducts || d.data?.weezeventProducts || [])
      .find(x => /tenders frites/i.test(x.name||''))
    console.table(g.filter(r => /tenders frites/i.test(r.menuItemName||r.itemName||''))
      .map(r => ({ item:r.menuItemName, qty:r.quantity, revenueHt:r.revenueHt })))
    console.log('basePrice TTC =', p?.basePrice, '| vatRate =', p?.vatRate)
  })
```

---

## 4. Plan de correction — FRONT (Predict + EventPredict en HT, zéro backend)

Audit exhaustif : 66 sites prix/CA/marge/per-capita audités. Le HT est atteignable
côté front via `weezeventProducts[].vatRate` (**pourcentage** : échantillons backend
`10`, `5.5`, `20`) et via `record.totalRevenue` (= `revenueHt`, HT).

### Stratégie : 1 levier + 3 retouches catalogue
Point d'injection TTC **unique** = `weezeventProductPriceMap()`. Le détaxer à la
source met en HT tout le chemin Weezevent des 2 fichiers d'un coup.

### `src/components/EventPredictView.vue`
**A. `weezeventProductPriceMap()` [1360-1372] — levier principal :**
```js
const ttc = p.basePrice != null ? Number(p.basePrice) : null
if (ttc == null || !Number.isFinite(ttc)) continue
const vr = Number(p.vatRate)                                  // % (10, 5.5, 20…)
const price = Number.isFinite(vr) && vr > 0 ? ttc / (1 + vr/100) : ttc  // HT
// out[id|weezeventId|nameLower] = price
```
→ corrige `timelineRevenueTotals` (1765), `manualItemInfoByKey` (1888),
`manualQuantityRecords` (1926) + `syntheticItemsById.basePrice` (MenusSection, via prop).

**B. `manualQuantityRecords()` [1922-1938] :** préférer `info.price` (HT via A) ;
fallback catalogue `mi.displayPrice ?? mi.basePrice` = TTC résiduel (commenter).

**NE PAS toucher** (dérivés, héritent du HT) : `totalPredictedRevenue` 1783,
`totalAdjustedRevenue` 1952, marges 1989-1998, `perCapita*` 1999-2008,
`avgPerTransaction` 2046, `snapshotForVersion` 3926, KPI strip 837-932.
**Déjà HT** : scoring (`adjustedRecords` 1797, `predictionRows` 2215), normalisations 2782/3665.

### `src/components/EventPredictMenusSection.vue`
`it.displayPrice` (catalogue TTC) prime sur `it.basePrice` (HT après A) → inverser via
helper partagé :
```js
htUnitPrice(it) {
  const ht = Number(it.basePrice) || 0          // HT (map détaxé, ou rev/qty)
  if (ht > 0) return ht
  return Number(it.displayPrice ?? it.basePrice) || 0   // TTC résiduel (catalogue jamais vendu)
}
```
**C.** `shopRevenues()` [958] → `htUnitPrice(it)`.
**D.** `itemMargin()` [1155] → `htUnitPrice(it)` (corrige base mixte prix-TTC/coût-HT).
**E.** prix affiché [247] → `formatCurrency(htUnitPrice(item))` (option suffixe « HT »).

### Downstream — 0 édit
Versions sauvegardées → HT auto → `SpaceRestockView:1156` → picker restock « CA prédit »
HT sans modif. CSV restock = quantités only. `SpacePredictView` = wrapper.

### Cas limites
- `vatRate` 0/absent/aberrant → garde-fou `vr>0 && finite` → garde TTC (pas de /0).
- Item catalogue jamais vendu → pas de source HT → TTC résiduel marqué (rare).
- **Anciennes versions en base restent TTC** (no-backend) ; seules les re-sauvegardées passent HT.

### À vérifier avant d'éditer
1. Unité réelle de `weezeventProducts[0].vatRate` (% attendu ; si ratio `0.1` → diviseur `1+vatRate`).
2. L'objet `it` de `shopRevenues` porte bien `basePrice` (synthétique) ET `displayPrice` (catalogue).

### Vérification
KPI Total Revenue ≈ Σ `revenueHt` ; ratio avant/après ≈ `1 + vatRate/100` ; marge monte ;
per-capita/panier baissent ; pas de NaN.

### Fichiers touchés (front)
- `src/components/EventPredictView.vue` (hunks A, B)
- `src/components/EventPredictMenusSection.vue` (hunks C, D, E + helper)

---

## 5. BACKEND, état vérifié (mis à jour 2026-08-04, voir §7 pour le détail de l'audit)

### 5.1 Bug `reduction` non réintégrée dans `revenueHt`, ✅ RÉSOLU (n'est plus un bug ouvert)
La formule redoutée (`Total_HT = amount − amountVat`, sans `+ reduction`) provenait d'un doc
archivé (`backend/docs/old/weezevent/WEEZEVENT_FNB_MAPPING.md`, jamais implémenté, pas de modèle
`FnbSalesRaw` en base). Le pipeline réellement en prod (`backend/src/features/aggregation/
aggregation.service.ts:279-811`) réintègre bien la remise :
```
revenueHt = SUM((unitPrice * quantity - reduction) / (1 + vat/100))   // lignes ~297, ~337
```
`revenueHt` est persisté sur `SpaceRevenueMinuteAgg`/`SpaceProductRevenueDailyAgg` et exposé tel
quel par la RPC `get_space_shop_details` (migration `20260731120000_...sql`) et par
`dashboard-response.dto.ts` (`revenueHt`, `avgTicketHt`). **Rien à corriger ici.**

### 5.2 Exposer un prix HT direct sur `GET /weezevent/products` (toujours pas fait, mais trivial)
Le moteur de calcul existe déjà et est déjà branché ailleurs :
- `MenuItemPricingService.computePricing()` (`backend/src/shared/pricing/
  menu-item-pricing.service.ts:45-96`), source de vérité HT/TTC/taxe/remise du backend.
- Déjà exposé sous `pricing.gross.ht` / `pricing.net.ht` par `getShopMenu` et
  `getConfigShopMenuItemsFull` (`space-menus.service.ts:303-309`, `:1159-1187`).
- Déjà exposé sous `weezeventProduct.pricing.ht` par `enrichMappingsPricing`
  (`mappings.service.ts:596`), consommé par l'étape 3 du wizard Data Integration.

**Ce qui manque précisément** : `GET /weezevent/products`
(`backend/src/features/weezevent/weezevent.controller.ts:688-851`), l'endpoint que le front
consomme réellement pour peupler `weezeventProducts[]` (Analyse, EventPredict) via
`aggregation.api.js:148` → `useSpaceData.js:214-247`, ne renvoie que `basePrice` (TTC) +
`vatRate`. Un HT existe déjà dans un sous-champ `salesPrices[].ht` (quand `priceSource` vaut
`sales_*`), mais le front actuel ne le lit pas ; en `priceSource:'catalog'` il n'y a aucun champ
HT du tout.

**Ampleur estimée pour brancher `computePricing()` sur cet endpoint** : voir le scoping détaillé
en cours (§7 sera complété avec fichiers exacts à toucher, risques perf/breaking change).

---

## 6. Synthèse

| Surface | État | Action |
|---|---|---|
| Analyse | HT ✅ | Aucune (dépend du `revenueHt` backend) |
| EventPredict / Predict | HT ✅ (fix front livré 2026-07-05) | Aucune, détaxe via `htFromTtc`/`vatRate` au point d'entrée unique |
| RPC `revenueHt` (remises) | ✅ Résolu | `reduction` bien réintégrée en prod (`aggregation.service.ts`), doc archivé était trompeur |
| `GET /weezevent/products` (HT direct) | TTC-only, moteur existant non branché | Optionnel (§5.2/§7), simplifierait le front si fait |

Le front convertit déjà correctement TTC→HT partout où c'est nécessaire ; le vrai reliquat est
côté backend, purement optionnel : brancher `MenuItemPricingService.computePricing()` (déjà
utilisé par `getShopMenu`/`enrichMappingsPricing`) sur `GET /weezevent/products` pour éviter au
front de refaire la conversion à la main.

---

## 7. Audit backend complet (2026-08-04) : le backend gère-t-il le HT ?

**Verdict : oui, largement.** Dire "le backend ne fait rien pour le HT" est faux. Un moteur HT
central (`MenuItemPricingService`) existe, est riche (gross/net, remise, marge), et est déjà
branché sur `getShopMenu`, `getConfigShopMenuItemsFull` et `enrichMappingsPricing`. `revenueHt`
est natif sur tout le pipeline dashboard/agrégation, remise incluse.

Le seul point réellement TTC-only aujourd'hui est l'endpoint spécifique consommé par
Analyse/EventPredict pour le catalogue produit (`GET /weezevent/products`), un gap précis et
ciblé, pas une absence générale de gestion du HT côté backend.

Schéma Prisma (`backend/prisma/schema.prisma`) : aucune colonne HT n'a jamais existé en face de
`basePrice`/`vatRate` sur `SalesProduct` (:1289-1290), `MenuItem` (:2235-2236),
`SpaceMenuItem` (:2314-2315, `priceTtc`), choix structurel constant (TTC + taux stockés, HT
toujours dérivé à la volée, jamais persisté). Seuls les agrégats de revenu
(`SpaceRevenueMinuteAgg.revenueHt`, `SpaceProductRevenueDailyAgg.revenueHt`,
`ElementMenuItemSalesInput.revenueHt`, `UnmappedDataMetrics.revenueHt`) stockent du HT, au niveau
agrégat, jamais au niveau prix unitaire produit.

### 7.1 Scoping : brancher `computePricing()` sur `GET /weezevent/products`

**Ampleur : S.** Rien de bloquant : `MenuItemPricingService` est déjà injecté dans
`WeezeventController` (`weezevent.controller.ts:37`, module déjà importé via `PricingModule`
dans `weezevent.module.ts:16,31`). Pas de N+1, pas de requête supplémentaire hors un éventuel
`getTenantDefaultVatRate(tenantId)` unique en tête de méthode (même pattern que
`space-menus.service.ts:276`). Pas de DTO typé à casser (réponse `any[]` non typée
aujourd'hui). Changement additif, aucun breaking change pour les appelants actuels
(`useSpaceData.js:214`, `StepMapMenuItems.vue:1128,1842`) qui continueraient de lire
`basePrice`/`vatRate` TTC comme avant.

Fichiers à toucher si on implémente :
1. `backend/src/features/weezevent/weezevent.controller.ts` (~lignes 749-831, les 3 branches de
   mapping `data = products.map(...)`), ajouter `pricing: this.pricing.computePricing(pr,
   tenantVatRate, null)` (ou juste `basePriceHt`), `tenantVatRate` récupéré une fois en tête de
   méthode.
2. `frontend/src/api/endpoints/aggregation.api.js` (~ligne 148), documenter le nouveau champ en
   JSDoc.
3. `frontend/src/utils/price.js` / `useSpaceData.js` (optionnel), `menuItemPriceHt` préfère déjà
   `mi.pricing?.gross?.ht` en étape 2 de sa résolution ; il consommerait le nouveau champ sans
   modif s'il est branché sur `weezeventProducts[]`.
4. Tests backend existants sur `getProducts` (à localiser) à mettre à jour si assertions strictes
   sur la forme de réponse.

Cas limite : en `priceSource: 'catalog'`, `vatRate` peut être `null` → `computePricing` renverrait
`gross.ht: null` (comportement voulu, pas de taux inventé) ; le front devrait gérer ce `null`
comme il le fait déjà via le garde-fou de `htFromTtc` (`price.js:27-28`).

**Décision : non implémenté à ce stade** (scoping demandé par Ulrich le 2026-08-04, à planifier
séparément si jugé utile).
