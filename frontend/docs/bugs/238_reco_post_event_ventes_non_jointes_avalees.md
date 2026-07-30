# BUG-238 — Réconciliation post-event : les ventes non jointes (PdV ou article) sont silencieusement comptées 0

- **Statut** : 🟡 Corrigé non déployé (2026-07-24, branche `feat/postEventInventory` — migration SQL + redéploiement backend requis)
- **Sévérité** : 🟠 Majeur (des ventes réelles disparaissent du calcul → `Qty Sold` sous-évalué, `Missing` et `Miss €` gonflés d'autant, dans un document à vocation anti-perte — et rien à l'écran ne signale la perte de données)
- **Domaine** : Stock — Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §7.2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-24 (vérification de l'implémentation Pre/Post-event contre la doc)
- **Fichiers** : `src/views/SpaceInventoryView.vue:1920-1947` (`buildReconciliationLines`, collecte des ventes), `:1928-1929` (`if (!elId) continue`), `:1930-1935` (`if (!itemId) continue`)

## Symptôme

Sur un document post-event, une buvette dont les ventes existent pourtant dans l'event-timeline
affiche `Qty Sold = 0`, donc `Qty left = pré-event − 0` et `Missing = Qty left − compté` ≈ tout le
stock consommé pendant le match. Le document conclut à un manquant massif (valorisé en « Miss € »)
là où il n'y a eu que des ventes normales.

Déclencheurs réels observables :

- le libellé du PdV côté POS/Weezevent diffère du `name` du `SpaceElement` compté (renommage dans le
  builder, import brut, accent/espace non identique après normalisation) ;
- l'article vendu n'a ni `menuItemId`/`mappedMenuItemId` correspondant au référentiel compté, ni nom
  normalisé identique.

Aucun compteur, toast, chip ou log ne mentionne les lignes écartées : le document est créé et
persisté comme s'il était complet.

## Cause racine

Dans `buildReconciliationLines` (`SpaceInventoryView.vue:1920-1947`), chaque record de ventes est
joint au référentiel affiché puis **abandonné en silence** si la jointure échoue :

```js
const elId = elementIdByNormName.get(normalizeStr(r.shopName || r.shop || ''))
if (!elId) continue // PdV de vente non présent dans la config comptée
const itemId = (r.menuItemId && String(r.menuItemId)) || … || itemIdByNormName.get(…) || null
if (!itemId) continue // vente non rattachable à un article inventorié
```

Les clés non jointes ne produisent pas de ligne, mais surtout elles ne retirent rien du calcul : la
clé `(PdV, article)` existe par ailleurs via le comptage et le pré-event, et se retrouve donc avec
`soldUnits = 0` (`postEventReconciliation.js:84`, `toUnits(undefined) → 0`).

C'est exactement le scénario que la session du 2026-07-24 a corrigé pour l'échec **global** du
chargement des ventes (`salesFetchFailed` → refus de créer le document, §12.1) : la version
**partielle** du même problème est restée. Le chemin pre-event, lui, remonte déjà ses jointures
manquées (`inventory.service.ts:492-511`, `unjoinedItemKeys` + `logger.warn`) — l'asymétrie est le
signe que le cas a été oublié côté front.

## Correction

Corrigé le 2026-07-24 — volet « signal » (le volet sémantique `sold = null` reste une question
produit, ci-dessous) :

- `buildReconciliationLines` ([SpaceInventoryView.vue](../../src/views/SpaceInventoryView.vue))
  compte ce qu'il écarte : `unjoinedShops`, `unjoinedItems`, `unjoinedUnits`, avec un
  `console.warn` détaillé. La jointure article vérifie en plus que l'id résolu **existe dans le
  référentiel compté** (`itemId in itemNameById`) — un `menuItemId` inconnu produisait jusque-là une
  ligne fantôme sans nom.
- Ces compteurs partent avec le document : `POST /inventory/:spaceId/reconciliations` accepte
  `salesUnjoined` / `preEventSource` / `countedProgress`
  ([create-post-event-reconciliation.dto.ts](../../../backend/src/features/inventory/dto/create-post-event-reconciliation.dto.ts)),
  persistés dans la **nouvelle colonne** `StockReconciliation.meta` (migration idempotente
  [`2026-07-24_stockreconciliation_meta.sql`](../../../backend/prisma/sql/2026-07-24_stockreconciliation_meta.sql)).
- `InventoryReconciliationView` affiche un bandeau listant les unités non rattachées et les premiers
  noms en cause (clés i18n `invRecoMeta*`, EN/FR). Documents antérieurs (`meta` null) : aucun
  bandeau — et aucun message rassurant fabriqué non plus.
- Réflexe [BUG-228](228_inventory_snapshot_kind_rejete_backend_perime.md) : le DTO backend est en
  whitelist stricte. Sur un serveur pas encore redéployé, le POST renvoie 400
  « property … should not exist » — le front **réessaie sans les champs de contexte** plutôt que de
  perdre le document.

Reste à trancher (question ouverte, pas un bug) : une clé sans **aucune** vente rattachée doit-elle
valoir `sold = 0` (état actuel) ou `sold = null` → colonnes « — » ? La distinction demande de
séparer « ce PdV n'a rien vendu » de « ce PdV n'apparaît pas dans la timeline ».

Tests : `createPostEventReconciliation — meta` (backend) vérifie l'archivage du contexte.

## Risque de régression / à surveiller

- Les documents déjà archivés contiennent ces faux manquants : ils ne sont pas recalculés (un
  document est une photo figée). Prévoir une passe de contrôle sur les documents existants avant de
  s'en servir comme preuve de perte.
- Vérifier que le comptage des non-jointes n'assimile pas les PdV **légitimement** absents du
  périmètre compté (un PdV de la config vendeuse mais hors inventaire) à une anomalie.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §7.2 (tableau des
  4 sources), §12.1 (correctif de l'échec global des ventes)
- Question métier voisine (jamais la même) : [`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md)
  #35 (explosion BOM des articles composés) — #35 traite des ventes rattachées au mauvais **grain**,
  cette fiche des ventes **jamais rattachées**.
- Précédent Analyse sur le même mécanisme de non-jointure : [BUG-014 / question #14](../QUESTIONS_A_BERTRAND.md)
  (bucket « Non rattachés »)
