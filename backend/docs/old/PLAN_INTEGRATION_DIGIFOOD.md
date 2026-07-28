# Plan d'implémentation — Intégration Digifood (webhooks + import CSV)

> **Statut** : v2 validée le 2026-07-10 — architecture « source commune » (tables de ventes partagées renommées `Sales*` via `@@map`, config par provider dans des tables dédiées).
> **Périmètre** : backend `api-datafriday-staging` d'abord ; le front (config des clés, wizard) suivra par handoff.
> **Décisions actées** :
> 1. Config : table commune `Integration` + une table de détail **par provider** (`WeezeventIntegrationConfig`, `DigifoodIntegrationConfig`). Aucune clé Digifood dans une table nommée Weezevent.
> 2. Ventes : **une seule source commune** (les tables physiques `Weezevent*` existantes), renommées côté Prisma en `Sales*` via `@@map` — les noms physiques en base ne bougent pas, les raw SQL de l'aval non plus.
> 3. Signes des montants v26 : à vérifier sur payloads réels, ingestion **tolérante** (normalisation).
> 4. Formules/modificateurs (`children[]`) : ingestion **aplatie récursive** (voir §5.3).
> 5. `location` Digifood → mapping **Space** ; `shop` Digifood → mapping **SpaceElement** (PDV).
> 6. `external_reference` → auto-mapping produit→MenuItem quand il matche.
> 7. **Provenance** : toute donnée ingérée porte un champ `provider` en base (`WEEZEVENT` | `DIGIFOOD`).

---

## 0. Rappel du contexte

- Digifood ne fournit **que** deux webhooks temps réel : `order.completed` et `order.refunded`. Pas d'API pull, pas d'API catalogue, pas d'API d'historique (rattrapage exceptionnel non documenté, sur demande auprès de Digifood).
- Le payload du webhook **est la source unique** de données (contrairement à Weezevent où le webhook déclenche un re-fetch API — `webhook-event.handler.ts:107`).
- Retries Digifood pendant **24 h** tant qu'on ne répond pas 2xx → l'ingestion doit être **idempotente** (champ `id` racine du webhook + clé unique transaction).
- Deux générations de POS coexistent chez leurs clients :
  - **v24** : remboursement = webhook `order.refunded` (payload minimal, quantités négatives, référence à l'order d'origine).
  - **v26** : remboursement = **commande indépendante** émise via `order.completed` avec `data.type = "refund"` + `relationships[] = [{ type: "original", related_order_id }]`. Nouveaux champs `before_discounts` (niveau ticket et niveau ligne).
- Signature : HMAC-SHA256 calculé sur le **JSON trié récursivement par clés** (≠ Weezevent qui signe le `JSON.stringify` brut). Headers : `digifood-wh-signature`, `digifood-wh-key-version`, `digifood-wh-version`.
- Montants Digifood en **centimes** (int) ; nos tables stockent des euros `Decimal(10,2)` → division par 100 à l'ingestion (même conversion que `transaction-sync.service.ts:431`).

---

## 1. Architecture retenue — source commune, config par provider

### 1.1 Principe

**Une seule source de vérité pour les ventes** : les tables physiques existantes (`WeezeventTransaction`, `WeezeventProduct`, `WeezeventLocation`, mappings…) deviennent le référentiel ventes **multi-provider**. Digifood y verse ses données comme Weezevent, distinguées par la colonne `provider`. Bénéfice : dashboards revenus (`aggregation.service.ts`), déduction de stock Logistic (`deriveSalesRaw`), prix dérivés (`menu-item-pricing.service.ts`) et wizard Data Integration fonctionnent **sans aucune modification** de leurs requêtes.

**Mais le code ne parle plus de « Weezevent » pour des données génériques** : les modèles Prisma sont renommés en noms neutres avec `@@map` vers les tables physiques actuelles. Le renommage est purement côté TypeScript/Prisma :

- ✅ vérifié par le compilateur (chaque `prisma.weezeventTransaction` oublié casse au build) ;
- ✅ **zéro migration de données**, zéro `ALTER TABLE RENAME` ;
- ✅ les **raw SQL** de l'agrégation, du stock et du pricing référencent les noms physiques → **intacts** ;
- 🔜 le renommage physique des tables pourra se faire plus tard, à froid, comme opération cosmétique indépendante.

### 1.2 Table de renommage des modèles Prisma

