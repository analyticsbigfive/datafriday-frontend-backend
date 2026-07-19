# BUG-87 — Pas de protection anti-doublon insensible à la casse sur les taxonomies/référentiels de Configurations

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/features/brands/brands.service.ts:15-26,34-50` (create/update)
  - `src/features/display-names/display-names.service.ts:15-26,34-50`
  - `src/features/industrials/industrials.service.ts:15-19`
  - `src/features/packing-types/packing-types.service.ts:15-19`
  - `prisma/schema.prisma:1796,1808,1820,1835` (`@@unique([tenantId, name])`, index Postgres standard, pas de `citext`/collation insensible à la casse)

## Symptôme

Les 4 référentiels plats (Brand, DisplayName, Industrial, PackingType) ne font que `.trim()` le nom
avant insertion et s'appuient uniquement sur la contrainte unique Postgres `@@unique([tenantId,
name])`, sensible à la casse. "Coca" et "coca" peuvent coexister comme deux lignes distinctes pour
le même tenant, apparaissant comme deux options différentes dans tous les `<select>` qui les
consomment.

## Cause racine

Aucune vérification pré-insertion insensible à la casse (`mode: 'insensitive'` côté Prisma/Postgres)
n'existe sur ces 4 services, contrairement à la convention déjà établie ailleurs dans ce backend
(`menu-items.service.ts:273`, `events.service.ts:593`, `logistics.service.ts`, `tenants.service.ts:98`,
`users.service.ts:199-201`).

## Correction

Reste à faire : appliquer le même pattern de vérification insensible à la casse que les fichiers
cités ci-dessus, sur les 4 services (`brands`, `display-names`, `industrials`, `packing-types`).
Vérifier si les taxonomies Type/Category (`ProductType`, `ComponentType`, `MarketPriceType`, et
leurs `Category` respectives) ont le même trou avant de considérer le fix complet — non vérifié
explicitement lors de cet audit pour ces 6 modèles-là, à confirmer.

## Risque de régression / à surveiller

Un tenant ayant déjà des doublons différant uniquement par la casse (état actuel possible) devra
être traité séparément — la nouvelle vérification empêchera la création de *futurs* doublons mais
ne fusionnera pas les existants automatiquement.

## Références

- Aucun bug existant sur ce point précis dans l'index — nouveau constat, audit Configurations du 2026-07-19.
