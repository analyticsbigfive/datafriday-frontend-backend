# Migrations Prisma — champs décimaux

> Chantier « saisie/affichage des décimaux » (2026-08-02).
>
> **§1 et §2 : APPLIQUÉES** le 2026-08-02 —
> migration [`20260802160000_sales_quantities_float_reduction_10_2`](../prisma/migrations/20260802160000_sales_quantities_float_reduction_10_2/migration.sql),
> déployée via `prisma migrate deploy` (`DIRECT_URL`) sur la base pointée par
> `.env` à cette date (projet Supabase `alsgdtewqeldrrquypdy`, même réf que
> `.env.backup-supabase-dev`). Vérifié en base après coup
> (`information_schema.columns`) : `WeezeventTransactionItem.quantity`,
> `WeezeventPayment.quantity`, `SpaceRevenueMinuteAgg.itemsCount`,
> `SpaceProductRevenueDailyAgg.quantity` sont bien `double precision` ;
> `WeezeventTransactionItem.reduction` est bien `numeric(10,2)`. Code aligné
> (`aggregation.service.ts` casts `::float8`, types de lignes `space-aggregation.service.ts`,
> retrait du `Math.trunc` dans `digifood-ingestion.service.ts`) ; `tsc --noEmit`
> et les suites de tests concernées (`digifood`, `aggregation`, `weezevent`,
> `logistics`, `decimal-validation`) passent.
>
> **§3 : PAS appliquée** — décision produit posée en question #48 du tracker
> [`QUESTIONS_A_BERTRAND.md`](../../frontend/docs/QUESTIONS_A_BERTRAND.md).
>
> **§4 et §5 : reportées**, hors périmètre du chantier décimaux (voir détail).

## 1. `SalesTransactionItem.quantity` : `Int` → `Float` — perte de CA réelle ✅ appliquée

- `schema.prisma` L~1502 : `quantity Int`.
- L'ingestion Digifood **tronque** les quantités fractionnaires
  (`digifood-ingestion.service.ts` : `Math.trunc(item.quantity)`) alors que le
  normalizer produit des quantités flottantes (vente au poids, formules à
  ratio : `ownQty * parentQty`). Chaque troncature = du chiffre d'affaires en
  moins dans les agrégats.
- Migration en cascade nécessaire :
  - `SalesTransactionItem.quantity Int → Float`
  - `SalesPayment.quantity Int → Float` (même limite)
  - `SpaceProductRevenueDailyAgg.quantity Int → Float` + le cast
    `SUM(ti."quantity")::int` dans `aggregation.service.ts` → `::float8`
  - `SpaceRevenueMinuteAgg.itemsCount Int → Float` (ou garder Int si on assume
    l'arrondi d'un compteur d'items)
  - retirer le `Math.trunc` de `digifood-ingestion.service.ts:80`
- Types TS inchangés (Prisma `Float` → `number`) : pas de ripple de code hors
  les points listés.

```sql
ALTER TABLE "WeezeventTransactionItem" ALTER COLUMN "quantity" TYPE double precision;
ALTER TABLE "WeezeventPayment"         ALTER COLUMN "quantity" TYPE double precision;
ALTER TABLE "SpaceProductRevenueDailyAgg" ALTER COLUMN "quantity" TYPE double precision;
```

## 2. `SalesTransactionItem.reduction` : `Decimal(5,2)` → `Decimal(10,2)` — overflow à 999,99 € ✅ appliquée

- C'est un **montant** de remise (utilisé comme tel dans `aggregation.service.ts`
  et `menu-item-pricing.service.ts`), pas un pourcentage. Plafonné aujourd'hui à
  999,99 € : overflow Postgres sur une grosse remise/annulation.

```sql
ALTER TABLE "WeezeventTransactionItem" ALTER COLUMN "reduction" TYPE numeric(10,2);
```

## 3. `MenuItem.numberOfPiecesRecipe` : `Int?` → `Float?` — asymétrie avec MenuComponent 🔴 en attente (question #48)

- Diviseur du coût recette. `MenuComponent.numberOfUnitsRecipe` est `Float?`
  (« peut être fractionnaire, ex. 0.75 kg ») mais l'équivalent MenuItem est `Int?`.
- Si appliqué : passer le DTO de `@IsInt @Min(1)` à `@IsNumber @IsPositive`
  (`create-menu-item.dto.ts`) et le champ frontend `MenuItemCreateView` de
  `:decimals="0"` à `:decimals="3"`.
- À valider avec le métier : un « nombre de pièces » fractionnaire a-t-il un sens
  pour les MenuItems ? (Pour les composants c'est un rendement de batch, oui.)
  → posée le 2026-08-02 en question #48 de
  [`QUESTIONS_A_BERTRAND.md`](../../frontend/docs/QUESTIONS_A_BERTRAND.md) —
  ne pas trancher seul, en attente de réponse.

```sql
ALTER TABLE "MenuItem" ALTER COLUMN "numberOfPiecesRecipe" TYPE double precision;
```

## 4. Domaine RH/staffing/builder : `Float` → `Decimal` — non recommandé à court terme

`HrRole.rate`, `HrPerson.hourlyRate`, `EventStaffLine.hourlyRate`,
`HrGoal.goalPerTpe`, `ElementPerformance.staffCost/revenue`,
`EventPredictVersion.totalRevenue`… sont des montants stockés en `Float`.

Le passage en `Decimal` changerait le type TS (`number` → `Prisma.Decimal`) et
rippelerait dans tout le code staffing/predict pour un gain marginal (les
montants sont arrondis à 2 décimales avant persistance). **Reporté** — l'arrondi
`round2` du staffing devrait par contre adopter `Number.EPSILON` comme
`menu-item-pricing.service.ts` (fait nulle part ailleurs qu'au pricing).

## 5. Divers observés, hors périmètre décimaux

- `InventoryCount.discardedQuantity Int` : pertes en casse de pack impossibles.
- `UnmappedDataMetrics.revenueHt` reçoit `SUM(t.amount)` (TTC) aliasé « HT »
  (`space-aggregation.service.ts::trackUnmappedData`) — mal nommé, à corriger
  avec une vraie dérivation HT ou un renommage.
