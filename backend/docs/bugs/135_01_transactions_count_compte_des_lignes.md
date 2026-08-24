# BUG-135-01 — `SpaceRevenueMinuteAgg."transactionsCount"` comptait des LIGNES, pas des tickets

- **Statut** : 🟡 Corrigé non déployé (recalcul de l'historique à appliquer à la main)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux — fiche miroir web **BUG-354-01**
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/features/aggregation/aggregation.service.ts:477`, `src/features/spaces/services/space-aggregation.service.ts:174`, `src/features/aggregation/aggregation.service.ts:608-633`, `supabase/migrations/20260818120000_shop_details_rpc_costmap_from_mappings.sql:291,313`, `prisma/migrations/20260824120000_fix_transactions_count/migration.sql`

## Symptôme

Espace Le Mans FC, « Le Mans-Brest » du 22/08/2026 :

| Mesure | Valeur |
|---|---|
| `Event.transactionCount` en base | **13 925** |
| lignes de vente réelles (`COUNT(WeezeventTransactionItem.id)`) | **13 925** |
| tickets distincts réels (`COUNT(DISTINCT WeezeventTransaction.id)`) | **5 721** |
| panier moyen affiché | **4,71 €** (au lieu de **11,46 €**) |

Le compteur publiait, au chiffre près, le nombre de lignes de vente.

## Cause racine

**Deux écrivains, sémantiques contradictoires, même colonne.**

| Fichier:ligne | Expression | Verdict |
|---|---|---|
| `src/features/aggregation/aggregation.service.ts:477` | `COUNT(ti."id")::int` | ❌ compte des **lignes** |
| `src/features/spaces/services/space-aggregation.service.ts:174` | `COUNT(DISTINCT t.id)` | ✓ |

Le grain de `SpaceRevenueMinuteAgg` est `(minute × locationId × merchantId × spaceElementId)`. Une
transaction n'a qu'une date, une location et un merchant : elle tombe donc dans **exactement un**
groupe, et `COUNT(DISTINCT t."id")` y est **additif**. `COUNT(ti."id")`, lui, comptait autant de
fois qu'il y avait de lignes dans le panier.

Propagation : `aggregation.service.ts:608-633` remonte `Event.revenue` / `Event.transactionCount` /
`Event.avgSpendPerTx` depuis cette colonne, et le RPC `get_space_shop_details` la somme aussi
(`:291,313`). Tout ce qui divise par « transactions » héritait donc du défaut.

À ne pas confondre avec `SpaceRevenueMinuteItemAgg."transactionsCount"`
(`aggregation.service.ts:572`), qui est bien `COUNT(DISTINCT t."id")` mais dont le grain inclut
`ti."productId"` : **non additif** au-delà du grain article. C'est le volet frontend, traité dans la
fiche miroir web BUG-354-01.

## Correction

`aggregation.service.ts:477` : `COUNT(ti."id")::int` → `COUNT(DISTINCT t."id")::int`. Les deux
écrivains sont désormais alignés sur la même définition.

**Recalcul de l'historique** — décision JLH 2026-08-24 : fichier SQL ensembliste appliqué à la main
(ADR-0002), `prisma/migrations/20260824120000_fix_transactions_count/migration.sql`. Deux `UPDATE` :

1. `SpaceRevenueMinuteAgg."transactionsCount"` recalculé **par le grain**, jamais par
   `weezeventEventId` — les deux pipelines taguent cette colonne avec des conventions d'id
   différentes (`Event.id` DataFriday d'un côté, `WeezeventEvent.id` brut de l'autre) ;
2. re-rollup de `Event.transactionCount` / `Event.avgSpendPerTx`, **restreint aux événements dont
   TOUTES les lignes ont pu être rattachées à l'étape 1** (196 sur 305, vérifié). Un événement
   partiellement réparé donnerait une somme hybride — moitié tickets, moitié lignes — fausse et
   surtout **indétectable** : `verify-event-analytics.ts` signalait jusqu'ici le défaut par
   l'égalité « transactionCount == nombre de lignes », que ce mélange aurait cassée en silence. Les
   événements partiels gardent donc leur valeur visiblement fausse jusqu'à re-agrégation, et le
   script mesure désormais la couverture de réparation au lieu de la déduire.

Zéro backtick dans ce SQL (règle projet, BUG-286-01). Idempotent. Contrôles avant/après en
commentaire d'en-tête, dont le cas Le Mans-Brest.

Validation à blanc du SQL sur dev, en lecture seule : **2 564 lignes matchées, 2 008 modifiées,
somme 13 925 → 5 721** sur l'événement de référence.

## Risque de régression / à surveiller

- **Le recalcul ne répare que ce qu'il peut rattacher au grain courant : 282 250 lignes sur
  547 954.** Les 265 704 restantes portent une convention antérieure (`spaceElementId` d'un mapping
  depuis modifié, ou `weezeventMerchantId` recopié de `locationId` avant BUG-014) — leur grain ne
  correspond plus à la réalité et réparer leur seul compteur serait cosmétique. Par événement :
  **196 entièrement réparables, 55 partiellement, 54 pas du tout** (aucun postérieur au 2026-06-19).
  Ces **109 événements demandent une re-agrégation complète** :
  `POST /aggregation/process-events` sur leur espace. La requête qui les liste est en commentaire
  d'en-tête de la migration.
- **Divergence des deux écrivains, non traitée ici** : `space-aggregation.service.ts` joint
  `WeezeventLocationShopMapping` sur `t."merchantId"` (`:178-181`) là où tout le reste joint sur
  `t."locationId"`, et filtre `status = 'V'` là où `aggregation.service.ts` ne filtre pas. Tant que
  les deux coexistent, `POST /spaces/:id/dashboard/rebuild` et le pipeline BullMQ n'écrivent pas
  exactement les mêmes lignes. Le recalcul applique la sémantique canonique
  (`aggregation.service.ts`). **Fiche dédiée à ouvrir.**
- Tests ajoutés (`aggregation.service.spec.ts`) : `COUNT(DISTINCT t."id")::int` présent et
  `COUNT(ti."id")` absent de l'exécutable ; le grain de `SpaceRevenueMinuteAgg` ne contient pas
  `ti."productId"` (sinon la colonne cesserait d'être additive).
- Vérification : `scripts/verify-event-analytics.ts --event=<Event.id>` (lecture seule).

## Références

- Fiche miroir web : **BUG-354-01** (`web/docs/bugs/354_01_transactions_comptent_des_lignes.md`).
- Fiches liées : web BUG-353-01 (l'Analyse dépendait du SpaceMenu), api
  [BUG-136-01](136_01_scope_ventes_une_seule_integration.md) (scope d'intégration des paniers).
- [BUG-014](../bugs/) — origine du `weezeventMerchantId` recopié de `locationId`.
- [ADR-0002](../adr/) — migrations appliquées à la main.

---

*JLH*
