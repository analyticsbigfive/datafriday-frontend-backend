# BUG-169 — Taxonomies Configurations : requêtes non paginées (product/component types-categories)

- **Statut** : ⚪ Diagnostiqué
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/features/menu-items/menu-items.service.ts:1555-1565` (`getProductTypes`), `:1617-1628` (`getProductCategories`)
  - `src/features/menu-components/component-taxonomy.service.ts:17-27,71-82`
  - `src/features/market-prices/market-price-taxonomy.service.ts:17-27,71-82`
  - `src/features/industrials/industrials.service.ts:8-13`, `src/features/packing-types/packing-types.service.ts:8-13`
  - `src/features/brands/brands.service.ts:8-13`, `src/features/display-names/display-names.service.ts:8-13`

## Symptôme

Les 10 endpoints de liste de la section Configurations utilisent tous un `findMany` Prisma sans
`take`/`skip` — contrairement à `GET /menu-items` ou `GET /market-prices` (données volumineuses,
déjà corrigées pour la pagination réelle, voir BUG-54/37/40). Aucun N+1 constaté (chaque liste
reste une requête unique, avec `include` le cas échéant), donc pas un risque de performance actif
aujourd'hui.

## Cause racine

Absence de `take`/`skip` par choix implicite plutôt qu'un bug introduit — ces listes sont des
référentiels de configuration, à cardinalité naturellement faible (quelques dizaines de lignes par
tenant dans le pire cas observé lors de l'audit du domaine, cf.
[`backend/docs/bugs/62_spacemenu_availability_referentiel_tenant_non_scope.md`](62_spacemenu_availability_referentiel_tenant_non_scope.md)
pour un ordre de grandeur comparable sur un référentiel voisin).

## Correction

Statut **diagnostiqué, non corrigé par choix** : pas de pagination ajoutée tant qu'aucun tenant
n'approche une cardinalité représentant un risque réel (même logique d'arbitrage que BUG-62 côté
SpaceMenus). À revisiter si un tenant crée plusieurs centaines de types/catégories/référentiels, ou
si la latence de ces routes devient mesurable.

## Risque de régression / à surveiller

Aucune action requise dans l'immédiat. Si un fix de pagination est fait plus tard, vérifier que les
`<select>`/dropdowns consommant ces listes (souvent besoin de la liste complète pour un picker) ne
cassent pas silencieusement en cas de troncature.

## Références

- [`62_spacemenu_availability_referentiel_tenant_non_scope.md`](62_spacemenu_availability_referentiel_tenant_non_scope.md) — arbitrage similaire déjà documenté pour un référentiel voisin.
