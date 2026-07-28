# BUG-057 — `bulkCreate` : comparer un champ `Decimal` (`price`) à un `number` JS brut échoue silencieusement, dédoublonnage totalement inopérant

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/features/market-prices/market-prices.service.ts:401-409` (avant fix, dédoublonnage introduit par BUG-055/056)

## Symptôme

Malgré les fix BUG-055 (dédoublonnage à l'insertion) et BUG-056 (rapprochement fournisseur par
texte/supplierItem en plus de supplierId), des doublons continuaient d'être créés à chaque
réimport pour certains articles (Ketchup - Bidon, Paprika, Salade Iceberg) alors que le prix,
l'unité, le fournisseur et le supplierItem étaient rigoureusement identiques à la ligne déjà
existante.

## Cause racine

**Prisma ne matche pas correctement un champ `Decimal` comparé à un `number` JavaScript brut dans
un `where`.** Confirmé par test direct contre la base :

```js
// price stocké en base : Decimal("9.80")
await prisma.marketPrice.findFirst({ where: { price: 9.8 } })        // → null (NO MATCH)
await prisma.marketPrice.findFirst({ where: { price: "9.8" } })      // → trouve la ligne
await prisma.marketPrice.findFirst({ where: { price: new Prisma.Decimal(9.8) } }) // → trouve la ligne
```

Le dédoublonnage de `bulkCreate()` (introduit par BUG-055) comparait `price: dto.price` — `dto.price`
étant un `number` JS (`CreateMarketPriceDto.price: number`). Cette comparaison échouait
silencieusement (aucune erreur, `findFirst` renvoie juste `null`) dès que le prix avait une partie
décimale non triviale en base 2 (9.8, 8.54, 9.3 — constaté ; en revanche 21.4 semblait fonctionner
par coïncidence de représentation binaire, ce qui a longtemps masqué le bug lors des tests
précédents). Résultat concret : **la vérification de doublon entière était un no-op silencieux
pour la plupart des prix réels**, quel que soit le raffinement apporté par ailleurs au
rapprochement fournisseur (BUG-056) — `price` étant une condition `AND` de premier niveau, si elle
ne matche jamais, aucune ligne existante n'est jamais trouvée, peu importe le reste de la requête.

C'est un piège Prisma classique et non documenté de façon évidente : l'écriture (`create`/`update`
avec `data: { price: 9.8 }`) fonctionne parfaitement (Prisma convertit correctement le `number` en
`Decimal` à l'écriture) — seule la comparaison dans un `where` est affectée, ce qui rend le bug
facile à ne jamais remarquer si on ne teste que la création.

## Correction

`price: dto.price` → `price: String(dto.price)` dans la requête de dédoublonnage. Confirmé par
requêtes directes en base que les 3 cas précédemment en échec (Ketchup - Bidon, Paprika, Salade
Iceberg) matchent désormais correctement leur ligne existante.

Un audit exhaustif de tout `backend/src` a été fait pour vérifier qu'aucune autre requête Prisma
ne compare un champ `Decimal` (24 modèles concernés : `MarketPrice`, `Ingredient`, `Packaging`,
`MenuItem`, `SalesTransaction`, etc.) à un `number` brut dans un `where`/`update`/`deleteMany` —
aucune autre occurrence vivante trouvée. Un exemple de code déjà correct existe dans
`digifood-ingestion.service.ts:170-180` (`isDuplicateRefund`), qui enveloppe explicitement en
`new Prisma.Decimal(...)` avant comparaison — pattern à suivre pour toute future requête de ce type.

## Risque de régression / à surveiller

- **Nettoyage des données** : les doublons déjà créés par ce bug (avant ce fix) restent en base
  et doivent être supprimés manuellement (Ketchup - Bidon, Paprika, Salade Iceberg, Badiane —
  reconnaissables à leur date d'ajout correspondant aux tests d'import de cette session).
- Vérifier qu'un réimport du même fichier après ce fix ne recrée plus aucune des lignes déjà
  présentes, y compris pour des prix à décimales non triviales (9.8, 8.54, 9.3, etc. — pas
  seulement des valeurs qui "marchent par coïncidence" comme 21.4).
- **Vigilance future** : si un dédoublonnage similaire est ajouté un jour pour `Ingredient`,
  `Packaging` ou `MenuItem` (aucun de ces modèles n'a de contrainte `@@unique` empêchant les
  doublons métier), toujours envelopper la comparaison d'un champ `Decimal` en `String(...)` ou
  `new Prisma.Decimal(...)` — ne jamais comparer un `Decimal` à un `number` JS brut dans un `where`.

## Références

- Fiche miroir frontend : `datafriday-web/docs/bugs/51_market_prices_import_csv_dedup_decimal_number_mirror.md`.
- [[55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons]], [[56_market_prices_bulkcreate_dedup_supplierid_fragile]] — dédoublonnage introduit puis affiné, dont ce bug rendait l'effet nul en pratique.
