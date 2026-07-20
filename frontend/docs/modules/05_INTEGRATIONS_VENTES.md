# Intégrations & ventes — Weezevent / Digifood

> Domaine cartographie : **Intégrations & ventes**. Owner produit : Ulrich.
> Écran unique : `/data-integration/fb` (`DataIntegrationView.vue`, permission `menu.integration.fb`).
> Backend : modules `Integrations`, `Weezevent`, `Digifood`, `Mappings`.
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma (27 tables), chaque contrôleur
> backend (`integrations.controller.ts`, `weezevent.controller.ts`,
> `weezevent-analytics.controller.ts`, `webhook.controller.ts` Weezevent,
> `digifood-webhook.controller.ts`, `mappings.controller.ts`), chaque service de synchronisation,
> chaque composant frontend du wizard et chaque client API a été localisé et lu directement — y
> compris pour recouper et corriger un brouillon antérieur du même domaine. Objectif : qu'un dev ou
> un agent IA qui doit corriger un bug ici sache exactement où regarder et ce qu'il risque de casser
> ailleurs, sans relire le code.

---

## Ce que cette passe corrige ou ajoute par rapport au brouillon existant

Un brouillon antérieur (`docs/utiles/modules/05_DATA_INTEGRATION.md`) documentait uniquement le
wizard frontend (`components/integration/`) et son algorithme de matching. En relisant le code
réel de bout en bout (backend inclus, ce que le brouillon ne couvrait pas), plusieurs faits
nouveaux et un bug critique non documenté sont apparus :

1. **Bug critique confirmé, jamais documenté avant** : pour un tenant ayant **plus d'une**
   intégration Weezevent active, tous les appels API Weezevent (sync incrémental, moteur de
   bissection, refresh produit…) s'authentifient avec les identifiants de la **première** instance
   créée, quelle que soit l'intégration réellement ciblée par l'appel — voir Piège n°1. C'est le
   fait le plus structurant de ce document.
2. Le brouillon parlait du wizard comme s'il s'agissait de tout le domaine. En réalité, l'écran
   `/data-integration/fb` (`DataIntegrationView.vue`, 2934 lignes) fait AUSSI office d'écran de
   configuration des intégrations (créer/tester/supprimer une instance Weezevent ou Digifood,
   import CSV, purge) — il n'existe **aucun écran séparé** pour ça, contrairement à ce qu'on
   pourrait attendre d'après les routes backend `organizations/:orgId/integrations`.
3. Le brouillon ne mentionnait pas l'existence de **trois** mécanismes de synchronisation Weezevent
   distincts et faiblement couplés (legacy incrémental par curseur, bissection par job/chunk,
   cron planifié) — voir Piège n°2.
4. Trois nouveaux composants morts confirmés côté frontend (`StepSynchronize.vue`, marqué
   `@deprecated` dans son propre en-tête ; `IntegrationProviderCard.vue` ; `LocationListItem.vue`) en
   plus des 3 composables déjà connus comme morts (`useSpaceMapping.js`, `useShopMapping.js`,
   `useMenuMapping.js`, reconfirmés par un grep frais).
5. Le module backend `Mappings` (routes `location-space`/`location-shop`/`merchant-element`/
   `product-menu`) — absent du brouillon — s'avère être un point de couplage caché avec les domaines
   Aggregation et Analyse : voir Piège n°3.
6. Le modèle Prisma `Webhook`/`WebhookLog` (webhooks **sortants** de Data Friday) est un faux ami
   à ne pas confondre avec `IntegrationWebhookEvent` (webhooks **entrants** des providers de vente)
   — voir Piège n°4.

Le reste des constats du brouillon (4 étapes de wizard confirmées, Digifood n'en a que 3, module de
matching partagé `menuItemMatching.js` pour l'étape 3 seulement, composables morts, auto-guérison
structurelle côté backend plutôt que scan réactif) reste exact et n'est pas reproduit intégralement
ici — seuls les points modifiés ou approfondis le sont.

---

## Vue d'ensemble — comment les entités s'emboîtent

```
Tenant ──1:1 (colonnes legacy, activement lues par le cron ET par l'auth OAuth)──> weezeventClientId/
         weezeventClientSecret/weezeventOrganizationId/weezeventEnabled
         (mirroir de la PREMIÈRE Integration WEEZEVENT active — voir Piège n°1)
    │
    └──1:N──> Integration (provider WEEZEVENT | DIGIFOOD, une ligne = une instance nommée)
                  │
                  ├──1:1──> WeezeventIntegrationConfig (clientId, clientSecret chiffré AES-256-GCM, organizationId)
                  ├──1:1──> DigifoodIntegrationConfig (webhookSecret chiffré, keyVersion, posVersion)
                  ├──1:N──> IntegrationWebhookEvent (audit log de CHAQUE webhook entrant, Weezevent + Digifood)
                  │
                  └──1:N──> le lac de données brut ingéré (18 tables "Sales*"/"Weezevent*") :
                       SalesEvent ──1:N──> SalesLocation, WeezeventOrder, WeezeventPrice, WeezeventAttendee
                       SalesLocation ──1:N──> SalesTransaction
                       WeezeventMerchant ──(via merchantId, pas de FK stricte)──> SalesTransaction
                       WeezeventWallet ──1:N──> WeezeventUser, SalesTransaction (vendeur)
                       SalesTransaction ──1:N──> SalesTransactionItem ──1:N──> SalesPayment
                       SalesProduct ──1:N──> SalesTransactionItem, SalesProductVariant, SalesProductComponent
                       SalesProduct ──1:1──> ProductMapping ──> MenuItem  (pont vers 04_MENU_CATALOGUE.md)

Synchronisation (3 mécanismes distincts, voir Piège n°2) écrivent dans le lac ci-dessus :
    WeezeventSyncState   (curseur incrémental, legacy)
    WeezeventSyncJob ──1:N──> WeezeventSyncChunk   (bissection par plage de dates, "nouvelle" archi)

Rattachement au monde Espaces/Menu (modèles SANS FK Prisma stricte, sauf mention) :
    LocationSpaceMapping   (salesLocationId ←→ spaceId, AUCUNE relation @relation déclarée)
    LocationShopMapping    (salesLocationId ←→ spaceElementId, FK @relation(onDelete: Cascade) réelle
                             vers SpaceElement — voir 03_BUILDER_ESPACES.md)
    ProductMapping          (salesProductId ←→ menuItemId, FK Prisma réelles des deux côtés)

CsvMapping (tenant-scopé, mappingType='digifood-orders' aujourd'hui la seule valeur réellement
            utilisée) — persiste le mapping colonnes CSV ↔ champs métier pour l'import Digifood.

Webhook / WebhookLog — SANS RAPPORT avec ce qui précède : notifications SORTANTES de Data Friday
            vers des URL tierces (ex. "menu_item.created"). Faux ami, voir Piège n°4.
```

---

## Piège n°1 — Multi-instance Weezevent : l'authentification API ne suit PAS l'intégration ciblée

**C'est le bug le plus important de ce domaine, non documenté avant cette passe.**

Le modèle `Integration` est explicitement conçu pour supporter plusieurs instances Weezevent par
tenant (commentaire du modèle, `schema.prisma:228-232` : *"User-defined label, e.g. 'Stande',
'Hellfest 2025'"*). Mais la couche d'authentification OAuth qui parle réellement à l'API Weezevent
ne respecte pas cette granularité :

1. **Chaque écriture d'instance mirroir la PREMIÈRE instance active vers le tenant.**
   `WeezeventIntegrationService.mirrorActiveInstanceToTenant()`
   (`api-datafriday-staging/src/features/integrations/services/weezevent-integration.service.ts:196-224`)
   recopie `clientId`/`clientSecret` (déjà chiffré)/`organizationId` de la **première** `Integration`
   WEEZEVENT active (`orderBy: createdAt asc`) vers les colonnes legacy `Tenant.weezeventClientId`/
   `weezeventClientSecret`/`weezeventOrganizationId`/`weezeventEnabled`. Commentaire explicite du
   code (ligne 196-197) : *"so the existing sync/cron/webhook services (which read these columns)
   keep working"*.
2. **`WeezeventAuthService.getAccessToken(tenantId)`** (`weezevent-auth.service.ts:29-41`) — le
   point d'entrée OAuth unique utilisé par TOUT appel API Weezevent (bissection, sync incrémental,
   refresh produit, test de connexion excepté, voir plus bas) — est **caché par tenantId seul**,
   jamais par `integrationId`. La résolution des credentials (`getWeezeventConfig`,
   ligne 148-149) délègue à `OnboardingService.getWeezeventConfig(tenantId)`
   (`onboarding.service.ts:432-446`), qui lit **exclusivement** `Tenant.weezeventClientId`/
   `weezeventClientSecret` — jamais `Integration.weezevent.clientId/clientSecret`.
