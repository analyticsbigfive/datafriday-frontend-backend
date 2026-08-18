# BUG-332-02 — `getLatestSalesPrices`/`getModalSalesPrices` sans filtre `tenantId` sur le JOIN → Seq Scan de toute la table, 502 côté front sur l'étape 3 du wizard

- **Statut** : 🟡 Corrigé non testé (2026-08-18, branche `fix/event-aggregation-window-precision`)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 3) / Menu & recettes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-18 — signalement utilisateur (capture d'écran) : étape 3 "Menu" du
  wizard bloquée sur "No product found for this integration", console navigateur affichant une
  erreur CORS + `502 (Bad Gateway)` sur `GET /weezevent/products?...&spaceId=...`. Diagnostiqué en
  cherchant si le déploiement précédent (BUG-317-02 à 331-02) en était la cause — confirmé sans
  rapport après investigation.
- **Fichiers** :
  - `backend/src/shared/pricing/menu-item-pricing.service.ts:497-536` (`getLatestSalesPrices`)
  - `backend/src/shared/pricing/menu-item-pricing.service.ts:624-660` (`getModalSalesPrices`)
  - `backend/src/features/weezevent/weezevent.controller.ts:681-686,818,942`
    (`deriveSalesPrices` et ses appelants)
  - `backend/src/features/menu-items/menu-items.service.ts:1061,1218`

## Symptôme

L'erreur CORS affichée par le navigateur est un symptôme, pas la cause : quand
`datafriday-api.onrender.com` ne répond pas (ici en 502), la réponse ne porte aucun header
`Access-Control-Allow-Origin`, et le navigateur affiche l'échec comme un blocage CORS au lieu d'un
504/502. `GET /health` répondait 200 de façon stable pendant l'incident — ce n'est pas le service
entier qui était en panne, seule cette requête précise expirait.

## Cause racine

`GET /weezevent/products` avec `spaceId` déclenche `getSpaceScopedLatestPrices`/
`getSpaceScopedModalPrices`, qui appellent en cascade (jusqu'à 3 fois) `getLatestSalesPrices`/
`getModalSalesPrices`. Ces deux fonctions font un `JOIN "WeezeventTransaction" t` **sans jamais
filtrer `t."tenantId"`** — seul `ti."productId" IN (...)` (côté `WeezeventTransactionItem`) est
filtré. Résultat mesuré (`EXPLAIN ANALYZE` contre la base réelle, tenant à gros volume — 346
produits, 104 477 transactions) :

```
Hash Join (...) (actual time=21378.116..22526.842 rows=152168 loops=1)
  Hash Cond: (ti."transactionId" = t.id)
  ->  Index Scan using "WeezeventTransactionItem_productId_idx" on ... (rapide, ~400ms)
  ->  Seq Scan on "WeezeventTransaction" t (...) (actual time=0.082..20583.820 rows=1824791)
Execution Time: 22798.974 ms
```

Sans filtre sur `t`, Postgres doit construire le côté hash du JOIN à partir de **toute la table
`WeezeventTransaction`** (1,8 million de lignes, tous tenants confondus) — 20,5 s de Seq Scan à
elle seule. `getModalSalesPrices` a le même défaut, mais seulement quand un filtre location est
demandé (`needsJoin = hasLoc || hasExcl` → le JOIN, donc le risque, n'existe que dans ce cas ; sans
filtre location, la requête ne joint pas `t` du tout et reste rapide par construction, ~20 ms/100
produits, cf. commentaire `deriveSalesPrices`).

Ironie : le commentaire de `getLatestSalesPrices` promettait déjà *"Requête unique indexée
(`(tenantId, locationId, transactionDate)` + `productId`)"* — l'index existe bel et bien
(`@@index([tenantId, locationId, transactionDate])` sur `WeezeventTransaction`), mais n'était
jamais engagé faute du filtre correspondant dans le `WHERE`. Les fonctions sœurs du même fichier
(`getLatestSalesPricesByName`, `getLatestSalesPricesByWeezeventId`, et leurs variantes `Modal`)
ont **déjà** `t."tenantId" = ${tenantId}` dans leurs `conds` — seules `getLatestSalesPrices`/
`getModalSalesPrices` (les variantes par `productId`, les plus utilisées) en étaient dépourvues.

## Correction

Corrigée en code le 2026-08-18 :

1. `tenantId` ajouté comme premier paramètre obligatoire de `getLatestSalesPrices` et
   `getModalSalesPrices`. `getLatestSalesPrices` (JOIN toujours présent) ajoute
   `t."tenantId" = ${tenantId}` inconditionnellement. `getModalSalesPrices` ne l'ajoute que si
   `needsJoin` est vrai (le "fast path" sans JOIN reste intact, aucune régression de perf dessus).
2. Les 6 appels internes (`getSpaceScopedLatestPrices`/`getSpaceScopedModalPrices`) et les 3
   appelants externes (`menu-items.service.ts:1061,1218`, `weezevent.controller.ts` via
   `deriveSalesPrices`, appelée en 2 points) mis à jour pour transmettre `tenantId` (déjà
   disponible dans chacun de ces contextes — aucun changement de signature en amont nécessaire).
3. **Vérifié empiriquement contre la base réelle** (mêmes 346 produits) : 22,8 s → 3,8-5,8 s
   (`EXPLAIN ANALYZE` bascule de `Seq Scan` à `Index Scan using "WeezeventTransaction_tenantId_idx"`).
   Amélioration nette (4-6×), sous les timeouts habituels de proxy — mais ce tenant reste gros
   (264 642 transactions rien que sur son `tenantId`) : la construction du hash join prend encore
   ~2,6 s. Optimisation plus poussée (index composite `(productId, transactionDate)` sur
   `WeezeventTransactionItem`, ou restructuration pour éviter le tri) non traitée ici — hors
   périmètre de ce correctif ciblé.
4. `tsc --noEmit` propre (confirme qu'aucun appelant n'a été oublié).

## Risque de régression / à surveiller

- Pas de suite de tests existante pour `menu-item-pricing.service.ts` — vérification faite par
  `EXPLAIN ANALYZE` contre données réelles plutôt que par test unitaire mocké.
- Surveiller si d'autres tenants à très gros volume (>200k transactions) rencontrent encore des
  lenteurs sur cette route malgré le fix — signal qu'il faudrait alors l'optimisation plus poussée
  mentionnée au point 3.
- Non déployé au moment de la rédaction de cette fiche.

## Références

- `menu-item-pricing.service.ts:258,292,386,415` — le même correctif déjà en place sur les
  variantes `ByName`/`ByWeezeventId`, modèle repris ici à l'identique.
- Signalement initial : capture d'écran utilisateur, étape 3 du wizard bloquée sur
  `integrationId=cmqqlxn0i0vxg13mbgdnplq9m`/`spaceId=cmruyeydx0001vt9qglynf319`.
