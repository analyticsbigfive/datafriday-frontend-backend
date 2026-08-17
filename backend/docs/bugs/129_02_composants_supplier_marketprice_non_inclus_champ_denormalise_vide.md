# BUG-129-02 — Composants : marketPrice non inclus pour la résolution fournisseur + champ dénormalisé vide

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Achats & référentiels
- **Repo(s) concerné(s)** : `api-datafriday-staging` + `datafriday-web` (fiche miroir front)
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/features/menu-components/menu-components.service.ts`, `src/features/ingredients/ingredients.service.ts`

## Symptôme

Colonne Supplier toujours vide côté front (`ComponentCreateView.vue`) — voir fiche miroir
[`326_02_composants_colonne_supplier_jamais_peuplee.md`](../../../frontend/docs/bugs/326_02_composants_colonne_supplier_jamais_peuplee.md).

## Cause racine

Deux problèmes distincts :

1. `MenuComponentsService.includeRelations.ingredients.include` ne chargeait que
   `{ ingredient: true }` — aucune donnée `marketPrice` pour l'ingrédient d'une ligne de composant.
   Sans ça, impossible pour le front de résoudre le fournisseur d'un sous-composant (qui nécessite
   `GET /menu-components/:childId` → `ingredients[].ingredient.marketPrice.supplier`).
2. Même une fois `marketPrice` inclus : constaté en base (requête directe Supabase) que le champ
   `MarketPrice.supplier` (string dénormalisée) est **vide** sur des lignes réelles alors que
   `supplierId` pointe vers un `Supplier` valide et nommé (ex. id `cmpa2xuy20000cmg80y4p2jpv` →
   "Metro Auxerre") — désynchronisation de données historiques, `supplier` n'a probablement jamais
   été retro-rempli après la création du champ `supplierId`/de la relation `supplierRel`.
   `IngredientsService.findOne()` incluait déjà `marketPrice: true` mais pas la relation
   `supplierRel` imbriquée — donc même le endpoint ingrédient (déjà correct sur le papier) ne
   permettait pas de contourner le champ vide.

## Correction

- `IngredientsService.findOne()` : `include: { marketPrice: { include: { supplierRel: true } }, ... }`.
- `MenuComponentsService.includeRelations.ingredients.include.ingredient` :
  `include: { marketPrice: { select: { supplier: true, supplierId: true, supplierRel: { select: { name: true } } } } }`
  — select scopé (pas `MarketPrice.image`, potentiellement un base64 volumineux) pour ne pas
  alourdir `findAll()` (liste catalogue, même `includeRelations`, TTL 60s côté Redis).
- Front : priorise désormais `marketPrice.supplierRel?.name` avant `marketPrice.supplier` — même
  ordre de repli déjà utilisé ailleurs dans le code frontend (`IngredientPickerDrawer.vue`), qui
  n'avait simplement pas été répliqué ici au premier passage.

## Risque de régression / à surveiller

Payload légèrement plus lourd sur `GET /menu-components` (liste ET détail) — 3 champs scopés par
ligne d'ingrédient, jugé acceptable. Le champ `MarketPrice.supplier` dénormalisé reste la source
"rapide" prioritaire quand il est renseigné (`supplierRel.name` n'est qu'un repli) — ce fix ne
corrige pas la désynchronisation de données elle-même (pourquoi `supplier` est vide sur certaines
lignes malgré un `supplierId` valide), seulement son impact d'affichage. Si le volume de lignes
`MarketPrice` avec `supplier` vide est important, un backfill (`UPDATE "MarketPrice" SET supplier =
(SELECT name FROM "Supplier" WHERE id = "MarketPrice"."supplierId") WHERE supplier IS NULL OR
supplier = ''`) réglerait la cause à la source plutôt que le contournement en lecture — non fait
ici, décision produit à valider avant d'y toucher (données en prod). `npx tsc --noEmit` passe.

## Références

- [`326_02_composants_colonne_supplier_jamais_peuplee.md`](../../../frontend/docs/bugs/326_02_composants_colonne_supplier_jamais_peuplee.md) (fiche miroir front).
