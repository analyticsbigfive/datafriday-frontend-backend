# 🔴 API Live events — guide d'implémentation backend

> **Statut : v1 analytics implémenté** (§1, §2, §5) — sauf mention contraire. Contrepartie backend de
> [`datafriday-web/docs/modules/11_LIVE.md`](../../../datafriday-web/docs/modules/11_LIVE.md) (conception
> UX/produit) — ce document ne redécide rien de ce qui y est déjà tranché, il précise *comment*
> c'est implémenté contre le code réel : fichiers, lignes, requêtes, contrats.
>
> Owner : **Ulrich, fullstack** (backend et front, pas de split — tranché 2026-07-23, voir
> `11_LIVE.md` §9). Rédigé le 2026-07-23, mis à jour le 2026-07-23 (implémentation §0/§1/§5).

---

## 0. Ce qui bloquait avant de coder — statut

Deux bugs backend, trouvés en préparant ce document, **bloquaient** le signal live (ils en
affectaient directement la fiabilité) — **les deux sont corrigés** :

- **[BUG-109](../bugs/109_aggregation_jamais_declenchee_automatiquement.md)** 🟢 — déclenchement
  automatique de l'agrégation câblé (post-webhook + cron de secours, voir la fiche pour le détail).
  `shop-details` (POS Performance, KPI par shop) se met désormais à jour toute seule.
- **[BUG-108](../bugs/108_event_timeline_deletedat_non_filtre.md)** 🟢 — `getEventTimelineBatch`
  filtre maintenant `deletedAt IS NULL`, comme le signal live (§1) qui réutilise la même logique.

Une question produit reste ouverte et bloque uniquement l'Inventaire live (§3, pas le v1 analytics) :

- **Question #22** (tracker front) — source du stock « live ». §3 ci-dessous pose les options
  concrètes trouvées en code pour trancher plus vite, sans décider à la place de Bertrand.

Le v1 (§1, §2) est implémenté et testé (voir §5). Seul le §3 (Inventaire live) reste à faire, et
attend #22.

---

## 1. Signal « event live » — 🟢 implémenté

**Définition déjà tranchée** (tracker front #20, `11_LIVE.md` §7) : au moins une vente réelle
ingérée dans les 30 dernières minutes, pour les shops mappés à l'event, dans la fenêtre
`[eventStartDate, eventEndDate]` — même logique de jointure que `event-timeline`.

### 1.1 Requête

`SpacesService.getLiveStatus()` (`spaces.service.ts`, juste avant `getWeezeventEventsForSpace`) :

1. Résout le (au plus un, cardinalité tranchée #23) event dont la fenêtre
   `[eventStartDate ?? eventDate, (eventEndDate ?? eventDate) + 3h]` couvre l'instant présent —
   candidats bornés à `eventDate >= now - 7j` côté DB (perf), filtre de fenêtre précis appliqué en
   mémoire.
2. Si un event est trouvé, résout `shopIds`/`integrationId` avec les mêmes helpers que
   `getEventTimelineBatch` (`resolveShopIdsForSpace`, `locationSpaceMapping`).
3. `$queryRaw` : `MIN(transactionDate)` sur `WeezeventTransaction` filtré `status='V'`,
   `deletedAt IS NULL` (BUG-108), scope shop/intégration identique à `getEventTimelineBatch`, borné à
   `GREATEST(now - 30min, eventStartDate)` — la vente doit être à la fois récente ET dans la fenêtre
   de l'event (pas une vente de test pré-event, même garde que la définition #20).

Grace de 3h alignée avec `WeezeventCronService.LIVE_AGGREGATION_GRACE_HOURS` (filet de sécurité
BUG-109) — les deux implémentent la même définition d'« event en direct ».

### 1.2 Contrat API — implémenté

Option retenue : **endpoint dédié**, pas un champ sur `GET /spaces` — raison : la liste d'espaces a
un cache Redis 60s (`SPACES_LIST_CACHE_KEY`, `SPACES_CACHE_TTL = 60`, `spaces.service.ts:22-27,232`)
mais **seulement pour la requête par défaut sans filtre** (`isCacheable`, `:150`) — un champ
`liveEvent` calculé à la volée aurait cassé soit le cache, soit la fraîcheur. À réévaluer si le
produit veut le badge ◉ visible sans naviguer (liste Home).

```
GET /spaces/:id/live-status   (spaces.controller.ts, @RequirePermissions('front.fb.live'))
→ { isLive: boolean, eventId: string | null, since: string | null }
```

`since` = timestamp ISO de la 1ère vente de la fenêtre live courante (badge « live depuis Xmin »
front, gratuit à exposer). Tests : `spaces.service.spec.ts` describe `getLiveStatus` (5 cas : pas
d'event dans la fenêtre, event hors grace, event sans shops, vente récente → live, event stale sans
vente récente → pas live).

---

## 2. Flux analytics live (v1) — 🟢 prêt côté backend

**Transport déjà tranché** : polling, pas de nouveau canal (`11_LIVE.md` §5). **Aucun nouvel
endpoint requis** pour cette partie — le front re-fetch en boucle deux endpoints existants, tous
deux maintenant fiables pour du live (les deux bugs de §0 étaient les seuls obstacles) :

| Endpoint | Fraîcheur |
|---|---|
| `GET /spaces/:id/event-timeline` (`spaces.controller.ts:506`) | Quasi temps réel (lit `WeezeventTransaction` en direct) + `deletedAt` filtré (BUG-108) |
| `GET /spaces/:id/shop-details` (`spaces.controller.ts:454`) | `SpaceRevenueMinuteAgg` maintenant réagrégée automatiquement (BUG-109) — reste cachée 60s côté Redis (RPC `get_space_shop_details`, BUG-092), donc légèrement en retrait de `event-timeline` mais plus figée indéfiniment |

Rien à construire ici. Le rythme de polling (15s recommandé pour `event-timeline`, `11_LIVE.md` §5)
est une décision front, pas backend.

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

## 5. Découpage d'implémentation (ordre de dépendance) — statut

1. 🟢 **BUG-108** — filtre `deletedAt` sur `getEventTimelineBatch`.
2. 🟢 **BUG-109** — déclenchement auto de l'agrégation (post-webhook + cron de secours).
3. 🟢 **Signal « event live »** (§1) — `GET /spaces/:id/live-status`,
   `@RequirePermissions('front.fb.live')`, testé.
4. 🟢 **Rien côté backend pour le flux analytics** (§2) — les endpoints existants suffisent, déjà
   fiables ; le front peut brancher son polling dessus.
5. ⏳ **Inventaire live** (§3) — **attend la décision #22**. Une fois tranchée : exposer
   `GET /spaces/:id/live/inventory` selon l'option retenue.

**Reste à faire pour boucler le v1 : rien côté backend.** Le front peut commencer les greffes A/B/C/D
(`11_LIVE.md` §8bis) dès maintenant — bouton ◉ sur `space.liveEvent`/appel à `live-status`, entrée
Tools, route `space-live`, mode flux de `AnalyseView.vue` pollant `event-timeline`/`shop-details`.

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
