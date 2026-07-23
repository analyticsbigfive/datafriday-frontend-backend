# 🔴 API Live events — guide d'implémentation backend

> **Statut : conception prête pour le code**, sauf mention contraire. Contrepartie backend de
> [`datafriday-web/docs/modules/11_LIVE.md`](../../../datafriday-web/docs/modules/11_LIVE.md) (conception
> UX/produit) — ce document ne redécide rien de ce qui y est déjà tranché, il précise *comment*
> l'implémenter contre le code réel : fichiers, lignes, requêtes, contrats.
>
> Owner : **Ulrich, fullstack** (backend et front, pas de split — tranché 2026-07-23, voir
> `11_LIVE.md` §9). Rédigé le 2026-07-23.

---

## 0. Ce qui bloque encore avant de coder

Deux bugs backend, trouvés en préparant ce document, **doivent être corrigés avant** d'implémenter le
signal live (ils affectent directement sa fiabilité) :

- **[BUG-109](../bugs/109_aggregation_jamais_declenchee_automatiquement.md)** — rien ne déclenche
  `queueAggregationJob()` automatiquement (ni webhook, ni cron). Sans ça, `shop-details`
  (POS Performance, KPI par shop) reste figé même une fois le polling branché côté front.
- **[BUG-108](../bugs/108_event_timeline_deletedat_non_filtre.md)** — `getEventTimelineBatch` ne
  filtre pas `SalesTransaction.deletedAt`. Le signal « event live » (§1) doit réutiliser cette même
  requête (décision déjà actée, question #20 du tracker front) : sans le fix, une transaction annulée
  après un retry Weezevent peut déclencher un faux live.

Une question produit reste ouverte et bloque uniquement l'Inventaire live (§3, pas le v1 analytics) :

- **Question #22** (tracker front) — source du stock « live ». §3 ci-dessous pose les options
  concrètes trouvées en code pour trancher plus vite, sans décider à la place de Bertrand.

Tout le reste ci-dessous peut être codé dès que BUG-108/109 sont corrigés.

---

## 1. Signal « event live »

**Définition déjà tranchée** (tracker front #20, `11_LIVE.md` §7) : au moins une vente réelle
ingérée dans les 30 dernières minutes, pour les shops mappés à l'event, dans la fenêtre
`[eventStartDate, eventEndDate]` — même logique de jointure que `event-timeline`.

### 1.1 Requête

`getEventTimelineBatch` (`src/features/spaces/spaces.service.ts:1061-1189`) est la référence : elle
résout déjà shopIds/scope d'intégration/fenêtre de dates par event pour un space. Le signal live est
une variante allégée de la même jointure — pas besoin du détail minute × shop × item, juste
`EXISTS (au moins une ligne WeezeventTransaction dans la fenêtre récente)`.

Squelette (à adapter, réutilisant `resolveShopIdsForSpace` et le pattern d'`integrationClause`
existants) :

```sql
SELECT EXISTS (
  SELECT 1
  FROM "WeezeventTransaction" t
  JOIN "Event" e ON e."tenantId" = t."tenantId"  -- fenêtre par event, cf. §1.2
  WHERE t."tenantId" = $tenantId
    AND t.status = 'V'
    AND t."deletedAt" IS NULL          -- fix BUG-108, obligatoire ici aussi
    AND t."transactionDate" >= now() - interval '30 minutes'
    AND e."spaceId" = $spaceId
    AND now() BETWEEN e."eventStartDate" AND (e."eventEndDate" + garde)
    -- + scope shopIds / integrationClause comme getEventTimelineBatch
) AS "isLive"
```

- **Garde temporelle** (`11_LIVE.md` §7) : ne pas considérer live avant `eventStartDate`, ni plus de
  quelques heures après `eventEndDate` — valeur exacte à fixer à l'implémentation (pas encore
  spécifiée, raisonnable : 2-3h de marge post-event pour couvrir un règlement tardif sans laisser un
  espace « live » toute la nuit).
- `Event.eventStartDate`/`eventEndDate` sont nullables (`schema.prisma:2212-2213`) — repli sur
  `eventDate` seule (comme `getEventTimelineBatch:1104-1108` le fait déjà pour `windowEnd`) si absents.

### 1.2 Contrat API

Deux options posées par la conception front (`11_LIVE.md` §7), non tranchées entre elles — choix
d'implémentation, pas produit :

- **(a)** champ `liveEvent: boolean` (+ `liveEventId?: string`) ajouté au payload de
  `GET /spaces` (`SpacesController.findAll` → `SpacesService.findAll`,
  `spaces.service.ts:142-237`).
- **(b)** endpoint dédié `GET /spaces/:id/live-status`.

**Recommandation** : (b) seul pour le v1. Raison trouvée en creusant `findAll` : la liste d'espaces
a un cache Redis 60s (`SPACES_LIST_CACHE_KEY`, `SPACES_CACHE_TTL = 60`, `spaces.service.ts:22-27,232`)
mais **seulement pour la requête par défaut sans filtre** (`isCacheable`, `:150`) — un champ `liveEvent`
calculé à la volée casserait soit le cache (recalcul par requête sur liste non filtrée), soit la
fraîcheur (valeur figée jusqu'à 60s). Le bouton ◉ (`11_LIVE.md` greffe A) n'a besoin de ce signal que
sur les espaces affichés à l'écran, pas sur toute pagination — un léger polling dédié (b) évite de
complexifier `findAll`. À réévaluer si le produit veut le badge ◉ visible sans naviguer (liste Home).

```
GET /spaces/:id/live-status
→ { isLive: boolean, eventId: string | null, since: string | null }
```

`since` = timestamp de la 1ère vente de la fenêtre courante (utile pour un badge « live depuis Xmin »
front, pas dans la conception initiale mais gratuit à exposer).

**Permission** : `front.fb.live` (déjà en catalogue, voir §4) — même garde que la route Live elle-même.

---

## 2. Flux analytics live (v1)

**Transport déjà tranché** : polling, pas de nouveau canal (`11_LIVE.md` §5). **Aucun nouvel
endpoint requis** pour cette partie — le front re-fetch en boucle deux endpoints existants :

| Endpoint | Fraîcheur actuelle | Action requise |
|---|---|---|
| `GET /spaces/:id/event-timeline` (`spaces.controller.ts:506`) | Déjà quasi temps réel (lit `WeezeventTransaction` en direct, webhook + cron `EVERY_10_MINUTES` en filet) | Fixer BUG-108 (`deletedAt`) avant d'en dépendre pour du live — sinon transactions annulées comptées |
| `GET /spaces/:id/shop-details` (`spaces.controller.ts:454`) | Dépend de `SpaceRevenueMinuteAgg` (RPC `get_space_shop_details`, cachée 60s côté Redis, BUG-092) — figée tant que l'agrégation n'est pas rejouée | Corriger BUG-109 (déclenchement auto) — sans ça cet endpoint reste inutilisable pour du live quel que soit le transport front |

Rien à construire ici hors les deux bugs de §0. Le rythme de polling (15s recommandé pour
`event-timeline`, `11_LIVE.md` §5) est une décision front, pas backend.

---

## 3. Inventaire live — bloqué par la question #22, options posées

**Ne pas implémenter avant que #22 soit tranchée** (tracker front). Ce qui suit pose les options
concrètes trouvées en code pour accélérer la décision et l'implémentation une fois tranchée — ce
n'est **pas** une décision.

La question posée (`11_LIVE.md` §10.4) : d'où vient le niveau de stock « en direct » — décrément par
vente, mouvements Restock, ou combinaison ?

### 3.1 Ce qui existe déjà en code, pertinent pour trancher

Le module **Logistic** (`src/features/logistics/logistics.service.ts`) résout déjà exactement ce
problème pour un autre écran, avec un pattern **combinaison** :

- `StockLevel` (`schema.prisma:2542-...`) = état matérialisé issu de `StockMovement`
  (Restock/livraisons/transferts/reset) — **sans les ventes**, par design (commentaire du modèle :
  "les ventes ne sont PAS incluses ici : elles sont dérivées read-time depuis la dernière
  réconciliation").
- `deriveSalesRaw` + `explodeSalesToConsumption` (`logistics.service.ts:1008-1033`,
  `1060+`) lisent `WeezeventTransaction`/`WeezeventTransactionItem` **en direct** (même pattern
  read-time que `event-timeline`, aucune dépendance à l'agrégation périodique — donc pas affecté par
  BUG-109) depuis une ancre (`anchorAt` = dernière réconciliation ou 1er mouvement, `:882-885`), et
  explosent les ventes en consommation par ingrédient/composant (même logique combo/recette que le
  front, `explodeSalesToConsumption` docstring `:1045-1059`).
- `getStock`-équivalent (`logistics.service.ts:~850-938`) combine les deux : `levels` (Restock) +
  `consumption` (ventes dérivées) → stock courant par élément.

**Implication pour #22** : la combinaison "mouvements Restock + décrément par vente" n'est pas une
option théorique à construire de zéro — c'est déjà le comportement de production du module Logistic,
avec une fraîcheur déjà temps réel côté ventes (lecture directe `WeezeventTransaction`, comme
`event-timeline`). Réutiliser ce calcul pour l'onglet Inventaire live (au lieu de le réinventer sur
les modèles `Inventory*`/`Stock*` séparés du domaine Post/Pre-event Inventory, cf. questions #11/#13
du tracker) est l'option la moins coûteuse trouvée en code — à confirmer côté produit, pas une
décision technique unilatérale.

⚠️ **Note découverte en marge** : `deriveSalesRaw` (`logistics.service.ts:1008-1033`) a le même trou
que BUG-108 — pas de filtre `deletedAt` sur `WeezeventTransaction`. Hors scope de BUG-108 (qui ne
couvre que `getEventTimelineBatch`), mais à vérifier/corriger dans la même veine si ce chemin est
réutilisé pour le Live.

### 3.2 Périmètre de l'arbre (autre point ouvert de #10.4)

`11_LIVE.md` §3 demande Shop → items stockables ET Item → shops (deux sens de dépliage). Le module
Logistic n'expose aujourd'hui que le premier sens (par élément). Un index inversé (par item) serait à
construire par-dessus, quelle que soit la source retenue — pas bloquant pour trancher #22 en premier.

### 3.3 Contrat API proposé (une fois #22 tranchée)

```
GET /spaces/:id/live/inventory
→ { shops: [{ shopId, shopName, items: [{ itemKey, packed, loose, ... }] }] }
```

Détail exact des champs à spécifier une fois la source de données actée (§3.1) — dépend du choix.

---

## 4. RBAC — rien à faire

`front.fb.live` existe déjà dans `permission-catalog.ts:61` (`SYSTEM_PERMISSIONS`), assigné par
défaut à « Analyste F&B » et « Achat F&B » (ADMIN l'a via `ALL_CODES`). Catalogue idempotent et
auto-appliqué — **aucune migration/backfill/seed à écrire**.

Guard à poser sur les nouvelles routes, pattern identique à `LogisticController`
(`logistics.controller.ts:26`) :

```ts
@RequirePermissions('front.fb.live')
```

---

## 5. Découpage d'implémentation (ordre de dépendance)

1. **BUG-108** — filtre `deletedAt` sur `getEventTimelineBatch` (petit fix, prérequis §1/§2).
2. **BUG-109** — déclenchement auto de l'agrégation (voir la fiche pour le détail webhook/cron).
   Prérequis pour que `shop-details` soit réellement live (§2).
3. **Signal « event live »** (§1) — requête + endpoint `GET /spaces/:id/live-status` +
   `@RequirePermissions('front.fb.live')`.
4. **Rien côté backend pour le flux analytics** (§2) — les endpoints existants suffisent une fois
   1-2 corrigés ; le front branche son polling dessus.
5. **Inventaire live** (§3) — **attend la décision #22**. Une fois tranchée : exposer
   `GET /spaces/:id/live/inventory` selon l'option retenue.

---

## 6. Références

- [`datafriday-web/docs/modules/11_LIVE.md`](../../../datafriday-web/docs/modules/11_LIVE.md) —
  conception UX/produit, décisions déjà tranchées (transport, définition event-live, route, RBAC,
  cardinalité, ownership).
- [`datafriday-web/docs/QUESTIONS_A_BERTRAND.md`](../../../datafriday-web/docs/QUESTIONS_A_BERTRAND.md)
  — questions #22 (source stock live, ouverte) et #19-21/#23 (résolues).
- [BUG-108](../bugs/108_event_timeline_deletedat_non_filtre.md),
  [BUG-109](../bugs/109_aggregation_jamais_declenchee_automatiquement.md).
- [BUG-092](../bugs/92_shopdetails_rpc_non_cachee.md) — cache 60s de `get_space_shop_details`,
  pertinent pour la fraîcheur réelle de `shop-details` en mode live.
