# POS Data Friday : caisse par PdV, activable par évènement (MVP)

Demande Bertrand du 2026-10-16 : générer une interface de caisse par PdV, basée sur les Space
Menus et la configuration de l'évènement, activable pour chaque évènement, dont les ventes
alimentent le système en direct (Live, Analyse, stock, réarmement, réconciliation).

Maquette validée (3 écrans) : https://claude.ai/artifact/JD2MswsuTkMAtSTFUBhuX4
1. Outil POS dans le workspace de l'espace (dernier outil de la liste), page calquée sur
   Post-event Inventory : en-tête KPI, 3 colonnes repliables, bandeau rouge avec sélecteur
   d'évènement, onglets « Points de vente » et « Historique des ventes ».
2. Plein écran invité : QR du PdV, nom du vendeur, PIN.
3. Plein écran caisse : catégories en rail, tuiles, ticket, paiement en un geste (Espèces,
   Carte), bandeau « encaissé » avec annulation, historique, clôture.

Règle de conception : la caisse suit l'existant du code, rien d'inventé. Les remises viennent
uniquement du catalogue (promotions Happy-Hour, Pack x4, promo d'un combo). La consigne est un
produit du Space Menu, la déconsigne une ligne négative (comme l'export Digifood).

---

## 1. Décisions (Ulrich, 2026-10-16)

| # | Sujet | Décision |
|---|---|---|
| 1 | Sources mélangées sur un même match | **Oui dès la V1** : un match peut avoir des PdV en Weezevent (ou Digifood) et d'autres en POS. Agrégation multi-source obligatoire (lot L4). |
| 2 | PIN | **Un PIN et un QR par PdV** pour la phase `pos`. Écart volontaire avec l'inventaire (un PIN partagé par fenêtre, décision 2026-09-08) : avec un PIN partagé, toute personne qui connaît le PIN peut ouvrir la caisse de n'importe quel PdV en scannant son QR. |
| 3 | Vendeur | Nom saisi à la connexion, enregistré sur chaque vente (traçabilité). Dans la configuration, le directeur associe un responsable RH (`HrPerson`) à chaque caisse de PdV. |
| 4 | Hors ligne | Plus tard. La V1 prépare l'essentiel : identifiant de ticket généré par la tablette (rejeu sans doublon), file d'envoi isolée dans un module, statut réseau affiché. |
| 5 | Exécution | 2 à 3 agents en parallèle, pilotés par un agent central. Les tests (jest) ne tournent jamais en parallèle : un verrou machine les sérialise (section 6). |
| 6 | Paiement | Référentiel `PaymentMethod` par tenant (principe 1 bis), Espèces et Carte créés par défaut. Pas d'encaissement carte intégré en V1. |
| 7 | Annulation | Marquage « supprimé » existant des transactions (BUG-028), exclu des agrégats. |
| 8 | Consigne (Q84) | TVA 0 % ; prix saisi sur chaque menu item Consigne du catalogue (Ecocup 1 €, pichet, 50 cl). |
| 9 | Responsable RH (Q85) | Traçabilité seulement en V1 : tout vendeur connecté au PdV peut annuler un ticket. |
| 10 | Ouverture des caisses (Q86) | Caisse utilisable dès son démarrage (▶), y compris avant l'ouverture des portes ; fermeture automatique à la fin réelle de l'évènement + grâce. Pas d'ouverture automatique aux portes. |
| 11 | Ventes de test (Q87) | Même règle pour toutes les sources : la première vente POS d'un PdV arrête son inventaire pré-event (`pre-sale-stop.ts`), vente de test comprise. |
| 13 | Partage de l'addition | Un ticket se paie en 1 à 10 paiements, moyens mélangés possibles ; la caisse propose « N parts égales » (centimes restants sur la dernière part) et « montant par montant », avec le reste à payer affiché. Un partage par articles = plusieurs tickets. |
| 14 | Pourboires (Q89, Q90) | Pourboire saisi par paiement (montant ou %), HORS chiffre d'affaires et HORS TVA : jamais dans `amount`, les items ni les agrégats, gardé en metadata. Clôture et historique : total, par moyen de paiement et **par vendeur** (redistribution). Réglage par évènement `tipsEnabled`, **désactivé par défaut**. |
| 12 | Modes de paiement (Q88) | Espèces et Carte proposés par défaut en V1 ; d'autres moyens s'ajoutent dans Configuration sans code. |

## 1 bis. Principes d'évolutivité (exigence Ulrich, 2026-10-16)

Le POS doit pouvoir évoluer (moyens de paiement, nouvelles sources, nouveaux réglages) sans
réécrire le coeur. Règles opposables à tous les lots :

1. **Rien de métier figé dans le code.** Toute liste qu'un client peut vouloir changer est un
   référentiel en base, géré dans Configuration, sur le modèle de « Types de promotion » :
   moyens de paiement (`PaymentMethod`, `kind` ouvert : cash, card, voucher, cashless...),
   catégories de caisse (référentiels produit existants), consignes (produits du catalogue).
2. **Le comportement dépend d'une catégorie, pas d'un nom.** La caisse réagit au `kind` d'un
   moyen de paiement (rendu de monnaie si cash, etc.), jamais à « Espèces » écrit en dur.
3. **Sources de ventes génériques.** Un évènement a une LISTE de sources de ventes. Le POS est
   une source parmi d'autres ; demain un 2e Weezevent, un autre logiciel de caisse ou Digifood
   en mixte doivent s'ajouter sans nouveau cas particulier dans l'agrégation (lot L4).
4. **Copie au moment de la vente.** Une vente garde le nom et le kind du moyen de paiement, le
   prix et la promotion appliqués : renommer ou modifier un référentiel ne réécrit pas l'historique.
5. **Contrats additifs.** On ajoute des champs, on n'en retire pas ; les listes sont des tableaux
   (ex. `payments[]` prépare le paiement fractionné même si la V1 n'en envoie qu'un).
6. **Réglages en lignes typées par évènement et par PdV**, extensibles par ajout de colonnes ou
   de tables, jamais par des constantes.

## 2. Ce qui existe et que l'on réutilise (vérifié dans le code le 2026-10-16)

| Besoin | Existant | Fichier |
|---|---|---|
| Écrire une vente dans les vraies tables | `SalesSimulationService.simulateSale` : prix `SpaceMenuItem.priceTtc` puis `MenuItem.basePrice`, TVA en cascade (espace, article, tenant), explosion recette, contrôle de faisabilité stock, déclenchement agrégation | `backend/src/features/logistics/services/sales-simulation.service.ts` |
| Ingestion idempotente | `DigifoodIngestionService.ingestOrder` : upsert par `externalId`, items delete + createMany dans une `$transaction`, delta `SalesPriceAgg`, `tenantId` explicite hors contexte authentifié | `backend/src/features/digifood/services/digifood-ingestion.service.ts` |
| Stock | Consommation Logistic dérivée à la lecture depuis les ventes `status='V'` via `LocationShopMapping` + `ProductMapping` : une vente POS bien rattachée décompte le stock sans code de stock supplémentaire | `logistics/services/recipe-explosion.service.ts` (`deriveSalesRaw`, `explodeSalesToConsumption`), `stock-level.service.ts` |
| Live | Job d'agrégation terminé : publish Redis `liveSpaceChannel`, relayé par SSE, écran Live rafraîchi. Déclencheur coalescé par (espace, intégration) | `aggregation/jobs/aggregation.processor.ts`, `weezevent/services/live/live-aggregation-trigger.service.ts`, `aggregation/live-minute-aggregation.service.ts` |
| Accès invité | QR par PdV (slug), PIN haché, JWT invité scopé PdV + évènement + phase, révocation immédiate, ▶/■ par PdV, routes `/pdv/...` aiguillées par phase | `features/guest-pin-access/*`, `core/auth/strategies/jwt-guest-pin.strategy.ts`, `frontend/src/router/guards.js` |
| Une fenêtre par clé | `InventoryWindow` unique sur `(tenantId, spaceId, eventId, phase, selectionKey)` : la ventilation v2 s'en sert déjà pour un PIN par combinaison | `prisma/schema.prisma` |
| Articles d'un PdV | `MenuAssignment` (PdV × configuration), `Event.configurationId`, endpoint `GET space-menus/:spaceId/:configId/shop-items` | `features/space-menus/*` |
| Promotions et TVA | `MenuItem.vatRate`, `discountType/discountValue` ; `SpaceMenuItem.priceTtc/vatRate/discountType/discountValue` ; `Promotion` + `PromotionType` | `prisma/schema.prisma` |
| Droits | `permission-catalog.ts` + `SYSTEM_ROLES`, synchronisation auto vers les rôles existants | `backend/src/core/rbac/` |
| Outil du workspace | `WORKSPACE_TOOLBOX_ITEMS` + `navigateToTool` | `frontend/src/composables/useWorkspaceToolbox.js` |
| Responsable RH | `HrPerson` (prénom, nom, rôle, actif) | `prisma/schema.prisma` |

## 3. Pièges connus (à lire avant de coder)

1. **Agrégation mono-source par évènement.** `EventWindowResolverService.resolveEventWindow`
   rattache un évènement à UNE source : `exact` (un `SalesEvent`), `integration-range`
   (`Event.integrationId`), `container-range` ou `range` (intégrations mappées à l'espace).
   BUG-365 : jamais un job multi-intégrations. Sans le lot L4, les ventes POS d'un match
   Weezevent n'apparaissent ni dans le Live ni dans l'Analyse.
2. **Les sources s'additionnent, rien ne les remplace.** Démarrer le POS sur un PdV ne coupe pas
   Weezevent. Règle d'exploitation : le PdV n'utilise plus son autre terminal. Texte de
   l'interface à corriger dans ce sens.
3. **Arrêt pre-event à la première vente** (`pre-sale-stop.ts`, décision Bertrand 2026-10-07) :
   une vente POS, y compris de test, arrête l'inventaire pré-event du PdV.
4. **Routes invité publiques** : le scoping Prisma par tenant (CLS) est inactif. Chaque écriture
   porte `tenantId` explicitement (comme Digifood). `TENANT_SCOPE_MODE=strict` en production.
5. **`sellerWalletId`** pointe vers `WeezeventWallet` : inutilisable pour le vendeur POS. Le nom
   du vendeur va dans `metadata` (Digifood y met déjà `cashier`).
6. **`reduction`** est un montant TTC par ligne. Convention POS : prix déjà remisé, `reduction=0`
   (comme Digifood), prix d'origine et promotion en `rawData`.
7. **Requêtes sur les tables de transactions** : EXPLAIN obligatoire avant toute nouvelle requête
   (chantier perf du 2026-09-21). Jamais de `SET` de session sur le pooleur 6543.
8. **Consigne** : produit du Space Menu (menu items « Consigne », Ecocup 1 €), déconsigne ligne
   négative, TVA 0 % (décision 8).

## 4. Architecture cible

```
Directeur (staff, permission front.fb.pos)
  Outil POS du workspace
    choisit l'évènement (en cours ou à venir)
    ▶ par PdV : crée la fenêtre phase 'pos' de CE PdV (selectionKey = elementId)
                + son PIN + garantit les référentiels POS (L1)
    associe un responsable HrPerson par PdV
    réglages évènement (modes de paiement, promos, annulation)
        │
Vendeur (invité)                                     │
  scanne le QR du PdV  →  /pdv/pos/:slug  →  nom + PIN  →  JWT invité (phase 'pos', PdV, évènement)
  caisse plein écran : catalogue = articles du PdV dans la config de l'évènement,
                       prix et TVA du Space Menu, disponibilité stock (L5)
  Encaisser  →  POST /guest-pin/pos/sales  { clientTicketId, lines[], paymentMethod, vendorName }
        │
PosSaleService (L3, coeur partagé extrait de simulateSale)
  idempotence sur (tenant, intégration POS, externalId = clientTicketId)
  SalesTransaction provider POS, status 'V', eventId = SalesEvent POS de l'évènement,
  locationId = SalesLocation POS du PdV ; items avec productId = SalesProduct POS
  delta SalesPriceAgg ; déclenchement agrégation live coalescée (espace, intégration POS)
        │
AggregationProcessor (worker Render)  →  agrégats multi-source (L4)  →  publish liveSpaceChannel
        │
Live, Analyse, Event Predict, réarmement, réconciliation : lisent les agrégats et les ventes
Stock Logistic : dérivé à la lecture (aucun changement), disponibilité caisse recalculée (L5)
```

### Modèle de données (L1)

- `enum IntegrationProvider` : ajouter `POS`.
- Une `Integration` provider `POS` **par espace** (tenant, espace), créée à la demande sous
  verrou de transaction (nom « Data Friday POS · espace »). Raison : `LocationSpaceMapping` est
  unique sur (tenantId, salesLocationId) et salesLocationId porte l'ID d'intégration, donc une
  intégration ne se rattache qu'à un seul espace (constat lot L1, 2026-10-16).
- Référentiels créés à la demande, idempotents :
  - `SalesEvent` POS par évènement Data Friday (`externalId = Event.id`) ;
  - `SalesLocation` POS par PdV (`externalId = SpaceElement.id`) + `LocationShopMapping` ;
  - `SalesProduct` POS par menu item (`externalId = MenuItem.id`) + `ProductMapping`
    (`autoMapped=true`, `mappedBy='pos'`) ;
  - `LocationSpaceMapping` (espace ↔ intégration POS) pour le périmètre d'agrégation.
- Nouvelles tables :
  - `PosPdvSetting` : `tenantId, spaceId, eventId, elementId, responsibleHrPersonId?,
    createdBy`, unique `(eventId, elementId)` ;
  - `PosEventSetting` : `tenantId, spaceId, eventId, paymentMethods String[], promosEnabled,
    cancelEnabled`, unique `eventId`.
- Fenêtre d'accès : `InventoryWindow` phase `'pos'`, `selectionKey = elementId` (un PIN par PdV),
  `GuestPinAccess` du PdV. La phase `pos` est exclue de `INVENTORY_PHASES`.
- `SalesTransaction.metadata` : `{ provider: 'pos', clientTicketId, vendorName,
  responsibleHrPersonId, guestAccessId, deviceId, paymentMethod, ticketNumber }`.
- Numéro de ticket lisible par PdV et par évènement (compteur atomique, Redis ou table).

### Contrats API (figés par l'agent central en L0 avant tout code)

Staff (`front.fb.pos`, accès espace vérifié) :
- `GET  pos/:spaceId/events` : évènements en cours et à venir de l'espace.
- `GET  pos/:spaceId/events/:eventId` : PdV de la config de l'évènement, statut caisse, PIN
  (déchiffré, permission `front.fb.posManage`), responsable, réglages, KPI.
- `POST pos/:spaceId/events/:eventId/pdv/:elementId/start` et `/stop`.
- `POST pos/:spaceId/events/:eventId/start-all` et `/stop-all`.
- `POST pos/:spaceId/events/:eventId/pdv/:elementId/reset-pin` (`front.fb.posManage`, ajouté par L2).
- `PUT  pos/:spaceId/events/:eventId/pdv/:elementId` : responsable RH.
- `PUT  pos/:spaceId/events/:eventId/settings`.
- `GET  pos/:spaceId/events/:eventId/sales` : historique tous PdV, filtres PdV, paiement,
  recherche, pagination par curseur ; `GET .../sales/export` (CSV `;`, BOM UTF-8).

Invité (`JwtGuestPinGuard`, phase `pos`, rien en paramètre d'URL hors slug) :
- `GET  guest-pin/context/:slug` (existant, étendu à la phase `pos`).
- `POST guest-pin/login/:slug` : `{ pin, vendorName }`.
- `GET  guest-pin/pos/catalog` : articles du PdV (prix, TVA, promo, catégorie, disponibilité).
- `POST guest-pin/pos/sales` : idempotent sur `clientTicketId`.
- `POST guest-pin/pos/sales/:id/cancel` et `/restore`.
- `GET  guest-pin/pos/sales` : historique du PdV.
- `GET  guest-pin/pos/closing` : récapitulatif de clôture.

## 5. Lots, dépendances et vagues

| Lot | Contenu | Dépend de | Agent |
|---|---|---|---|
| **L0** | Branche `feat/pos-mvp` depuis `production`. Contrats (DTO TypeScript, types front, codes d'erreur), schéma Prisma cible, ADR multi-source (L4, après le spike), script de verrou de tests. | rien | Central |
| **L1** | Migration (enum `POS`, `PosPdvSetting`, `PosEventSetting`), `PosSourceService.ensureReferentials(tenant, space, event, elements)`, intégration POS par tenant, mappings automatiques. Tests unitaires. | L0 | Backend A |
| **L2** | Accès invité phase `pos` : fenêtre par PdV (`selectionKey = elementId`), PIN par PdV, start/stop, login avec `vendorName`, JWT, exclusion de `INVENTORY_PHASES`. Les ventes POS déclenchent `pre-sale-stop` comme les autres sources (décision 11). Cycle de vie : utilisable dès ▶, fermeture automatique à la fin réelle de l'évènement + grâce (décision 10). | L0 | Backend B |
| **L3** | `PosSaleService` : extraire le coeur commun de `simulateSale` (prix, TVA, lignes, transaction) dans un service partagé sans changer le comportement QA ; idempotence ; numéro de ticket ; annulation et rétablissement (`deletedAt`, delta `SalesPriceAgg` inverse, ré-agrégation) ; historique invité et staff ; export CSV. | L1, L2 | Backend A |
| **L4** | **Agrégation multi-source.** Spike d'abord (lecture des écrivains ET lecteurs d'agrégats, rédaction de l'ADR, validation Ulrich), puis implémentation : un évènement peut avoir N sources ; jobs toujours mono-intégration (BUG-365 respecté) mais plusieurs jobs par évènement ; lignes d'agrégats déjà portées par `integrationId` ; lecteurs (`resolveEventSalesScope`, timeline, batch Analyse, rollup `Event.revenue`) qui somment les sources ; groupes Live par (espace, intégration) incluant POS. Non-régression stricte sur les espaces Weezevent et Digifood existants. Inclut l'arrêt pre-event à la première vente : `firstValidSaleByElementSince` (`spaces/services/space-shops.service.ts`) ne lit qu'UNE intégration (le premier `locationSpaceMapping` de l'espace), donc ignore les ventes POS d'un espace mixte (constat L2). | L0 (spike), L1 | Backend C (le plus expérimenté) |
| **L3 bis** | Référentiel « Moyens de paiement » : CRUD backend sur le modèle de `promotion-types` (permission `menu.config.manage`), création à la demande d'Espèces et Carte (`isSystem`), un `isSystem` se désactive mais ne se supprime pas ; écran Configuration > Moyens de paiement côté front (même composant que les autres référentiels de Configuration). | L1 | Backend A puis Front A |
| **L5** | Disponibilité par article et par PdV : stock du PdV (StockLevel + ventes dérivées) inversé par la recette (unités encore vendables), seuil « stock bas », état « épuisé ». Endpoint pour la caisse, rafraîchi après chaque vente du PdV. | L1 | Backend B |
| **L6** | Front, page de configuration : outil `pos` en dernier dans `WORKSPACE_TOOLBOX_ITEMS`, route `space-pos`, store `pos.js`, client `pos.api.js`, composables, composants séparés (un fichier par bloc de la maquette), traductions FR et EN. Sur contrats mockés tant que L1 à L3 ne sont pas livrés. | L0 | Front A |
| **L7** | Front, caisse invitée : route `guest-pos` (`/pdv/pos`), garde par phase, plein écran (Fullscreen API + repli), rail catégories, tuiles, ticket, paiement en un geste ET panneau « Partager l'addition » (N parts égales, montant par montant, reste à payer), saisie du pourboire si `tipsEnabled` (montant ou %), bandeau d'annulation, historique, clôture avec pourboires par vendeur. Module `posOutbox` (file d'envoi avec `clientTicketId`, rejeu) isolé pour le hors ligne futur. | L0 | Front B |
| **L8** | RBAC (`front.fb.pos`, `front.fb.posManage`, rôles par défaut), documentation module (`docs/modules`), `QUESTIONS_A_BERTRAND.md`. | L1 à L7 | Central |
| **L9** | Recette de bout en bout : vente POS visible dans Live, Analyse, Logistic, réarmement, réconciliation ; match mixte Weezevent + POS ; annulation ; double envoi ; EXPLAIN des requêtes nouvelles. | tout | Central |

Vagues (3 agents maximum en même temps) :
- **Vague 1** : L1 (Backend A), L2 (Backend B), spike L4 (Backend C). Central : L0 terminé avant.
- **Vague 2** : L3 (Backend A), L5 (Backend B), L4 implémentation (Backend C).
- **Vague 3** : L6 (Front A), L7 (Front B), suite L4 si besoin. Central : L8.
- **Vague 4** : L9 par le central, corrections ciblées.

## 5 bis. Interfaces entre lots de la vague 2 (figées par le central, 2026-10-16)

ADR multi-source accepté (`ADR_MULTI_SOURCE.md`). Répartition sans fichier partagé :

| Agent | Lots | Possède |
|---|---|---|
| Backend A | L3 : écriture des ventes, annulation, endpoints invité (catalogue, ventes, historique, clôture), requête d'historique partagée | `features/pos/pos.module.ts`, `features/pos/sales/**`, `features/pos/guest/**`, `shared/sales/sale-line-pricing.*` (coeur extrait de simulateSale), retouche minimale de `sales-simulation.service.ts` |
| Backend B | L5 disponibilité + L3 bis moyens de paiement (backend) + endpoints staff de lecture/réglages | `features/pos/availability/**`, `features/pos/config/**`, `features/payment-methods/**`, une ligne dans `app.module.ts` par module créé |
| Backend C | L4 implémentation (S0 à S10 de l'ADR) | `features/aggregation/**`, `features/event-sales-sources/**`, lecteurs `features/spaces/**` cités par l'ADR, `features/weezevent/services/live/**` et jobs live, `features/events/**` (relink), migration `20261016110000_event_sales_source`, `schema.prisma` (modèle EventSalesSource uniquement) |

Interfaces :
1. `EventSalesSourceService` (Backend C), module feuille `features/event-sales-sources/` (dépend de
   Prisma seulement, aucun cycle) : `ensurePosSource(tenantId, eventId, integrationId, salesEventId)`
   idempotent. Backend A l'appelle juste après `PosSourceService.ensureReferentials`.
2. `PosAvailabilityService` (Backend B), module `features/pos/availability/` :
   `computeForPdv(tenantId, spaceId, eventId, elementId, menuItemIds) :
   Promise<Map<menuItemId, { availability: 'available' | 'low' | 'out'; remainingUnits: number | null }>>`.
   Backend B crée d'abord le fichier avec cette signature (implémentation « tout disponible »),
   puis le complète. Backend A l'importe pour le catalogue.
3. `PosSalesQueryService` (Backend A), dans `features/pos/sales/` et exporté par `PosModule` :
   `list(scope, query) : PosSalesPage` et `closing(scope) : PosClosing`, `scope` = tenant + espace +
   évènement + PdV optionnel. Backend B l'appelle pour l'historique staff et l'export CSV.
4. `PaymentMethodsService` (Backend B), module `features/payment-methods/` :
   `listActive(tenantId)` (crée Espèces et Carte à la demande, `isSystem`) et
   `resolveForEvent(tenantId, eventId) : PosPaymentMethodDto[]`. Backend A l'utilise pour le
   catalogue et pour valider les paiements d'une vente.
5. Déclenchement Live après une vente (Backend A) : job `process-event-minutes` coalescé via
   `livePendingKey(spaceId, integrationId POS)` et `QueueService`, comme
   `LiveAggregationTriggerService.queueMinuteAggregation`. Backend C garantit que le worker traite
   correctement un job d'intégration POS.

## 6. Protocole multi-agents

Agent central (pilote) :
- Possède `feat/pos-mvp`, les contrats, l'ordre des vagues et la fusion.
- Donne à chaque agent : le lot, ce plan, les fichiers à lire, les contrats, ce qui est exclu.
- Relit chaque livraison par le diff (`git show --stat` puis diff), pas par le message.
- Lance lui-même les suites de tests sensibles, une à la fois.
- Ne commite et ne déploie jamais sans accord explicite d'Ulrich.

Agents de lot :
- Chacun dans son worktree (`isolation: worktree`), branche `feat/pos-<lot>`.
- Ne touchent qu'aux fichiers de leur lot ; tout changement de contrat passe par le central.
- Ne lancent **jamais** `pnpm build`, ni le serveur de dev, ni une suite de tests entière.
- Tests : uniquement via le verrou machine, un fichier spec à la fois, `--runInBand`.
- Livrent : liste des fichiers, tests passés (sortie), points ouverts.

Verrou de tests (L0, `scripts/test-serial.sh`) : un seul jest à la fois sur la machine, tous
agents confondus. Principe : `mkdir /tmp/datafriday-jest.lock` atomique, attente active si
occupé, suppression en sortie (trap), puis `npx jest --runInBand <un fichier>`. Un agent qui
lance jest hors de ce script est en faute.

Règles du projet rappelées à chaque agent : réponses et commentaires en français ; jamais de
tiret cadratin dans le code ou l'interface ; un fichier par composant ou composable, jamais de
fichier monolithique ; flux front `.vue → composable → store → api` ; `tenantId` explicite sur
les routes invité ; EXPLAIN avant toute requête sur les transactions ; aucune écriture sur la
base de production ; pas de `SET` de session sur le pooleur ; tailles, graisses et polices
conformes à `docs/CHARTE_GRAPHIQUE.md` (ADR-0003) ; textes via `translations.js`, jamais en dur ;
routes chargées en import paresseux ; aucun commit sans demande explicite.

## 7. Recette (critères d'acceptation)

1. Le directeur choisit un évènement à venir, démarre 2 PdV : 2 PIN distincts, 2 QR.
2. Le PIN du PdV A ne permet pas d'ouvrir la caisse du PdV B.
3. Le vendeur saisit son nom ; chaque ticket le porte.
4. La caisse n'affiche que les articles du PdV dans la configuration de l'évènement, au prix du
   Space Menu, promotions comprises ; consigne et déconsigne fonctionnent.
5. Une vente apparaît dans le Live de l'espace en moins de 30 s, sans recharger.
6. Match mixte : les totaux Live et Analyse = ventes Weezevent + ventes POS, sans doublon.
7. Le stock Logistic du PdV baisse ; un article tombé à zéro passe « Épuisé » en caisse.
8. Un double envoi du même ticket ne crée qu'une transaction.
9. Un ticket annulé disparaît des agrégats ; rétabli, il revient.
10. ■ sur un PdV coupe immédiatement la session du vendeur.
11. Les espaces sans POS gardent exactement les mêmes chiffres qu'avant (non-régression).
12. Une addition de 34 € partagée en 3 (11,33 + 11,33 + 11,34), moyens mélangés, donne UN ticket
    de 34 € ; la clôture répartit les montants par moyen.
13. Pourboire de 2 € sur une carte : CA, TVA, Live et Analyse inchangés ; la clôture affiche 2 € de
    pourboire pour ce vendeur ; refusé si les pourboires sont désactivés sur l'évènement.

## 8. Points ouverts

Aucun. Les questions 84 à 88 de `QUESTIONS_A_BERTRAND.md` sont tranchées par Ulrich le
2026-10-16 (propositions retenues, décisions 8 à 12 de la section 1). Bertrand peut les
rouvrir ; le plan s'adaptera.

## 9. Retouches de maquette restantes

- Configuration : sélection du responsable RH par PdV ; texte « remplace la source » remplacé
  par la règle d'exploitation (piège 2).
- PIN : rester sur un PIN par PdV (décision 2), écran de connexion avec nom du vendeur (fait).