| Modèle actuel | Nouveau modèle | Table physique (`@@map`) | Note |
|---|---|---|---|
| `WeezeventIntegration` | `Integration` | `WeezeventIntegration` | + `provider`, colonnes weezevent déplacées (§2.2) |
| — (nouveau) | `WeezeventIntegrationConfig` | `WeezeventIntegrationConfig` | table physique **nouvelle**, détail 1-1 |
| — (nouveau) | `DigifoodIntegrationConfig` | `DigifoodIntegrationConfig` | table physique **nouvelle**, détail 1-1 |
| `WeezeventTransaction` | `SalesTransaction` | `WeezeventTransaction` | + `provider` |
| `WeezeventTransactionItem` | `SalesTransactionItem` | `WeezeventTransactionItem` | |
| `WeezeventPayment` | `SalesPayment` | `WeezeventPayment` | |
| `WeezeventProduct` | `SalesProduct` | `WeezeventProduct` | + `provider` ; catalogue multi-provider |
| `WeezeventProductVariant` | `SalesProductVariant` | `WeezeventProductVariant` | |
| `WeezeventProductComponent` | `SalesProductComponent` | `WeezeventProductComponent` | |
| `WeezeventLocation` | `SalesLocation` | `WeezeventLocation` | + `provider` ; PDV multi-provider |
| `WeezeventEvent` | `SalesEvent` | `WeezeventEvent` | dimension « événement/site » |
| `WeezeventProductMapping` | `ProductMapping` | `WeezeventProductMapping` | mapping → MenuItem |
| `WeezeventLocationSpaceMapping` | `LocationSpaceMapping` | `WeezeventLocationSpaceMapping` | |
| `WeezeventLocationShopMapping` | `LocationShopMapping` | `WeezeventLocationShopMapping` | |
| `WeezeventWebhookEvent` | `IntegrationWebhookEvent` | `WeezeventWebhookEvent` | + `provider`, + `externalDeliveryId` (§2.4) |

**Restent nommés `Weezevent*`** (spécifiques au sync API Weezevent, jamais alimentés par Digifood) : `WeezeventSyncState`, `WeezeventSyncJob`, `WeezeventSyncChunk`, `WeezeventMerchant`, `WeezeventWallet`, `WeezeventOrder`, `WeezeventPrice`, `WeezeventAttendee`, `WeezeventUser`. Les relations nullable de `SalesTransaction` vers `WeezeventMerchant`/`WeezeventWallet` sont conservées (null pour Digifood).

**Champs renommés en même temps** (même mécanique `@map`, colonnes physiques inchangées, compilo-vérifié) :

| Champ actuel | Nouveau champ | Modèles concernés |
|---|---|---|
| `weezeventId` | `externalId @map("weezeventId")` | `SalesTransaction`, `SalesProduct`, `SalesLocation`, `SalesEvent` |
| `weezeventItemId` | `externalItemId @map("weezeventItemId")` | `SalesTransactionItem` |
| `weezeventProductId` | `salesProductId @map("weezeventProductId")` | `ProductMapping` |
| `weezeventLocationId` | `salesLocationId @map("weezeventLocationId")` | `LocationSpaceMapping`, `LocationShopMapping` |
| relation `weezeventMappings` | `salesMappings` | `MenuItem` |

Les colonnes des read-models d'agrégation (`weezeventEventId`, `weezeventLocationId`… sur `SpaceRevenueMinuteAgg`/`SpaceProductRevenueDailyAgg`) ne sont **pas** renommées (elles sont écrites/lues par raw SQL) — hors périmètre, cosmétique différable.

### 1.3 Correspondance des concepts Digifood → source commune

| Digifood | Modèle cible | Clé (`externalId`) |
|---|---|---|
| `order` (ticket) | `SalesTransaction` | `data.id` (ex. `order_Qm...`) |
| `items[]` + `children[]` (aplatis) | `SalesTransactionItem` | `rawData` conserve la ligne source |
| Article (`variation_id`, sinon fallback) | `SalesProduct` | `variation_id` (voir §5.3) |
| `shop` (PDV, ex. « Buvette B-03 ») | `SalesLocation` | `shop.id` |
| `location` (site, ex. « Zoo de Vanves ») | `SalesEvent` *(voir §5.4)* | `location.id` |
| `transactions[]` (paiements) | `metadata.payments` de la transaction | — |
| `discounts[]` | `metadata.discounts` | — |
| Config / clés | `Integration` + `DigifoodIntegrationConfig` | — |
| Webhook reçu (journal) | `IntegrationWebhookEvent` | dédup sur `payload.id` |

