# HT vs TTC dans Analyse / Predict / EventPredict — constat, preuves, plan

> Document de travail. Partie **Front** = **LIVRÉE** (voir statut ci-dessous).
> Partie **Backend** = à compléter par Ulrich (la RPC `revenueHt` + éventuels champs à exposer).

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

## 5. BACKEND — à compléter (Ulrich)

> Section ouverte : le backend voudra probablement ajouter/clarifier ici.

### 5.1 Bug probable : `reduction` non réintégrée dans `revenueHt`
Formule documentée backend : `Total_HT = WeezeventPayment.amount − amountVat`
(`api-datafriday-main/docs/WEEZEVENT_FNB_MAPPING.md:67`) — **sans `+ reduction`**.
Règle métier attendue :
```
Total HT = (amount − amount_vat + reduction) / 100
```
→ si la RPC suit la doc, `revenueHt` est **sous-évalué du montant des remises** (l'écart
= exactement `reduction`). Impacte Analyse **et** EventPredict (qui liront le HT corrigé).

Données brutes dispo en base (`WeezeventPayment`) : `amount` (TTC), `amountVat` ;
`reduction` synced (`api-datafriday-main/src/features/weezevent/services/weezevent-sync.service.ts:212`)
mais stockée dans `rawData`/transaction, pas en colonne dédiée.

**À confirmer par le backend :**
- [ ] La RPC granular (`revenueHt`) inclut-elle `+ reduction` ? Sinon, l'ajouter.
- [ ] Où vit `reduction` exactement (colonne vs `rawData`) et est-elle exploitable dans la RPC ?
- [ ] Localiser la RPC/migration réelle (absente du snapshot `api-datafriday-main`).

### 5.2 Option (facultative) : exposer un prix HT par produit
Le front corrige la TVA via `vatRate` (déjà exposé). Si le backend préfère porter la
vérité, il pourrait exposer `basePriceHt` (= `basePrice / (1 + vatRate/100)`) sur
`weezeventProducts` → le front remplacerait juste `basePrice` par `basePriceHt`
(le levier A devient trivial). À décider côté backend.

**À compléter par le backend :**
- [ ] _(Ulrich)_ …

---

## 6. Synthèse

| Surface | État | Action |
|---|---|---|
| Analyse | HT ✅ | Aucune (dépend du `revenueHt` backend) |
| EventPredict / Predict | TTC ❌ | Fix front (§4) : détaxer via `vatRate` |
| RPC `revenueHt` (remises) | À vérifier ⚠️ | Backend §5.1 : `+ reduction` |

Les deux correctifs sont **indépendants et cumulables** : le front retire la TVA ;
le backend corrige les remises.