3. **Mais l'`organizationId` utilisé dans l'URL de la requête EST résolu correctement, PAR
   intégration.** Exemple pour le moteur de bissection : `WeezeventCollectWorkerService.start()`
   (`weezevent-collect-worker.service.ts:31-33`) lit
   `job.integration.organizationId` (le champ propre à CETTE `Integration`) et construit l'URL
   `/organizations/{organizationId}/transactions` (`weezevent-client.service.ts:67`) — mais avec un
   **token OAuth obtenu pour le tenant entier**, donc potentiellement émis pour le `clientId` d'une
   **autre** instance.

**Conséquence concrète** : pour un tenant avec une seule intégration Weezevent active, tout
fonctionne (l'instance mirroir EST la seule instance). Dès qu'un **second** provider Weezevent est
créé et activé (cas d'usage explicitement prévu par le modèle), toute synchronisation de la
**seconde** intégration s'authentifie avec le `clientId`/`clientSecret` de la **première**, tout en
appelant `/organizations/{organizationId_de_la_seconde}/...`. Un token OAuth `client_credentials`
Weezevent est scopé à l'organisation de son client — cet appel doit normalement échouer côté
Weezevent (401/403), ou dans le pire cas retourner des données incohérentes si Weezevent est
permissif sur le scope. Aucun test de non-régression multi-instance n'a été trouvé dans le code.

**Où regarder si tu dois corriger** : `WeezeventAuthService.getAccessToken`/`getWeezeventConfig`
doivent accepter un `integrationId` et résoudre les credentials via `Integration.weezevent`
(déchiffrées via `EncryptionService`), pas via `Tenant.weezevent*`. Le cache de token
(`tokenCache: Map<string, TokenCache>`, ligne 17) doit être re-clé par `integrationId`. Il faut
aussi vérifier tous les appelants de `weezeventClient.*`/`weezeventApiService.*` pour s'assurer
qu'ils transmettent déjà l'`integrationId` (la plupart le font, seule l'auth ne l'utilise pas).

**Ce qui n'est PAS affecté** : le **test de connexion** (`POST weezevent/test`,
`POST weezevent/instances/:id/test`) passe par `WeezeventAuthService.testCredentials()`
(`weezevent-auth.service.ts:56-85`), qui prend `clientId`/`clientSecret` en paramètres directs
(fournis par le body ou déchiffrés depuis l'instance ciblée) — **ce chemin est correct par
instance**, ce qui peut faire croire à tort qu'une nouvelle instance "fonctionne" (le test passe)
alors que sa synchronisation réelle échouera silencieusement ou utilisera les mauvais identifiants.

---

## Piège n°2 — Trois mécanismes de synchronisation Weezevent coexistent, faiblement couplés

Avant de toucher à "la sync", il faut savoir laquelle des trois :

| # | Mécanisme | Déclenchement | Modèles d'état | Granularité | Où |
|---|---|---|---|---|---|
| A | **Incrémental legacy (curseur)** | `POST /weezevent/sync` body `{type: 'transactions'\|'events'\|'products'}`, synchrone en process | `WeezeventSyncState` (1 ligne par `(tenantId, integrationId, syncType)`) | Pagination API standard (`page`/`per_page`), fenêtre de rattrapage 5 min pour les transactions | `WeezeventIncrementalSyncService` (`weezevent-incremental-sync.service.ts`) |
| A' | **Même service, exécution différée** | `POST /weezevent/sync` body `{type: 'orders'\|'prices'\|'attendees'}` → `queueService.queueWeezeventSyncType` (BullMQ, queue `DATA_SYNC`) | — | Par événement (`eventId` requis) | `DataSyncProcessor.processWeezeventPartialSync` (`core/queue/processors/data-sync.processor.ts:47-115`), appelle `WeezeventSyncService.syncOrders/syncPrices/syncAttendees` |
| B | **Bissection par plage de dates ("nouvelle archi")** | `POST /weezevent/sync/start` (manuel uniquement, aucun cron) | `WeezeventSyncJob` ──1:N──> `WeezeventSyncChunk` | Récursive : coupe la plage en deux si ≥ 500 items retournés (l'API Weezevent plafonne toujours à 500 items, `total_pages` toujours 1 — commentaire `weezevent-collect-worker.service.ts:5-8`) | `WeezeventCollectWorkerService` (collecte) + `WeezeventInsertWorkerService` (insertion, 5 chunks en parallèle, poll 500ms) |
| C | **Cron planifié** | 4 tâches `@Cron` dans `WeezeventCronService`, gate `WEEZEVENT_CRON_ENABLED !== 'false'` | Réutilise A (`WeezeventSyncState`) | Par tenant `Tenant.weezeventEnabled=true` puis par `Integration` du tenant | `weezevent-cron.service.ts` |

Détail de C (`weezevent-cron.service.ts`) :
- `EVERY_10_MINUTES` `syncRecentTransactions` (ligne 30) — incrémental transactions (mécanisme A).
- `EVERY_DAY_AT_3AM` `syncReferenceData` (ligne 84) — événements incrémental + `syncProducts` (catalogue complet).
- `0 2 * * 0` (dimanche 2h) `fullHistoricalSync` (ligne 131) — full sync forcé, limité aux 30 derniers jours.
- `0 6 * * *` `monitorDataIntegrationIntegrity` (ligne 192) — même requête SQL que `GET /weezevent/integrity`, log seul (pas de correction auto).

**Le garde anti-double-exécution du cron est du code mort** : `syncTracker.getRunningSyncs(...)`
(ligne 49) ne retournera jamais rien, car `SyncTrackerService.startSync`/`completeSync`/`failSync`
ne sont appelés **nulle part dans tout le backend** (vérifié par grep exhaustif sur
`api-datafriday-staging/src/`, pas seulement le module Weezevent). `SyncTrackerService` est injecté
dans `weezevent.controller.ts` (ligne 32) mais aucune route ne l'invoque non plus — c'est un
registre en mémoire jamais alimenté, donc la protection "ne pas relancer un sync déjà en cours"
n'existe pas réellement pour le cron.

**A et B sont totalement indépendants dans le code** (aucun appel croisé) — ils peuvent tourner en
parallèle sur la même intégration sans se coordonner, avec pour seule protection le refus de
`POST sync/start` si un job B est déjà `COLLECTING` pour cette intégration
(`weezevent.controller.ts:1432-1439`) — rien n'empêche un cron A de tourner en même temps qu'un job
B manuel.

---

## Piège n°3 — Le module `Mappings` est câblé au wizard seul, mais ses tables sont contournées par Aggregation et Analyse

Le module NestJS `Mappings` (`mappings.controller.ts`/`mappings.service.ts`) est le **seul**
consommateur déclaré de ses propres routes : aucun autre module n'importe `MappingsModule` ni
n'injecte `MappingsService` (`grep -rl "MappingsModule\|MappingsService" src/` ne retourne que
`app.module.ts` et les fichiers du module lui-même). Sur le papier, la classification de la
cartographie ("ProductMapping = domaine Intégrations & ventes") est donc juste au niveau module.

**Mais au niveau table**, `LocationSpaceMapping`, `LocationShopMapping` et `ProductMapping` sont un
référentiel technique partagé, écrit exclusivement par `MappingsService` (garde permission
`menu.integration.fb` sur toutes les routes d'écriture), et **lu en accès Prisma direct — en
court-circuitant totalement `MappingsService`** — par :
- `AggregationService` : `locationSpaceMapping.findFirst` (`aggregation.service.ts:233`, vérifie le
  mapping avant d'agréger), raw SQL `LEFT JOIN "WeezeventLocationShopMapping"`
  (`aggregation.service.ts:121`), raw SQL `JOIN "WeezeventProductMapping"`
  (`aggregation.service.ts:284` — **la jointure centrale du job d'agrégation**, celle qui résout
  quel `MenuItem` correspond à chaque ligne de vente), `locationShopMapping.count`
  (`aggregation.service.ts:591`).
- `AnalyseService` : raw SQL `LEFT JOIN "WeezeventProductMapping"` (`analyse.service.ts:156-158`)
  pour résoudre le `menuItemId` d'un produit vendu dans le breakdown minute par minute.

**Risque concret** : la logique "step1 est-il mappé ?" existe en double — une fois dans
`MappingsService.getIntegrationProgress` (`mappings.service.ts:735-941`), une fois réimplémentée
dans `AggregationService` (`aggregation.service.ts:233`). Si l'une évolue sans l'autre, le wizard et
le job d'agrégation peuvent diverger sur l'état "mappé/pas mappé" d'une même intégration.

**Ce qui n'est PAS un couplage caché** : les routes `merchant-element` du contrôleur `Mappings` ne
pointent PAS vers un modèle Prisma dédié — elles lisent/écrivent le **même** modèle
`LocationShopMapping` que les routes `location-shop`, en réutilisant `salesLocationId` pour y
stocker soit un id de location, soit un `weezeventMerchantId` (`mappings.service.ts:367-384`). C'est
une convention applicative (2 façons différentes d'identifier "quel élément externe pointe vers quel
shop"), pas une table séparée.

---

## Piège n°4 — `Webhook`/`WebhookLog` ≠ `IntegrationWebhookEvent` : deux systèmes de webhook sans rapport

Le nom seul est trompeur dans ce domaine :

| Modèle | Sens | Direction | Où vit le code |
|---|---|---|---|
| `IntegrationWebhookEvent` (`schema.prisma:1204-1240`, table physique `WeezeventWebhookEvent`) | Un événement de vente reçu (Weezevent ou Digifood) | **Entrant** — le provider notifie Data Friday | `webhook.controller.ts` (Weezevent), `digifood-webhook.controller.ts` |
| `Webhook`/`WebhookLog` (`schema.prisma:2039-2072`) | Une souscription **sortante** configurée par le tenant (`url`, `events: ["menu_item.created", ...]`) | **Sortant** — Data Friday notifie une URL tierce | Module core `Webhooks`, hors périmètre de ce document |

Ne pas confondre en code ni en synthèse d'incident : "un webhook a échoué" peut désigner l'un ou
l'autre système selon le contexte, avec des tables, des garanties de sécurité (HMAC entrant vs HMAC
sortant) et des consommateurs totalement différents.

---

## Piège n°5 — Le dédoublonnage `IntegrationWebhookEvent` ne protège réellement que Digifood

`IntegrationWebhookEvent` porte `@@unique([integrationId, externalDeliveryId])`
(`schema.prisma:1233`). C'est le mécanisme de dédup utilisé explicitement côté Digifood
(`digifood-webhook.controller.ts:111-125`, dédup sur `payload.id`, stable 24h entre retries).

**Côté Weezevent, `externalDeliveryId` n'est jamais renseigné** — vérifié directement dans
`webhook.controller.ts:105-114` : le `create()` de `IntegrationWebhookEvent` n'écrit que
`{tenantId, integrationId, eventType, method, payload, signature, processed: false}`, sans
`externalDeliveryId`. Comme ce champ est `String?` nullable, Postgres autorise autant de lignes
`NULL` que l'on veut pour une même `(integrationId, externalDeliveryId)` — la contrainte unique ne
joue donc **jamais** côté Weezevent. Un retry de webhook Weezevent (fréquent si la réponse HTTP met
plus de quelques secondes) crée une nouvelle ligne d'audit à chaque tentative, et **retraite
entièrement l'événement** (`WebhookEventHandler.processEvent` ne connaît pas la notion de "déjà vu"
côté Weezevent). Impact limité en pratique car le traitement aval est lui-même idempotent
(`syncSingleTransaction` fait un upsert par `externalId`), mais la table `IntegrationWebhookEvent`
peut accumuler des doublons d'audit pour Weezevent, et chaque retry déclenche un aller-retour
complet vers l'API Weezevent (`syncSingleTransaction` re-fetch la transaction, ne se contente pas du
payload webhook).

---

## Modèles Prisma

### Integration — une instance d'intégration nommée

**Où vit le code** : `schema.prisma:233-269` (table physique `@@map("WeezeventIntegration")` — nom
hérité, distinct du nom de modèle Prisma).

**Champs clés** :

| Champ | Sens |
|---|---|
| `provider` (`WEEZEVENT`\|`DIGIFOOD`) | Discriminant. Un tenant peut avoir N intégrations des deux providers. |
| `name` | Libellé libre choisi par l'utilisateur (ex. "Hellfest 2025") — permet plusieurs instances du même provider. |
| `enabled` | Soft-toggle. Les crons/sync ne traitent que les intégrations `enabled=true`. |

**Pourquoi ce design** : séparer `Integration` (identité + provider) des tables 1-1
`WeezeventIntegrationConfig`/`DigifoodIntegrationConfig` (credentials) permet un modèle
multi-provider propre sans colonnes toujours-nulles. Commentaire du schéma (`:228-232`) référence
explicitement un plan de renommage en 2 étapes (`PLAN_INTEGRATION_DIGIFOOD §2.2`) — les colonnes
`clientId`/`clientSecret`/`organizationId` autrefois portées directement par `Integration` sont
**gelées** et doivent disparaître à l'étape 2 du plan, jamais franchie à ce jour.

**Ce qui en dépend** : toutes les tables du lac de données (`SalesEvent`, `SalesLocation`,
`SalesProduct`, `SalesTransaction`, `WeezeventMerchant/User/Wallet/Order/Price/Attendee`,
`SalesProductVariant/Component`, `WeezeventSyncState/Job`, `IntegrationWebhookEvent`,
`ProductMapping`) référencent `integrationId` en cascade (`onDelete: Cascade` sur `Integration` —
supprimer une intégration purge tout son lac de données). **Impact si tu modifies le cycle de vie
d'`Integration`** : voir Piège n°1 pour le cas multi-instance.

### WeezeventIntegrationConfig / DigifoodIntegrationConfig — les credentials

**Où vit le code** : `schema.prisma:272-291`.

- `WeezeventIntegrationConfig.clientSecret` : chiffré AES-256-GCM par `EncryptionService`
  (`core/encryption/encryption.service.ts:25-36`), clé `ENCRYPTION_KEY` (env, 64 hex = 32 octets,
  le service refuse de démarrer sans — lignes 11-17). Format stocké : `iv:authTag:encryptedData`
  (hex). `clientId`/`organizationId` sont en clair.
- `DigifoodIntegrationConfig.webhookSecret` : même chiffrement. **Jamais renvoyé en clair au
  front** — `maskSecret()` (`digifood-integration.service.ts:55-63`) le déchiffre côté serveur puis
  ne renvoie que `••••` + 4 derniers caractères. `keyVersion`/`posVersion` sont des métadonnées
  informatives mises à jour à réception de webhook (headers `digifood-wh-key-version`,
  `software.version`).

**Aucun des deux modèles n'a de `tenantId`** — l'isolation multi-tenant passe uniquement par
`integrationId → Integration.tenantId`. Pas de relation directe depuis `Tenant` non plus.

### IntegrationWebhookEvent — le journal d'audit des webhooks entrants

**Où vit le code** : `schema.prisma:1204-1240` (table physique `WeezeventWebhookEvent`, nom hérité).

**Champs clés** :

| Champ | Sens |
|---|---|
| `eventType`/`method` | `transaction`\|`refill`\|`transfer`\|`wallet` pour Weezevent ; `order.completed`\|`order.refunded` pour Digifood (`eventType`), `create`\|`update`\|`delete` (Weezevent) ou `sale`\|`refund`\|`order` normalisé depuis `data.type` (Digifood) pour `method`. |
| `payload` (Json) | Corps brut complet du webhook — trace de rejeu/debug. |
| `signature` | Header brut reçu (`X-Weezevent-Signature` ou `digifood-wh-signature`). |
| `externalDeliveryId` | **Renseigné uniquement par Digifood** (voir Piège n°5) — clé de dédup 24h. |
| `processed`/`processedAt`/`error`/`retryCount` | État du traitement asynchrone. `retryCount` est incrémenté en cas d'erreur mais **rien ne le relit pour retenter automatiquement** — c'est un compteur d'observabilité, pas un mécanisme de retry actif. |

**Ce qui en dépend** : `POST digifood/instances/:id/test` lit le dernier événement de l'intégration
(`findFirst orderBy createdAt desc`) pour simuler un "test de connexion" sans appel API sortant
(Digifood n'a rien à pinger, c'est Data Friday qui reçoit).

### CsvMapping — mapping persistant colonnes CSV ↔ champs métier

**Où vit le code** : `schema.prisma:2076-2088`. Champs : `mappingType` (String libre — en pratique
**une seule valeur utilisée aujourd'hui**, `'digifood-orders'`, vérifiée dans
`digifood-csv-import.service.ts:247,261,271`), `mapping` (Json, `{champ_normalisé: "Colonne CSV"}`),
`tenantId`. **Une seule ligne par tenant** (upsert sur `where: {tenantId, mappingType}`), pas de
relation à une `Integration` précise — le mapping est global au tenant, pas par instance Digifood.

**Pourquoi ce design** : un tenant Digifood exporte généralement toujours le même format de CSV
depuis son POS — un mapping par tenant (pas par instance) évite de le ressaisir à chaque import.

### Le lac de données brut — Sales* / Weezevent*

Dix-sept tables, toutes structurées sur le même patron : `id`, `weezeventId`/`externalId` (id côté
provider), `tenantId`, `integrationId`, un bloc de champs métier, `metadata`/`rawData` (Json, corps
brut de l'API), `createdAt`/`updatedAt`/`syncedAt`. **Aucun `SalesEvent`/`SalesLocation`/
`SalesTransaction`/`SalesProduct`/`WeezeventMerchant`/`WeezeventWallet`/`SalesProductVariant`/
`SalesProductComponent` n'a de statut typé (enum)** — tous les champs `status`/`type` sont des
`String` libres.

| Modèle | Ligne schema | Table physique | Contrainte unique | Rôle |
|---|---|---|---|---|
| `SalesEvent` | `853-896` | `WeezeventEvent` | `[tenantId, integrationId, externalId]` | Un événement/site Weezevent. `configurationId` (String, **pas de FK Prisma**) est posé à l'étape 1 du wizard (mapping espace). |
| `SalesLocation` | `932-967` | `WeezeventLocation` | idem | Un point de vente Weezevent brut (avant tout mapping vers `SpaceElement`). |
| `SalesProduct` | `969-1020` | `WeezeventProduct` | idem | Un produit du catalogue provider. `components`/`variants` (Json) **coexistent** avec les tables relationnelles `SalesProductComponent`/`SalesProductVariant` sans qu'il soit établi dans le schéma laquelle fait foi — à vérifier côté service avant de s'appuyer sur l'une plutôt que l'autre. |
| `SalesTransaction` | `1103-1163` | `WeezeventTransaction` | idem | Une transaction de caisse/billetterie. `eventName`/`merchantName`/`locationName` sont des copies dénormalisées à côté des FK — source de désync possible si l'entité liée est renommée. **Seules les transactions `status==='V'` (Validated) sont conservées par le moteur de bissection** (`weevezent-incremental-sync.service.ts:757`). |
| `SalesTransactionItem` | `1242-1273` | `WeezeventTransactionItem` | — | Une ligne de vente. **Aucun `tenantId`** — isolation uniquement via `transactionId → SalesTransaction.tenantId`. |
| `SalesPayment` | `1275-1300` | `WeezeventPayment` | — | Un paiement associé à une ligne. **Aucun `tenantId`**, `walletId` sans FK Prisma déclarée. |
| `SalesProductVariant` | `1326-1357` | `WeezeventProductVariant` | `[tenantId, integrationId, weezeventId]` | Variante d'un produit compound. |
| `SalesProductComponent` | `1359-1389` | `WeezeventProductComponent` | idem | Composition d'un produit compound Weezevent — homonyme de `MenuComponent`/`ComponentComponent` (04_MENU_CATALOGUE.md) mais **aucune relation croisée**, deux systèmes de composition indépendants. |
| `WeezeventMerchant` | `898-931` | `WeezeventMerchant` | `[tenantId, integrationId, weezeventId]` | Un marchand/stand Weezevent. |
| `WeezeventUser` | `1022-1063` | `WeezeventUser` | idem | Un client final Weezevent (GDPR consent inclus). |
| `WeezeventWallet` | `1064-1102` | `WeezeventWallet` | idem | Un portefeuille cashless. |
| `WeezeventOrder` | `1433-1467` | `WeezeventOrder` | idem | Une commande billetterie — usage métier applicatif non exploré au-delà du controller lui-même. |
| `WeezeventPrice` | `1468-1502` | `WeezeventPrice` | idem | Un tarif catalogue Weezevent (distinct du prix de vente réel en caisse). |
| `WeezeventAttendee` | `1503-...` | `WeezeventAttendee` | idem | Un participant — consommé par `SpacesService`/`SpaceDashboardService` pour la fréquentation. |

**Relations sans `onDelete` explicite** (donc `RESTRICT` par défaut Postgres, à confirmer
volontaire avant tout refactor) : `SalesLocation.event`, `SalesTransaction.event/merchant/location/
sellerWallet`, `SalesTransactionItem.product`, `WeezeventUser.wallet`, `WeezeventOrder.event`,
`WeezeventPrice.event/product`, `WeezeventAttendee.event`.

### ProductMapping — le pont vers le catalogue menu

**Où vit le code** : `schema.prisma:1304-1324` (table physique `WeezeventProductMapping`).

| Champ | Sens |
|---|---|
| `salesProductId` (colonne physique `weezeventProductId`) | FK vers `SalesProduct`, `@@unique` — **un produit externe ne peut être mappé qu'à un seul `MenuItem`**. |
| `autoMapped` | `true` si posé automatiquement (voir `tryAutoMapProduct`, Digifood ; ou suggestion acceptée côté wizard). |
| `confidence` | Score de similarité au moment du mapping (nullable — absent si posé manuellement). |
| `mappedBy` | Qui/quoi a posé le mapping (libre). |

**Pourquoi ce design** : `@@unique([salesProductId])` garantit qu'un produit externe pointe vers un
seul article interne — l'inverse n'est pas contraint (`MenuItem.salesMappings` peut recevoir
plusieurs `ProductMapping`, ex. deux variantes Weezevent du même burger).

**Ce qui en dépend** :
- `weezevent-analytics.controller.ts` (`margin-analysis`) lit `mappings[0]` sans `orderBy` — sans
  risque réel puisque la contrainte unique garantit 0-ou-1 résultat.
- `POST /menu-items/:id/apply-weezevent-price` (04_MENU_CATALOGUE.md, côté MenuItem) résout le
  mapping avant de propager un prix — voir section dédiée plus bas.
- `AggregationService` (`aggregation.service.ts:284`) en fait la jointure centrale de son job
  d'agrégation par minute.

### LocationSpaceMapping / LocationShopMapping — le pont vers Espaces/Builder

**Où vit le code** : `schema.prisma:2277-2304` (table physiques `WeezeventLocationSpaceMapping` /
`WeezeventLocationShopMapping`).

- `LocationSpaceMapping` : *"cette location Weezevent/Digifood correspond à TEL Space"*
  (granularité espace entier, étape 1 du wizard). **Aucune relation `@relation` déclarée** — ni vers
  `Tenant`, ni vers `Space`, ni vers `SalesLocation` : ce sont de purs scalaires sans FK Prisma, donc
  aucun `onDelete` défini au niveau ORM (à vérifier au niveau migration SQL brute si un besoin
  d'intégrité plus strict se présente).
- `LocationShopMapping` : *"cette location correspond à TEL shop (`SpaceElement`)"* (étape 2 du
  wizard). **A une vraie FK** : `spaceElement SpaceElement @relation(..., onDelete: Cascade)`, avec
  un commentaire de schéma explicite (`:2300-2303`) sur le pourquoi : le `Cascade` ne s'applique
  QUE quand un `SpaceElement` est réellement supprimé (espace/config supprimé) — jamais lors d'un
  simple save du builder, dont la reconciliation ne supprime plus jamais un élément mappé (voir
  03_BUILDER_ESPACES.md, correction du bug historique "PDV démappés").

Les deux partagent `@@unique([tenantId, salesLocationId])` : une location externe ne peut être
mappée qu'à un seul espace / un seul shop par tenant.

---

## Backend — module `Integrations`

**Où vit le code** : `api-datafriday-staging/src/features/integrations/`. Contrôleur unique
`integrations.controller.ts` (458 lignes), base `@Controller('organizations/:organizationId/integrations')`,
`@UseGuards(JwtDatabaseGuard)` global. Chaque route résout le tenant via `resolveTenantId()`
(lignes 448-457) — **rejette toute `organizationId` ≠ tenant du JWT** (garde IDOR explicite,
commentaire "OWASP A01"). `integrations.service.ts` est une classe **vide**, non utilisée — toute la
logique vit dans `services/weezevent-integration.service.ts`, `services/digifood-integration.service.ts`,
`services/webhook-integration.service.ts`.

**Toutes les routes** :

| Route | Permission | Rôle |
|---|---|---|
| `GET /` | authentifié seul | `{weezevent, digifood, webhooks}` en parallèle |
| `POST /weezevent/test` | `menu.integration.fb` | Teste des credentials **fournis dans le body**, sans les enregistrer |
| `PATCH /weezevent` | `menu.integration.fb` | Legacy single-config : valide si credentials fournis puis `updateConfig` |
| `GET /weezevent` | authentifié seul | Legacy single-config |
| `GET /weezevent/instances` | authentifié seul | Liste multi-instance |
| `POST /weezevent/instances` | `menu.integration.fb` | Valide credentials puis crée (+mirroir tenant, voir Piège n°1) |
| `PATCH /weezevent/instances/:instanceId` | `menu.integration.fb` | Si clientId/clientSecret changent, revalide (complète avec les creds stockés déchiffrés si partiels) |
| `DELETE /weezevent/instances/:instanceId` | `menu.integration.fb` | Suppression (cascade tout le lac, voir modèle `Integration`) |
| `POST /weezevent/instances/:instanceId/test` | `menu.integration.fb` | Teste creds fournis OU stockés déchiffrés |
| `PATCH /webhooks` | `menu.integration.fb` | Config webhook Weezevent legacy (secret/enabled sur `Tenant`) |
| `GET /webhooks` | authentifié seul | idem lecture |
| `GET /digifood/instances` | authentifié seul | Liste |
| `POST /digifood/instances` | `menu.integration.fb` | Crée `Integration`+`DigifoodIntegrationConfig`, retourne l'URL de webhook à configurer côté Digifood |
| `PATCH /digifood/instances/:instanceId` | `menu.integration.fb` | name/enabled/rotation secret |
| `DELETE /digifood/instances/:instanceId` | `menu.integration.fb` | Suppression |
| `POST /digifood/instances/:instanceId/test` | `menu.integration.fb` | **Pas d'appel API** — retourne le dernier `IntegrationWebhookEvent` reçu |
| `POST /digifood/instances/:instanceId/import-csv` | `menu.integration.fb` | Multipart, parse CSV, `dryRun` par défaut `true` — voir flux dédié |

Note : `GET /weezevent/instances`, `GET /digifood/instances`, `GET /`, `GET /webhooks` n'ont aucune
`@RequirePermissions` — juste l'authentification. Toutes les mutations sont gated
`menu.integration.fb`.

### Flux `POST digifood/instances/:instanceId/import-csv`

1. Le controller lit le fichier multipart + un mapping JSON optionnel, applique `dryRun` par défaut.
2. `DigifoodCsvImportService.importCsv()` (`digifood-csv-import.service.ts`) : résout le mapping
   (priorité mapping fourni > `CsvMapping` persisté > mapping identité par défaut), le **persiste**
   dans `CsvMapping` s'il est fourni explicitement (même en dry-run), parse le CSV (délimiteur
   auto-détecté, complétion par synonymes d'en-têtes connus), rejette les lignes invalides
   (`order_id`/`item_name`/`quantity`/prix manquants, ou marquées annulées).
3. Regroupe par `order_id`, reconstruit chaque commande en `NormalizedOrder` — **le même contrat
   objet que le webhook** — puis appelle **le même** `DigifoodIngestionService.ingestOrder(...,
   'csv')` que le webhook, par lots de 500, séquentiellement.
4. **Idempotence garantie par construction** : `order_id` du CSV = même `externalId` que celui posé
   par le webhook — un chevauchement CSV/webhook ne double-compte jamais (upsert par clé unique).

---

## Backend — module `Digifood`

**Où vit le code** : `api-datafriday-staging/src/features/digifood/`, bien enregistré dans
`app.module.ts:20,145` (pas de gotcha "module non monté" comme `KvModule`).

### Route webhook (`digifood-webhook.controller.ts`)

`POST /webhooks/digifood/:tenantId/:integrationId`, `@Public()` (pas de JWT — Digifood n'a pas de
token Data Friday).

**Vérification exacte** (lignes 61-87) :
1. `Integration` doit exister, appartenir au `tenantId`, être `provider='DIGIFOOD'` — sinon 400.
2. Doit être `enabled` — sinon 401.
3. Doit avoir un `webhookSecret` configuré — sinon 401 (fail-closed).
4. Header `digifood-wh-signature` doit être présent — sinon 401.
5. Secret déchiffré, puis `DigifoodSignatureService.validateSignature()`.

**Calcul de signature** (`digifood-signature.service.ts:13-26`) : HMAC-SHA256 (hex) sur
`JSON.stringify(sortObjectDeep(body))` — **le JSON est trié récursivement par clés à toutes les
profondeurs avant signature** (contrairement au webhook Weezevent qui signe le JSON brut non trié —
différence de contrat explicitement commentée dans le code). Comparaison en temps constant
(`crypto.timingSafeEqual`).

Un header `digifood-wh-key-version` (rotation de clé) est comparé à `DigifoodIntegrationConfig.keyVersion` ;
en cas de changement, purement informatif (`warn` + mise à jour du champ).

### Traitement du payload — `DigifoodIngestionService.ingestOrder()` (383 lignes)

Point d'entrée commun webhook/CSV. Ordre exact des écritures :
1. **Garde anti-doublon refund** (`isDuplicateRefund`) — évite le double comptage quand un client
   migre POS v24→v26 et que Digifood émet deux formes de webhook pour le même remboursement.
2. `upsertSiteAsEvent` → **`SalesEvent`** (upsert `tenantId_integrationId_externalId`).
3. `upsertShopAsLocation` → **`SalesLocation`** (upsert).
4. `upsertProducts` → **`SalesProduct`** (upsert par produit unique du ticket) + tentative
   d'**auto-mapping** `ProductMapping` via `external_reference` (`tryAutoMapProduct`) : ne crée un
   mapping **que si** aucun n'existe déjà pour ce produit **et** que `external_reference` matche
   **exactement un** `MenuItem` du tenant (id exact ou nom insensible à la casse) — 0 ou plusieurs
   matches = rien n'est créé, le produit reste non mappé (la vente est quand même enregistrée avec
   `productId: null`).
5. **Dans une seule `$transaction` Prisma** (donc atomique) : upsert `SalesTransaction` +
   delete/recreate `SalesTransactionItem`.

**Atomicité partielle** : seule l'étape 5 est transactionnelle. Les upserts des étapes 2-4 sont
avant, hors transaction — acceptable car tous idempotents et rejouables en cas d'échec partiel.

**Traitement asynchrone** : le webhook retourne `200` **avant** traitement complet
(`setImmediate`), les erreurs de traitement n'affectent jamais la réponse HTTP.
`DigifoodWebhookHandler.processEvent` recharge l'événement, sort si déjà `processed`, appelle
`normalizeOrder` puis `ingestOrder`, marque `processed:true` en succès ou `error`+`retryCount++` en
échec (sans retry automatique).

---

## Backend — module `Weezevent`

**Où vit le code** : `api-datafriday-staging/src/features/weezevent/` — trois contrôleurs.

### `weezevent.controller.ts` (1645 lignes) — `@Controller('weezevent')`

Classe entière `@UseGuards(JwtDatabaseGuard)`. Routes mutantes/admin en plus `@RequirePermissions('menu.integration.fb')`.

| Route | Rôle |
|---|---|
| `GET transactions` (+`:id`) | Liste/détail paginé depuis la DB, avec items/paiements/event/merchant/location |
| `GET raw-transactions` | Bypass la DB — appel live à l'API Weezevent (outil de debug) |
| `POST sync` | Déclencheur manuel — voir Piège n°2, mécanisme A/A' selon `type` |
| `GET sync/status` | État agrégé : sync incrémental + compteurs + stats queue BullMQ + progression job actif |
| `GET integrity` | Health-check SQL brut : mappings `WeezeventLocationShopMapping` orphelins, `WeezeventProductMapping` pointant vers un `MenuItem` supprimé, doublons produits/locations |
| `DELETE sync/state` | Supprime les lignes `WeezeventSyncState` (force un resync complet) |
| `DELETE data` | Purge complète, transactionnelle, de toutes les tables synchronisées pour un tenant/intégration |
| `GET events`/`locations`/`merchants`/`products` | Listes paginées, filtrables |
| `GET products/:productId/refresh` | Refresh "local-first" : dérive le prix depuis les ventes si `basePrice` null/0, n'appelle l'API live qu'en dernier recours, ne laisse jamais un refresh écraser un prix dérivé par 0 |
| `POST backfill-transaction-item-products` | Répare les `SalesTransactionItem.productId=null` en résolvant/créant le `SalesProduct` via `rawData.item_id` (`dryRun` supporté) |
| `POST products/:productId/map` (+`GET products/mappings`, `DELETE products/:productId/map`) | Upsert `ProductMapping` (voir modèle) — **jamais** de recalcul de prix (action séparée, voir MenuItems) |
| `GET orders`/`prices`/`attendees` | Listes paginées des entités secondaires |
| `POST sync/start`, `GET sync/status/:jobId`, `GET sync/jobs`, `GET sync/jobs/:jobId/stats`, `DELETE sync/jobs/:jobId` | Moteur de bissection (mécanisme B, voir Piège n°2) |

### `weezevent-analytics.controller.ts` (362 lignes) — `@Controller('weezevent/analytics')`

`@UseGuards(JwtDatabaseGuard)` seul — **aucune** `@RequirePermissions` : tout utilisateur
authentifié du tenant peut appeler ces 4 routes analytiques en lecture seule.

| Route | Calcul |
|---|---|
| `GET sales-by-product` | Agrégat en mémoire `unitPrice × quantity` par `productId` |
| `GET sales-by-event` | Agrégat en mémoire `amount` par `eventId` |
| `GET margin-analysis` | Voir formule ci-dessous |
| `GET top-products` | Top N par `revenue` |

Les quatre routes chargent **tout** le jeu de transactions en mémoire (pas d'agrégation côté DB, pas
de pagination) — risque de charge sur un gros volume, cohérent avec un pattern déjà signalé ailleurs
dans le projet (`project_predict_toolbox_perf_audit.md`).

**Formule `margin-analysis` vérifiée caractère près** (lignes 208-247) :
```
pour chaque ligne de vente :
    sales = WeezeventTransactionItem.unitPrice × quantity
    mapping = item.product?.mappings?.[0]           // 0-ou-1 garanti par @@unique(salesProductId)
    si mapping.menuItem existe :
        cost += MenuItem.totalCost × quantity
    sinon :
        unmappedItems++    // exclu du coût, MAIS sa vente reste comptée dans totalSales
totalMargin = totalSales - totalCost
marginPercent = totalMargin / totalSales × 100
```
Points factuels à retenir : **coût = `MenuItem.totalCost`** (pas de champ de coût côté Weezevent),
**vente = `unitPrice` brut stocké** (pas la valeur TTC/HT normalisée utilisée ailleurs dans ce même
contrôleur pour `GET products`, ni celle de `MenuItemPricingService`). Un produit non mappé
**gonfle la marge affichée** : sa vente compte dans `totalSales`, son coût est absent de `totalCost`.
`mappingRate` est bien retourné pour juger de la fiabilité, mais `marginPercent` lui-même n'est pas
ajusté. **Cette formule est indépendante** de `MenuItemPricingService.computePricing` (04_MENU_CATALOGUE.md) —
ne pas supposer qu'elles partagent une logique commune de TVA/remise.

### `webhook.controller.ts` (155 lignes) — webhook Weezevent entrant

`POST /webhooks/weezevent/:tenantId/:integrationId`, `@Public()`. Signature HMAC-SHA256 sur
`JSON.stringify(payload)` brut (non trié, contrairement à Digifood), fail-closed sur secret/header
manquant. Persiste `IntegrationWebhookEvent` (sans `externalDeliveryId`, voir Piège n°5), traite en
async (`setImmediate`). Le handler (`webhook-event.handler.ts`) route par `eventType` :
- `transaction` create/update → **re-fetch la transaction depuis l'API live** (`syncSingleTransaction`),
  ne fait pas confiance au payload embarqué ; `delete` → `markTransactionAsDeleted`, qui **ne fait
  rien de réel aujourd'hui** (met juste à jour `syncedAt`, commentaire du code : *"For now, we'll
  just log it"* — pas de vrai soft-delete malgré le nom de la méthode).
- `order` create/update → resynchronise TOUTES les commandes de l'événement (pas d'upsert ciblé).
- `product` update → resynchronise TOUT le catalogue produit (pas scopé au produit modifié).

---

## Backend — module `Mappings`

**Où vit le code** : `api-datafriday-staging/src/features/mappings/` (`mappings.controller.ts`
538 lignes, `mappings.service.ts` 984 lignes). Voir Piège n°3 pour la frontière avec
Aggregation/Analyse.

**Toutes les routes** :

| Route | Modèle manipulé | Rôle |
|---|---|---|
| `GET/POST/DELETE location-space(/:locationId)` | `LocationSpaceMapping` | Étape 1 : location ↔ Space. `POST` stamp aussi `configurationId` sur `SalesEvent` |
| `GET/POST/POST bulk/DELETE location-shop(/:locationId)` | `LocationShopMapping` | Étape 2 : location ↔ shop. `DELETE` déclenche `SpacesService.deleteElementIfUnreferenced` (nettoyage cascade du `SpaceElement` orphelin) |
| `GET/POST/POST bulk/DELETE merchant-element(/:merchantId)` | `LocationShopMapping` (même table, `salesLocationId` réutilisé pour un `weezeventMerchantId`) | Convention alternative de mapping merchant ↔ shop |
| `GET product-menu/stats`, `GET/POST bulk/DELETE product-menu(/:productId)` | `ProductMapping` | Étape 3 : produit ↔ MenuItem. `POST bulk` en SQL brut, rattache aussi l'espace courant via `SpaceMenuItem.createMany` |
| `GET progress`, `GET progress/:locationId` | 5 étapes calculées : `LocationSpaceMapping`, merchants vus dans `SalesTransaction` croisés `LocationShopMapping`, `ProductMapping.count` (non scopé location), `AggregationJobLog.count`, `SpaceRevenueMinuteAgg.count` | Barre de progression globale/par intégration |
| `GET summary/:locationId` | Combine mapping + `AggregationJobLog` | Résumé affiché par `WizardSuccess.vue` |

---

## Frontend — écran unique `/data-integration/fb`

**Route** : `router/index.js:366-369`, composant `DataIntegrationView.vue`, permission
`menu.integration.fb`, `keepAlive: true` (d'où un hook `activated()` qui recharge les mappings à
chaque retour sur l'écran).

### `DataIntegrationView.vue` (2934 lignes) — liste + configuration + déclenchement du wizard

C'est **à la fois** l'écran de liste des intégrations, l'écran de configuration (créer/tester/
modifier/supprimer une instance Weezevent ou Digifood, import CSV, purge) et le point d'entrée du
wizard — il n'existe **aucun** composant séparé pour la configuration (voir correction n°2
en tête de document). Options API (pas de `setup()`), tout l'état vit dans `data()`.

Appelle directement `aggregation.api.js` et `mapping.api.js::getLocationSpaceMappings` — **aucun
store Vuex dédié, aucun composable dédié**. Fonctions notables appelées depuis le drawer de
config : `testWeezeventCredentials`/`testWeezeventInstance`, `createWeezeventInstance`/
`updateWeezeventInstance`/`deleteWeezeventInstance`, `createDigifoodInstance`/`updateDigifoodInstance`/
`deleteDigifoodInstance`/`testDigifoodInstance`, `importDigifoodCsv` (dry-run puis réel, mapping de
colonnes CSV géré côté front, miroir des `HEADER_SYNONYMS` backend), `listWeezeventInstances`/
`listDigifoodInstances`.

**Deux mécanismes de sync coexistent dans l'UI** : sync legacy synchrone (`handleSync`) ET sync
job-based par bissection (`startWeezeventSyncJob`) — bascule automatique sur le job-based si des
dates `fromDate`/`toDate` sont renseignées dans les date-pickers, sinon legacy.

Monte `IntegrationWizard.vue` (en lui passant `location` = l'instance intégration et `spaceId`
résolu), `SyncProgressDialog.vue` et `SyncJobFloatingWidget.vue` (`src/components/SyncJobFloatingWidget.vue`
— widget flottant pour un job de sync minimisé).

### `IntegrationWizard.vue` (514 lignes) — orchestrateur des 4 étapes

Props `open`/`location`/`spaceId`/`otherLocations`. Monte selon `currentStep` :
`StepMapSpace`(1) → `StepMapShops`(2) → `StepMapMenuItems`(3) → `StepProcessTimeline`(4).
**`StepSynchronize.vue` n'est jamais importé ici** (mort, voir Code mort).

`isDigifood` (si `location.type === 'digifood'`) retire l'étape 4 (`StepProcessTimeline`) du
parcours — **le wizard Digifood s'arrête à 3 étapes**, car Digifood est un flux webhook temps réel
sans notion de "sync par plage de dates" comme Weezevent.

`showOverview` initial = `!spaceId && completedSteps === 0` : premier passage → `WizardOverview` ;
retour ultérieur (déjà mappé) → saut direct à l'étape courante.

### Les 4 étapes vivantes

| Étape | Composant | Modèle Prisma | Client API | Algo de similarité |
|---|---|---|---|---|
| 1 — Espace | `StepMapSpace.vue` (945 l.) | `LocationSpaceMapping` | `space.api.js`, `mapping.api.js`, `configuration.api.js` | Levenshtein maison, seuil `> 0.4` |
| 2 — Shops | `StepMapShops.vue` (2587 l.) | `LocationShopMapping` | `space.api.js`, `builder-v2.api.js`, `mapping.api.js`, `aggregation.api.js::getWeezeventLocations` | Token-overlap + Levenshtein, `> 0.5` auto / `> 0.3` candidats |
| 3 — Menu | `StepMapMenuItems.vue` (2594 l., le plus gros fichier du domaine) | `ProductMapping` | `menu-item.api.js`, `aggregation.api.js`, `mapping.api.js`, `product.api.js` | **Module partagé** `utils/menuItemMatching.js`, `≥ 70` composite |
| 4 — Events (Weezevent seul) | `StepProcessTimeline.vue` (1864 l.) | `Event` (CRUD), `WeezeventOrder`/`Attendee` | `aggregation.api.js`, `event.api.js`, `space.api.js` | — (réconciliation timeline, pas de matching) |

Étape 2 : `getWeezeventLocations` appelé **directement depuis `aggregation.api.js`**, sans passer
par le store `weezeventLocations.js` (voir Client API plus bas). Étape 3 : import du matcher partagé
confirmé par le commentaire du code (`StepMapMenuItems.vue:1158` : *"Matcher déplacé dans
src/utils/menuItemMatching.js (source unique partagée…)"*), applique aussi les prix Weezevent en
masse (`applyPrice`/`applyAllPrices` → `menu-item.api.js::applyWeezeventPrice(s)`, voir
04_MENU_CATALOGUE.md). Étape 4 : monte les 4 dialogs de `wizard/dialogs/` (`MapEventToExistingDialog`,
`CreateEventDialog`, `EnrichEventDialog`, `EventBreakdownDrawer` — consommés uniquement par ce
fichier), combine sync legacy et attente réelle de fin de job (polling 2.5s, timeout 10 min).

### Écrans de transition

- `WizardOverview.vue` (325 l.) — purement présentationnel, liste statique des 4 (ou 3) étapes avec
  pastille faite/à faire. Aucun appel API.
- `WizardSuccess.vue` (304 l.) — purement présentationnel, résumé transmis par le parent, propose de
  configurer la prochaine location non mappée. Aucun appel API.

### `SyncProgressDialog.vue` (753 l.) — indépendant du wizard

Monté directement par `DataIntegrationView.vue`, **pas** par `IntegrationWizard.vue`. Sert le
bouton "Synchroniser" des cartes d'intégration sur l'écran principal. Deux modes : "steps legacy"
piloté par le parent, ou "job" (poll `getWeezeventJobStatus` lui-même dès qu'un `jobId` est fourni).

---

## Client API — qui appelle quoi

**Aucun fichier `integration.api.js`/`weezevent.api.js`/`digifood.api.js` n'existe** — tout ce
domaine passe par deux fichiers génériques :

| Fichier | Fonctions notables | Consommateurs confirmés |
|---|---|---|
| `src/api/endpoints/mapping.api.js` | `getLocationSpaceMapping(s)`, `createLocationSpaceMapping`, `getLocationShopMapping(s)`, `createLocationShopMapping`, `bulkLocationShopMappings`, `getProductMapping(s)`, `createProductMapping`, `bulkProductMappings`, `getIntegrationProgress`, `getAllIntegrationProgress`, `getLocationSummary` | `StepMapSpace.vue`, `StepMapShops.vue`, `StepMapMenuItems.vue`, `DataIntegrationView.vue`. `getIntegrationProgress`/`getAllIntegrationProgress` : **plus aucun appelant vivant** (leur seul consommateur, `useSpaceMapping.js`, est mort — voir Code mort) |
| `src/api/endpoints/aggregation.api.js` | Toutes les fonctions Weezevent (`testWeezeventCredentials`, `list/create/update/deleteWeezeventInstance`, `startWeezeventSyncJob`, `getWeezeventJobStatus`, `syncWeezeventData`, `getWeezeventLocations/Events/Products`, `refreshWeezeventProduct`, `purgeWeezeventData`…) **et** Digifood (`list/create/update/deleteDigifoodInstance`, `testDigifoodInstance`, `importDigifoodCsv`) **et** agrégation (`getEventsTimeline`, `getStep4Context`, `processEvents`, `synchronize`, `getJobProgress`, `getEventBreakdown`) | `DataIntegrationView.vue`, `StepMapShops.vue`, `StepMapMenuItems.vue`, `StepProcessTimeline.vue` — malgré son nom (« aggregation »), ce fichier est en réalité **le client API de tout le domaine Intégrations** en plus de l'agrégation. À savoir avant de chercher une fonction Weezevent/Digifood ailleurs. |

### Stores Vuex — enregistrés mais pas consommés par le wizard

- `store/modules/weezeventLocations.js` : enregistré (`store/index.js`), **aucun consommateur
  vivant** — `StepMapShops.vue` appelle `getWeezeventLocations` directement depuis
  `aggregation.api.js`, en court-circuitant le store. Quasi-mort.
- `store/modules/weezeventProducts.js` : **correction du 2026-07-20** — cette page affirmait à tort
  qu'il était consommé par le domaine Analyse/Predict. Vérifié par un audit de code frontend le
  2026-07-20 : `useAnalyseItemRecords.js`, `EventPredictView.vue` etc. lisent en réalité
  `store.state.analyse.weezeventProducts`, un champ **homonyme mais sans rapport** du module Vuex
  `analyse` (alimenté par la mutation `SET_WEEZEVENT_PRODUCTS`), pas ce module namespacé
  `weezeventProducts/`. Le seul vrai consommateur de ce module (`weezeventProducts/fetchForLocation`,
  `weezeventProducts/forLocation`) est le composable `useMenuMapping.js` — lui-même mort (0
  importeur). `store/modules/weezeventProducts.js` a donc exactement le même statut que
  `weezeventLocations.js` : enregistré, quasi-mort. `StepMapMenuItems.vue` appelle lui aussi
  `getWeezeventProducts` directement depuis `aggregation.api.js`, en court-circuitant le store
  (comme `StepMapShops.vue` pour les locations).

---

## Récapitulatif — bugs actifs de ce domaine (2026-07-15, non corrigés)

| # | Bug | Sévérité | Fichiers |
|---|---|---|---|
| 1 | Multi-instance Weezevent : l'auth OAuth utilise les credentials de la 1ère intégration active pour toutes, quelle que soit l'intégration ciblée | **Critique** — sync silencieusement fausse/cassée dès 2 intégrations Weezevent actives | `weezevent-auth.service.ts:29-41,90-149`, `onboarding.service.ts:432-446`, `weezevent-integration.service.ts:196-224` |
| 2 | Dédup `IntegrationWebhookEvent` inopérante côté Weezevent (`externalDeliveryId` jamais renseigné) | Modéré — doublons d'audit + retraitement complet à chaque retry, impact fonctionnel limité par l'idempotence aval | `webhook.controller.ts:105-114`, `schema.prisma:1233` |
| 3 | Garde anti-double-run du cron Weezevent inopérante (`SyncTrackerService` jamais alimenté) | Faible — deux crons peuvent théoriquement se chevaucher, aucun cas observé documenté | `weezevent-cron.service.ts:49`, `SyncTrackerService` (0 appelant `startSync`/`completeSync`) |
| 4 | `markTransactionAsDeleted` ne fait rien de réel malgré son nom (juste `syncedAt` mis à jour) | Faible — les transactions supprimées côté Weezevent restent visibles côté Data Friday | `webhook-event.handler.ts` (méthode `markTransactionAsDeleted`) |
| 5 | Divergence de logique "mapping fait ?" dupliquée entre `MappingsService` et `AggregationService` | Faible/latent — risque de divergence future, pas de divergence observée aujourd'hui | `mappings.service.ts:735-941` vs `aggregation.service.ts:233` |
| 6 | `margin-analysis` gonfle la marge affichée quand des produits ne sont pas mappés (vente comptée, coût exclu) | Modéré — métrique trompeuse sans avertissement fort (seul `mappingRate` signale le problème) | `weezevent-analytics.controller.ts:208-247` |

## Code mort de ce domaine (à ne PAS prendre comme référence)

- `src/components/integration/wizard/StepSynchronize.vue` — `@deprecated` **explicite** dans son
  propre en-tête (« Remplacé par StepProcessTimeline.vue… Ne pas modifier ni réutiliser »), 0
  importeur confirmé par grep.
- `src/components/integration/IntegrationProviderCard.vue` — 0 importeur, ancien style visuel
  (dégradé violet) incohérent avec le rouge `#ff3131` du reste du domaine vivant.
- `src/components/integration/LocationListItem.vue` — mort par transitivité (seul consommateur =
  `IntegrationProviderCard.vue`, lui-même mort).
- `src/components/MenuMappingStep.vue` (racine, hors dossier `integration/`) — 0 importeur, style
  Tailwind/shadcn incohérent avec le reste du domaine (Vuetify + BEM `smi-*`/`sms-*`/`iw-*`) —
  ancêtre conceptuel mort de `StepMapMenuItems.vue`.
- `src/composables/useSpaceMapping.js`, `useShopMapping.js`, `useMenuMapping.js` — 0 importeur
  (grep frais confirmé). `useSpaceMapping.js` réimplémente exactement la logique de
  `StepMapSpace.vue` (même Levenshtein maison) — vraisemblablement le composable d'origine,
  abandonné quand l'étape a été réécrite en inlinant sa propre logique.
- `mapping.api.js::getIntegrationProgress`/`getAllIntegrationProgress` — plus aucun appelant vivant
  (seul appelant, `useSpaceMapping.js`, est mort).
- `store/modules/weezeventLocations.js` — enregistré, quasi-mort (0 dispatch/getter consommé).
- `SyncTrackerService.startSync/completeSync/failSync` — jamais appelés dans tout le backend (grep
  exhaustif hors module Weezevent également) ; la classe reste injectée dans le cron et le
  contrôleur mais ne sert plus qu'à une lecture (`getRunningSyncs`) qui retourne toujours vide.
- `WeezeventSyncJob.status === 'INSERTING'` — testé dans `weezevent.controller.ts:1632`
  (`DELETE sync/jobs/:jobId`) mais **jamais écrit** par aucun service trouvé (`collect-worker` passe
  par `COLLECTING`→`COMPLETED`/`FAILED`, `insert-worker` ne modifie que `WeezeventSyncChunk.status`,
  pas `WeezeventSyncJob.status`) — condition morte ou service tiers non localisé, à creuser si le
  sujet est repris.

## Repasse du 2026-07-20 — audit ciblé du code frontend `/data-integration/fb`

Passe complémentaire à celle du 2026-07-15 : là où cette page documente l'**architecture** du
domaine (modèles, pièges inter-services, contrats API), la repasse du 2026-07-20 est allée lire
**intégralement** chaque fichier frontend du domaine (8 agents, un par fichier/groupe de fichiers,
~15 000 lignes au total) pour trouver les bugs et la dette technique au niveau du code lui-même.
Résultat : **29 bugs concrets documentés en fiches individuelles, `BUG-193` à `BUG-221`** dans
[`docs/bugs/`](../bugs/00_INDEX.md), et le reste (dette technique, code mort additionnel, a11y,
i18n) consolidé dans
[`docs/utiles/AUDIT_DATA_INTEGRATION_FB_DETTE_TECHNIQUE_2026-07-20.md`](../utiles/AUDIT_DATA_INTEGRATION_FB_DETTE_TECHNIQUE_2026-07-20.md).
**Les 29 bugs ont ensuite été corrigés le jour même** (2ème vague de 5 agents, un par
fichier/groupe de fichiers disjoint, sur la même branche `docs/audit-data-integration-fb`) — voir
le `## Correction` de chaque fiche pour le détail exact. Non traité par cette repasse (hors scope
"correction de bugs identifiés") : la dette technique du fichier ci-dessus (accessibilité, i18n
mineur, duplication).

Un point de cette page a été corrigé au passage : le statut de `store/modules/weezeventProducts.js`
(voir §"Stores Vuex" ci-dessus) — il était présenté comme consommé par Analyse/Predict, il est en
réalité quasi-mort comme son voisin `weezeventLocations.js`.

### Nouveaux bugs les plus significatifs (voir fiches pour le détail complet)

| # | Bug | Sévérité | Fichier |
|---|---|---|---|
| [BUG-193](../bugs/193_data_integration_delete_checkbox_sans_effet.md) | Case "supprimer aussi les données" sans effet réel (cascade Prisma inconditionnelle) | 🔴 | `DataIntegrationView.vue` |
| [BUG-204](../bugs/204_syncprogress_jobid_jamais_reinitialise.md) | `syncJobId` jamais réinitialisé → le mode sync legacy affiche un état figé après un premier sync par job | 🔴 | `SyncProgressDialog.vue` |
| [BUG-214](../bugs/214_stepprocesstimeline_weezeventmappings_jamais_rehydrate.md) | `weezEventMappings` jamais réhydraté → "Créer et lier tout" peut créer des `Event` en double | 🔴 | `StepProcessTimeline.vue` |
| [BUG-215](../bugs/215_stepprocesstimeline_toast_succes_meme_si_echec_skip.md) | Toast "Agrégation terminée" affiché même en cas d'échec/skip du job | 🔴 | `StepProcessTimeline.vue` |
| [BUG-200](../bugs/200_wizard_reprise_etape_non_fonctionnelle.md) | "Reprendre où on s'était arrêté" ne fonctionne pas (`completedSteps` jamais peuplé) | 🟠 | `IntegrationWizard.vue` |
| [BUG-208](../bugs/208_stepmapshops_badge_etage_regression_multi_config.md) | Le fix du badge étage (BUG-003) régresse pour les tenants multi-configuration | 🟠 | `StepMapShops.vue` |
| [BUG-210](../bugs/210_stepmapshops_updatemapping_sans_rollback_echec.md) / [BUG-211](../bugs/211_stepmapshops_delete_mapping_echec_invisible.md) | `updateMapping` sans rollback à l'échec → compteur de mapping gonflé, suppression en échec totalement invisible | 🟠 | `StepMapShops.vue` |
| [BUG-213](../bugs/213_stepmapmenuitems_next_button_sans_garde_bulk.md) | Bouton "Suivant" du wizard pas gardé pendant un bulk-create/bulk-price-apply en cours | 🟠 | `StepMapMenuItems.vue` |
| [BUG-221](../bugs/221_stepprocesstimeline_pans_code_morts_refactor_incomplet.md) | 3 pans de code mort issus d'un refactor incomplet de l'étape 4 (voir aussi ci-dessous) | 🟠 | `StepProcessTimeline.vue` |

Liste complète des 29 bugs : `docs/bugs/00_INDEX.md` (numéros 193-221).

### Code mort supplémentaire confirmé (au-delà de la liste ci-dessus)

- **`StepProcessTimeline.vue`** — **supprimé** le 2026-07-20 en même temps que le fix de
  [BUG-221](../bugs/221_stepprocesstimeline_pans_code_morts_refactor_incomplet.md) : le template
  n'avait plus que 2 onglets vivants (`covered`/`uncovered`), mais le script contenait encore 3
  pans complets et non câblés d'une itération antérieure à 3 onglets — l'onglet "Événements
  Weezevent" (sync spectateurs, enrichissement via `EnrichEventDialog`), une seconde table de
  timeline minute par minute avec export CSV (distincte de celle réellement utilisée dans
  `EventBreakdownDrawer`, conservée), et le traitement en masse (`handleProcessAll`/
  `processAllEvents`). Décision produit : suppression plutôt que réactivation. `EventBreakdownDrawer.vue`
  reste le seul écran de timeline minute par minute du domaine ; `EnrichEventDialog.vue` reste sur
  le disque (fichier non supprimé) mais n'est plus monté nulle part.
- **`StepMapShops.vue`** : cluster de code mort issu d'une UI antérieure à colonne "score de
  match" jamais nettoyée (`headers`, `topMatchesMap`, `findTopElementMatches`,
  `quickCreateSortedFloors`, `floorDialogFloorOptions`, `floorOptionIconColor`,
  `_elementConfigMap`, CSS `.sms-match*`) — **toujours présent**, volontairement laissé hors scope
  de la vague de correctifs du 2026-07-20 (qui portait uniquement sur les 4 bugs fonctionnels
  BUG-208 à 211) ; détail dans le document de dette technique lié ci-dessus.
- **`WizardSuccess.vue`/`IntegrationWizard.vue`** — **câblé** le 2026-07-20 en même temps que le
  fix de [BUG-201](../bugs/201_wizard_other_locations_configure_next_mort.md) : la fonctionnalité
  "configurer la prochaine location non mappée" (`otherLocations`/`configure-next`), déjà
  entièrement construite entre ces deux fichiers, est désormais alimentée par
  `DataIntegrationView.vue` (nouveau computed `otherLocationsForWizard` + `handleConfigureNext`).

## Zones grises (points réellement non tranchés, pas des angles morts)

- **`SalesProduct.components`/`variants` (Json)** coexistent avec les tables relationnelles
  `SalesProductComponent`/`SalesProductVariant` sans que le schéma précise laquelle fait foi — les
  deux semblent alimentées en parallèle, la logique de synchronisation exacte entre les deux
  représentations n'a pas été vérifiée service par service dans cette passe.
- **`WeezeventOrder`/`WeezeventPrice`** : rôle métier confirmé au niveau structure et écriture
  (`syncOrders`/`syncPrices` dans `weezevent-sync.service.ts`, déclenchés par `POST sync` type
  `orders`/`prices` ou par le webhook `order`), mais leur **consommation** en aval (quel écran/quel
  calcul les lit réellement côté billetterie) n'a pas été tracée dans cette passe — à documenter si
  un futur travail touche à la billetterie/pricing événementiel.
- **Application effective de `menu.integration.fb`** : le décorateur `@RequirePermissions` est posé
  de façon cohérente partout, mais l'implémentation du `PermissionsGuard` sous-jacent (OR avec un
  bypass ADMIN ? interaction avec `RolesGuard` ?) n'a pas été relue dans cette passe — comportement
  supposé standard (cohérent avec le reste du RBAC documenté ailleurs) mais non reconfirmé ligne à
  ligne ici.
- **`LocationSpaceMapping` sans FK Prisma** : aucune contrainte `onDelete` déclarée au niveau ORM.
  Il est possible qu'une contrainte existe au niveau SQL brut (migration manuelle hors Prisma) —
  non vérifié, car cela nécessiterait de lire l'historique des migrations SQL plutôt que
  `schema.prisma` seul.
- **Colonnes legacy `Tenant.weezeventClientId/weezeventClientSecret/weezeventOrganizationId/
  weezeventEnabled`** : confirmées activement lues (auth OAuth, cron) et écrites (mirroir depuis
  `Integration`) — donc **pas** du code mort malgré leur statut "legacy" affiché dans le nom, mais
  leur suppression au profit d'une lecture par-instance est précisément la correction attendue du
  Piège n°1. Le schéma ne documente pas explicitement une date de retrait planifiée.