Le **statut** de transaction est mappé sur la convention existante : `order.completed` → `status = 'V'` (seule valeur consommée par l'aval : `logistics.service.ts:827`, agrégats revenus). Les remboursements sont des transactions à **quantités/montants négatifs** avec `status = 'V'` : ils traversent naturellement `SUM(unitPrice * quantity)` (revenus décrémentés) et `deriveSalesRaw` (stock re-crédité).

---

## 2. Migration Prisma

> ⚠️ Rappels process : migrations **gitignorées**, Render n'applique rien → `make prod-migrate` manuellement, **migration AVANT déploiement du code**. En dev, shadow DB cassée → `prisma db execute` + `migrate resolve`.

La migration DB est **purement additive** (le renommage des modèles est un refactor code sans DDL). Contenu :

### 2.1 Enum de provenance

```prisma
enum IntegrationProvider {
  WEEZEVENT
  DIGIFOOD
}
```

### 2.2 Config : `Integration` commune + détail par provider

```prisma
model Integration {
  id        String              @id @default(cuid())
  tenantId  String
  provider  IntegrationProvider @default(WEEZEVENT)
  name      String              // label utilisateur, ex. "Hellfest 2025", "Zoo de Vanves"
  enabled   Boolean             @default(true)
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  tenant    Tenant                      @relation(...)
  weezevent WeezeventIntegrationConfig? // 1-1 si provider = WEEZEVENT
  digifood  DigifoodIntegrationConfig?  // 1-1 si provider = DIGIFOOD
  // ... back-references existantes (transactions, products, locations, webhookEvents…) ...

  // ⚠️ Colonnes weezevent historiques (clientId, clientSecret, organizationId) :
  // GELÉES — retirées du modèle Prisma pour que tout code qui les référence casse
  // à la compilation (même patron que MenuItem.spaceIds). Drop DB différé.
  @@map("WeezeventIntegration")
  @@index([tenantId])
  @@index([tenantId, provider, enabled])
}

model WeezeventIntegrationConfig {
  id             String  @id @default(cuid())
  integrationId  String  @unique
  clientId       String
  clientSecret   String  // Chiffré (EncryptionService existant)
  organizationId String?
  integration    Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
}

model DigifoodIntegrationConfig {
  id             String  @id @default(cuid())
  integrationId  String  @unique
  webhookSecret  String  // Chiffré (même EncryptionService)
  keyVersion     String? // Dernière valeur reçue de digifood-wh-key-version
  posVersion     String? // Info : "24" | "26" (détectée via software.version, cf. §5.6)
  integration    Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
}
```

**Étapes SQL de la migration config** :
1. `CREATE TABLE "WeezeventIntegrationConfig"` + `"DigifoodIntegrationConfig"` ;
2. `ALTER TABLE "WeezeventIntegration" ADD COLUMN "provider" ... DEFAULT 'WEEZEVENT'` ;
3. Backfill : `INSERT INTO "WeezeventIntegrationConfig" (integrationId, clientId, clientSecret, organizationId) SELECT id, "clientId", "clientSecret", "organizationId" FROM "WeezeventIntegration"` ;
4. Les colonnes `clientId`/`clientSecret`/`organizationId` restent physiquement en place (gelées, hors modèle Prisma) — drop dans une migration de nettoyage ultérieure, après validation en prod.

Les FKs existantes (`integrationId` sur transactions, produits, locations, journal webhook…) pointent la même table physique → **rien à toucher**.

**Rotation de clé Digifood** : `keyVersion` stocké à titre informatif ; si Digifood confirme un tuilage (deux clés valides pendant la rotation), ajouter `webhookSecretPrevious String?` sur `DigifoodIntegrationConfig` (cf. §9).

**Legacy `Tenant.weezevent*`** : les champs top-level du Tenant (`weezeventClientId/Secret`, `weezeventWebhookSecret/Enabled`) restent tels quels — utilisés par le webhook Weezevent existant, hors périmètre de ce chantier.

### 2.3 Colonne `provider` sur les données (exigence : savoir d'où vient chaque donnée)

`ALTER TABLE ... ADD COLUMN "provider" ... DEFAULT 'WEEZEVENT'` + index sur :

| Table physique | Modèle | Justification |
|---|---|---|
| `WeezeventTransaction` | `SalesTransaction` | filtre direct des ventes par source (dashboards, exports, debug) |
| `WeezeventProduct` | `SalesProduct` | catalogue mixte → wizard filtre/étiquette par source |
| `WeezeventLocation` | `SalesLocation` | idem PDV |
| `WeezeventWebhookEvent` | `IntegrationWebhookEvent` | journal des webhooks des deux providers |

Le `DEFAULT 'WEEZEVENT'` rend le **backfill automatique** (aucune donnée existante à retoucher). Index composites : `@@index([tenantId, provider])` sur `SalesTransaction` et `SalesProduct`.

En complément, chaque ligne ingérée par Digifood porte `metadata.provider = 'digifood'` et `rawData` = payload source complet (audit / re-processing).

### 2.4 Journal webhook (`IntegrationWebhookEvent`)

- `eventType` = `order.completed` | `order.refunded` ; `method` = `data.type` normalisé (`sale` | `refund` | `order`) ; `payload` = corps complet ; `signature` = header `digifood-wh-signature`.
- **Dédup** : nouvelle colonne `externalDeliveryId String?` (= `payload.id`, l'UUID de livraison Digifood, stable entre retries) + `@@unique([integrationId, externalDeliveryId])`. Un retry sur un webhook déjà traité → 200 immédiat sans re-traitement.

---

## 3. Refactor de renommage (avant le module Digifood)

Renommage des modèles/champs du §1.2 dans `schema.prisma` (+ `@@map`/`@map`), puis renommage mécanique dans tout le code TS (`prisma.weezeventTransaction` → `prisma.salesTransaction`, types générés, DTOs internes, services weezevent/mappings/spaces/logistics/pricing/aggregation).

- **Vérification = compilation** : `prisma generate` + build TS (par l'utilisateur). Aucun raw SQL à modifier (noms physiques inchangés) — vérifiable par `grep -r '"Weezevent' src/` sur les chaînes SQL : elles doivent rester identiques avant/après.
- Ce refactor est un **commit dédié**, sans aucun changement de comportement, déployable indépendamment (aucune migration associée).
- Les services weezevent gardent leurs noms de classes/fichiers (`WeezeventSyncService`, etc.) : ils sont réellement spécifiques à Weezevent ; seuls les accès aux **modèles partagés** changent.

---

## 4. Nouveau module backend `src/features/digifood/`

```
src/features/digifood/
├── digifood.module.ts
├── digifood-webhook.controller.ts        # POST /webhooks/digifood/:tenantId/:integrationId
├── dto/
│   ├── digifood-webhook-payload.dto.ts   # { event, id, timestamp, data } — validation SOUPLE (voir §5.7)
│   └── digifood-csv-import.dto.ts
├── services/
│   ├── digifood-signature.service.ts     # HMAC sur JSON trié récursivement + timingSafeEqual
│   ├── digifood-webhook.handler.ts       # dispatch order.completed / order.refunded → ingestion
│   ├── digifood-ingestion.service.ts     # LE cœur : payload → SalesProduct/Location/Transaction/Items
│   └── digifood-csv-import.service.ts    # parsing CSV → même chemin d'ingestion
└── utils/
    └── sort-object.util.ts               # tri récursif des clés (copie du snippet doc Digifood)
```

Enregistrer le module dans `app.module.ts` (⚠️ gotcha connu : `KvModule` non enregistré = routes mortes — ne pas reproduire).

### Endpoint webhook — `POST /webhooks/digifood/:tenantId/:integrationId`

Même patron que `webhook.controller.ts` Weezevent (fail-closed), adapté :

1. **`@Public()`** — pas de JWT. Le scoping Prisma CLS est inactif hors requête authentifiée (`prisma.service.ts:135`) → **toutes les écritures portent `tenantId` explicitement**.
2. Charger `integration.findUnique({ id: integrationId, include: { digifood: true } })`, vérifier `integration.tenantId === tenantId`, `integration.provider === 'DIGIFOOD'`, `integration.enabled`, `integration.digifood != null`.
3. **Signature (fail-closed)** :
   - pas de `webhookSecret` configuré → 401 ;
   - header `digifood-wh-signature` absent → 401 ;
   - vérification : `hmacSha256(JSON.stringify(sortObjectDeep(body)), secret)` comparé en `crypto.timingSafeEqual`. **Ne pas** réutiliser `WebhookSignatureService` Weezevent (il signe le body non trié).
   - stocker `digifood-wh-key-version` reçu dans `keyVersion` s'il change (log warn → signal de rotation).
4. **Dédup** : upsert du `IntegrationWebhookEvent` sur `[integrationId, externalDeliveryId = payload.id]`. Déjà `processed = true` → répondre `200 { received: true, duplicate: true }` sans traitement.
5. **Ack rapide** : journaliser puis `setImmediate(() => handler.processEvent(...))` (patron existant `processEventAsync`). Répondre 200 en < 1 s pour stopper les retries (doc Digifood §6). Échec async → `error` + `retryCount` sur le journal (retraitement possible).
6. **Erreurs de traitement ≠ erreurs de réception** : signature invalide → 401 (Digifood retentera, c'est voulu) ; payload valide mais imprévu → 200 + journal en erreur (on ne veut PAS 24 h de retries sur un bug de mapping chez nous — le journal permet le replay).

---

## 5. Service d'ingestion (`digifood-ingestion.service.ts`)

Point d'entrée unique `ingestOrder(tenantId, integrationId, normalizedOrder, source)` utilisé par **le webhook ET l'import CSV** (`source: 'webhook' | 'csv'`). Tout est upsert-idempotent.

### 5.1 Normalisation amont (décision 3 : « flexible »)

Avant persistance, une étape `normalizeOrder(payload)` unifie les trois formes :

| Entrée | Normalisation |
|---|---|
| `order.completed`, `type` ∈ {`sale`, `order`} (ou absent) | vente : quantités/montants tels quels |
| `order.completed`, `type = 'refund'` (v26) | remboursement : **forcer** quantités des lignes et `total`/`amount` en **négatif** s'ils arrivent positifs (`qty = -Math.abs(qty)`, etc.) — on ne fait pas confiance au signe tant que non vérifié sur payloads réels |
| `order.refunded` (v24) | reconstruire un pseudo-ordre : `id = "refund:" + data.id` (l'id de transaction de remboursement, stable), items = `refunded_items[]` (quantités déjà négatives — re-forcer négatif par sécurité), lien vers l'order d'origine dans `metadata.originalOrderId = data.order.id` |

**Garde anti-double-comptage v24/v26** : si un client migre en v26 et que Digifood émet les deux webhooks pour un même remboursement, la 2ᵉ écriture est neutralisée :
- v26 d'abord : avant d'insérer un pseudo-ordre `refund:*`, vérifier qu'il n'existe pas déjà une `SalesTransaction` `provider=DIGIFOOD` dont `metadata.relationships` contient `{ type: 'original', related_order_id = <même order> }` au même montant ;
- v24 d'abord : symétriquement avant d'insérer un ticket `type=refund` v26.
- Cas improbable (une app POS a une seule version à la fois) → simple garde + log warn.

### 5.2 Upsert des référentiels à la volée (pas d'API catalogue)

Dans l'ordre, au sein du traitement d'un order :

1. **Site** (`data.location`) → voir §5.4.
2. **PDV** (`data.shop`) → upsert `SalesLocation` sur `[tenantId, integrationId, externalId = shop.id]` : `name = shop.name`, `provider = DIGIFOOD`, `metadata = { digifoodLocationId: location.id, digifoodLocationName: location.name }`, `rawData = { shop, location }`. C'est cette ligne que le wizard mappe vers un `SpaceElement` (`LocationShopMapping`) **et** vers un `Space` (`LocationSpaceMapping`) — décision 5 : tous les shops d'une même `location` Digifood seront mappés vers le même Space, chacun vers son PDV.
3. **Articles** : pour chaque ligne aplatie (§5.3), upsert `SalesProduct` sur `[tenantId, integrationId, externalId = productKey]` :
   - `productKey = variation_id` si présent (identifiant catalogue stable), sinon fallback `slug(name + '|' + variation)` (les lignes v24 `refunded_items` n'ont pas de `variation_id` — le fallback par nom raccroche un remboursement à un produit déjà connu) ;
   - `name` = `name` (+ ` — ${variation}` si `variation` non nulle et différente du nom), `productType = family`, `basePrice = price_pu / 100`, `vatRate = parseFloat(tax_rate)`, `provider = DIGIFOOD`, `metadata = { externalReference: external_reference, namePrivate: name_private, barcode }`, `rawData` = ligne source ;
   - le prix/nom du catalogue est **rafraîchi** à chaque vente (dernier vu = état courant), comme le sync catalogue Weezevent.

### 5.3 Formules et modificateurs — ingestion aplatie récursive (décision 4, « meilleure version »)

**En clair** : une « Formule Burger + Boisson » arrive comme un item parent (souvent à 0 €) contenant des `children[]` (le burger, la boisson, elles-mêmes avec d'éventuelles options « sans sauce »). Le **revenu** est porté par les lignes qui ont un prix ; le **stock** est porté par chaque composant réellement servi.

**Règle** : on aplatit récursivement `items[]` ∪ tous les `children[]` (toutes profondeurs) en lignes `SalesTransactionItem` **sœurs**, chacune avec son propre produit, prix, quantité :

- Revenu : `SUM(unitPrice × quantity)` reste juste — le parent à 0 € contribue 0, les enfants portent leurs prix. Aucun double comptage (les montants enfants ne sont **pas** inclus dans le `price_pu` du parent, cf. exemple 3.2 de la doc Digifood : total 6000 = somme des enfants, parent à 0).
- Stock : chaque ligne (parent ET enfants) est mappable individuellement vers un MenuItem dans le wizard → la recette du MenuItem fait l'explosion ingrédients via `explodeSalesToConsumption()`. Les options à 0 € (« Sans sauce ») restent visibles dans le wizard mais peuvent rester non mappées (aucun impact).
- Traçabilité : chaque ligne enfant garde `rawData.parentItemId` + `metadata.depth` pour reconstituer l'arbre (affichage ticket, debug).
- **Quantité effective** d'un enfant = `child.quantity × parent.quantity` (2 formules → chaque composant compte double). À implémenter dans l'aplatissement.

### 5.4 `location` Digifood → `SalesEvent`

Le site (`location` = « Zoo de Vanves ») est projeté en `SalesEvent` (`externalId = location.id`, `name`, provider en metadata) et posé sur `SalesTransaction.eventId/eventName`. Justification : agrégats et écrans utilisent `eventId/eventName` comme dimension « événement/site » → filtre par site Digifood gratuit dans les dashboards. Le mapping **Space** du wizard reste porté par la `SalesLocation` (= shop) via `LocationSpaceMapping` (§5.2).

### 5.5 Transaction + items

Upsert `SalesTransaction` sur `[tenantId, integrationId, externalId = normalizedOrder.id]` :

| Colonne | Source Digifood |
|---|---|
| `amount` | `total / 100` (négatif si refund) |
| `status` | `'V'` (les webhooks n'émettent que des orders finalisés) |
| `transactionDate` | `placed_at` (fallback `timestamp` racine) |
| `eventId/eventName` | site (§5.4) |
| `locationId/locationName` | FK vers la `SalesLocation` du shop |
| `provider` | `DIGIFOOD` |
| `metadata` | `{ provider: 'digifood', source: 'webhook'\|'csv', type, medium, shortId, sessionId, cashier: {id, name}, payments: transactions[], discounts: discounts[], relationships, beforeDiscounts, softwareVersion, webhookDeliveryId }` |
| `rawData` | payload `data` complet |

Items : même patron que `upsertTransactionItems` (delete + createMany) :

| Colonne | Source |
|---|---|
| `externalItemId` | `item.id` (id de ligne de ticket) |
| `productId` | FK `SalesProduct` upserté (§5.2.3) |
| `productName` | `name` (+ variation) |
| `quantity` | quantité effective (× parents), signée |
| `unitPrice` | `price_pu / 100` (TTC — cohérent avec la convention basePrice=TTC) |
| `vat` | `parseFloat(tax_rate)` (⚠️ c'est le **taux** en % — même convention que `ti.vat` utilisé par les agrégats TVA) |
| `reduction` | `0` — `price_pu` Digifood est déjà **après** remise (les agrégats font `unitPrice*qty − reduction`) ; les montants avant remise (`before_discounts`, v26) vont en `metadata` seulement |
| `rawData` | ligne source + `parentItemId` |

Le tout dans **une seule `$transaction`** Prisma (règle perf : une transaction unique pour les écritures, `Promise.all` pour les lectures).

### 5.6 Détection de version POS

À chaque webhook, si `data.software.version` présent : majeure ≥ 26 → `posVersion = "26"`, sinon `"24"` (sur `DigifoodIntegrationConfig`). Purement informatif (affichage config + support) ; la logique d'ingestion reste pilotée par le contenu (`type`, `event`), pas par la version.

### 5.7 DTO / validation — souple par design

`digifood-webhook-payload.dto.ts` ne valide **strictement** que l'enveloppe (`event`, `id`, `timestamp`, `data` objet) et les champs indispensables (`data.id`, `items[]|refunded_items[]` avec `quantity`, `price_pu`). Tout le reste est optionnel/passthrough (`forbidNonWhitelisted` désactivé pour ce contrôleur) : Digifood ajoute des champs au fil des versions (`digifood-wh-version` en header), on ne doit pas rejeter un webhook pour un champ inconnu. La signature est calculée sur le **body brut re-trié**, pas sur le DTO filtré → utiliser le rawBody (activer `rawBody: true` sur ce endpoint ou re-sérialiser le body non filtré).

---

## 6. Auto-mapping via `external_reference` (décision 6)

Au moment de l'upsert produit (§5.2.3), si `external_reference` est non nul et qu'aucun `ProductMapping` n'existe pour ce produit :

1. chercher un `MenuItem` du tenant (non soft-deleted) dont `id === external_reference` **ou** `name` insensible à la casse === `external_reference` ;
2. si exactement 1 match → créer le mapping `{ autoMapped: true, confidence: 1.0, mappedBy: 'digifood:external_reference' }` ;
3. si 0 ou plusieurs matches → ne rien faire (le wizard tranchera).

L'utilisateur garde la main : le wizard affiche les mappings `autoMapped` et permet de les corriger (mécanique existante `autoMapped/confidence` déjà en table).

---

## 7. Import CSV d'historique (à construire de zéro)

### 7.1 Rôle

1. **Amorçage** : sans historique, catalogue et PDV ne se remplissent qu'au fil des ventes → wizard vide au démarrage. Un import CSV peuple produits + shops + ventes d'un coup.
2. **Rattrapage** : trou de réception > 24 h (retries expirés) ou onboarding d'un client avec un passif de ventes.

### 7.2 Design

- **Endpoint** : `POST /organizations/:organizationId/integrations/digifood/instances/:instanceId/import-csv` (JWT + permission admin intégrations, cohérent avec les routes instances existantes).
- **Upload** : multipart (`FileInterceptor`), dépendances `multer` + `csv-parse` (streaming, tolérant aux gros fichiers). Limite taille (ex. 20 Mo) + traitement par lots de 500 lignes.
- **Format attendu** (à caler sur l'export réel du back-office Digifood, cf. §9) — colonnes minimales :
  `order_id, placed_at, location_id, location_name, shop_id, shop_name, item_id, variation_id, item_name, variation, family, quantity, price_pu, tax_rate, external_reference, type`
- **Mapping de colonnes flexible** : la table dormante `CsvMapping` (`mappingType = 'digifood-orders'`, `mapping Json`, par tenant) stocke la correspondance colonnes CSV → champs normalisés. Mapping par défaut fourni ; écran de mapping front possible plus tard.
- **Pipeline** : chaque groupe de lignes partageant `order_id` est reconstruit en `normalizedOrder` puis passe par **le même** `ingestOrder(..., source='csv')` que le webhook → idempotence identique (upsert sur `order_id`) : réimporter un fichier ou importer une période chevauchant des webhooks déjà reçus est **sans double comptage**.
- **Dry-run** (même philosophie que `backfill-weezevent-prices`) : `?dryRun=true` (défaut **true**) → rapport sans écriture : nb d'orders détectés, nouveaux / déjà présents, produits nouveaux, lignes rejetées avec raison. `dryRun=false` exécute.
- **Rapport de sortie** : `{ ordersCreated, ordersUpdated, ordersSkipped, productsCreated, locationsCreated, rejectedRows: [{ line, reason }] }`.

---

## 8. Config & exposition API (décision 1)

Étendre `src/features/integrations/` (mêmes guards/permissions que les routes weezevent) :

| Route | Rôle |
|---|---|
| `GET  /organizations/:orgId/integrations/digifood/instances` | liste des `Integration` `provider=DIGIFOOD` (+ config jointe) |
| `POST /organizations/:orgId/integrations/digifood/instances` | créer : `{ name, webhookSecret }` → crée `Integration(provider=DIGIFOOD)` + `DigifoodIntegrationConfig` ; retourne l'**URL de webhook à communiquer à Digifood** : `POST {API_BASE}/webhooks/digifood/{tenantId}/{integrationId}` |
| `PATCH /organizations/:orgId/integrations/digifood/instances/:id` | maj `name`, `webhookSecret` (rotation), `enabled` |
| `DELETE /organizations/:orgId/integrations/digifood/instances/:id` | désactivation/suppression |
| `POST /organizations/:orgId/integrations/digifood/instances/:id/test` | « test » = vérifie qu'au moins un webhook a été reçu et signé avec succès (pas d'API à pinger) — retourne date/statut du dernier `IntegrationWebhookEvent` de l'intégration |
| `POST .../instances/:id/import-csv` | §7 |

- `webhookSecret` chiffré ; jamais renvoyé en clair par les GET (masqué `••••` + 4 derniers caractères).
- Les routes weezevent existantes (`weezevent/instances`…) sont adaptées au nouveau schéma (lecture/écriture via `Integration` + `WeezeventIntegrationConfig`), contrat API front **inchangé**.
- `GET /organizations/:orgId/integrations` liste les deux providers (ajouter `provider` dans la réponse).
- **Wizard Data Integration** : aucune modification backend nécessaire (il lit `SalesLocation`/`SalesProduct`/mappings, désormais peuplés par Digifood aussi). Évolution souhaitable (handoff front) : badge provider + filtre par intégration.
- **Crons Weezevent** : `weezevent-cron.service.ts` itère sur les intégrations pour lancer les syncs API → **filtrer `provider = WEEZEVENT`** (sinon le sync tenterait des appels API Weezevent sur des intégrations Digifood sans credentials). Le cron `monitorDataIntegrationIntegrity` (qualité des mappings) profite tel quel aux données Digifood.

---

## 9. Questions ouvertes (à poser à Digifood / à vérifier sur payloads réels)

1. **Provisioning** : procédure d'enregistrement de notre URL de webhook + remise du `secretKey` (portail ? support ?). Un secret par shop, par location ou par compte client ?
2. **Rotation de clé** : pendant une rotation (`digifood-wh-key-version`), y a-t-il tuilage (deux clés valides simultanément) ? → conditionne `webhookSecretPrevious`.
3. **Signes v26** : confirmer sur un payload réel qu'un ticket `type=refund` porte des quantités/total négatifs (l'ingestion normalise dans les deux cas, mais autant le savoir).
4. **Format d'export CSV** de leur back-office (colonnes exactes, séparateur, encodage, présence de `variation_id`) → cale le mapping par défaut §7.2.
5. **Rattrapage historique** : format/canal de leur procédure exceptionnelle (dump JSON des webhooks ? CSV ?) — si c'est du JSON au format webhook, on peut le rejouer directement dans `ingestOrder`.
6. **Devise** : tout est supposé en centimes d'euro ; confirmer pour les clients hors zone euro éventuels.
7. **`order.completed` v24** : les orders v24 sont « mutables » (`type='order'`) — un même order peut-il être ré-émis modifié ? (Notre upsert delete+recreate les items gère ce cas, mais confirmer.)

---

## 10. Ordre d'implémentation & déploiement

> Rappels : **jamais de `pnpm build`** par l'agent (l'utilisateur build et remonte les erreurs) ; ne pas toucher au serveur dev de l'utilisateur ; migrations **avant** le code en prod.

**Étape 1 — Migration DB additive** (§2) : enum `IntegrationProvider`, tables `WeezeventIntegrationConfig` + `DigifoodIntegrationConfig`, backfill config weezevent, colonnes `provider` (×4, default `WEEZEVENT`), `externalDeliveryId` + unique sur le journal webhook. Dev : `db execute` + `migrate resolve` (shadow DB cassée). Prod : `make prod-migrate` **avant** déploiement (100 % additif → zéro impact sur le code déployé actuel).

**Étape 2 — Refactor de renommage** (§3) : modèles/champs `@@map`/`@map` + renommage mécanique du code TS + adaptation des routes/services weezevent au schéma config (lecture via `WeezeventIntegrationConfig`). Commit dédié, aucun changement de comportement, vérifié par compilation (build par l'utilisateur). Les colonnes weezevent gelées de `Integration` sortent du modèle → tout usage résiduel casse au build (voulu).

**Étape 3 — Module `digifood`** (§4–5) : signature service (+ tests unitaires sur les exemples de la doc Digifood — payload d'exemple + secret de test), contrôleur webhook, normalisation (sale / refund v26 / refunded v24 + garde anti-double-comptage), ingestion (upserts référentiels, aplatissement children, transaction+items), auto-mapping `external_reference`.

**Étape 4 — Garde crons** (§8) : filtre `provider = WEEZEVENT` dans `weezevent-cron.service.ts` et tout itérateur d'intégrations qui appelle l'API Weezevent.

**Étape 5 — Routes de config Digifood** (§8) : CRUD instances + test + exposition de l'URL webhook.

**Étape 6 — Import CSV** (§7) : dépendances (`multer`, `csv-parse`), endpoint, `CsvMapping`, dry-run.

**Étape 7 — Tests bout en bout** (l'utilisateur build/relance l'API) :
- POST d'un payload `order.completed` d'exemple (doc Digifood) signé avec un secret de test → vérifier création produit/location/transaction/items + `provider=DIGIFOOD` ;
- rejouer le même webhook (même `id`) → dédup, aucune double écriture ;
- payload `order.refunded` v24 puis ticket v26 `type=refund` → montants négatifs, garde anti-doublon ;
- mapper via le wizard (location→Space, shop→PDV, produits→MenuItems) → vérifier dashboards revenus + stock Logistic décrémenté ;
- non-régression Weezevent : sync cron + webhook Weezevent inchangés (mêmes tables physiques) ;
- import CSV dry-run puis réel sur un petit fichier → rapport cohérent, réimport idempotent.

**Étape 8 — Handoff front** (`datafriday-web`, périmètre backend-first) : écran de config des clés Digifood (copie de l'écran Weezevent instances + affichage de l'URL webhook à donner à Digifood), badge provider dans le wizard, écran d'import CSV.

**Étape 9 — Déploiement** : migrations prod (`make prod-migrate`) → backend (étapes 2 à 6 ensemble ou séquencées, l'étape 2 pouvant partir seule en premier) → front. Communiquer l'URL webhook + obtenir le secret auprès de Digifood pour le premier client pilote.

**Plus tard (cosmétique, hors périmètre)** : renommage physique des tables `Weezevent*` → `Sales*` en base (`ALTER TABLE RENAME` + mise à jour des raw SQL + suppression des `@@map`), et drop des colonnes config gelées.

---

## 11. Ce qui ne change PAS

- Requêtes raw des agrégats revenus (`aggregation.service.ts`), dérivation stock (`deriveSalesRaw`), pricing (`menu-item-pricing.service.ts`) : **intactes** (noms physiques inchangés grâce à `@@map`).
- Tables physiques et données existantes : aucune migration de données (hors backfill config §2.2).
- Contrat API front des routes weezevent/mappings/spaces : inchangé.
- Simulation de vente Logistic, réconciliations, exports : intacts.
- Toute la chaîne Weezevent (crons, syncs, webhook Weezevent) : comportement identique (garde provider ajoutée aux crons).
