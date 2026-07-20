# BUG-87 — Pas de protection anti-doublon insensible à la casse sur les taxonomies/référentiels de Configurations

- **Statut** : 🟢 Corrigé
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

**Brand/DisplayName/Industrial (2026-07-19)** : les 3 services correspondants ont reçu une méthode
privée `assertNoCaseInsensitiveDuplicate(name, tenantId, excludeId?)`, copiant l'idiome
`findFirst`+`mode: 'insensitive'` de `menu-items.service.ts:273`/`events.service.ts:593`, appelée
avant l'insert/update dans `create`/`update` :
`src/features/brands/brands.service.ts:15-27` (méthode), `:29-42` (create), `:50-69` (update) ;
`src/features/display-names/display-names.service.ts:15-27,29-42,50-69` ; et
`src/features/industrials/industrials.service.ts:15-27,29-42,50-69`. Sur `update`, l'id du record
courant est exclu (`excludeId`) pour ne pas se bloquer soi-même.

**PackingType + taxonomies MarketPriceType/MarketPriceCategory (2026-07-19, cette session)** :
même idiome (`findFirst` + `mode: 'insensitive'` scopé `tenantId`, `BadRequestException` avant
l'insert/update Prisma) appliqué à :
- `src/features/packing-types/packing-types.service.ts:19-30` (méthode privée
  `assertNoDuplicateName`), appelée dans `create` (`:32-46`) et `update` (`:53-99`, id exclu via
  `excludeId`).
- `src/features/market-prices/market-price-taxonomy.service.ts:21-51` (méthodes privées
  `assertNoDuplicateType`/`assertNoDuplicateCategory`), appelées dans `createType`/`updateType`
  (`:67-112`) et `createCategory`/`updateCategory` (`:156-264`). Pour `MarketPriceCategory`, le
  scope de la vérification suit la contrainte `@@unique([tenantId, typeId, name])` du schéma
  (donc `typeId` inclus dans le `findFirst`, pas seulement `tenantId`).

Ceci répond à la question laissée ouverte dans la section Correction ci-dessus pour le couple
`MarketPriceType`/`MarketPriceCategory` : le même trou existait bien, et est désormais couvert.
`ProductType`/`ProductCategory` et `ComponentType`/`ComponentCategory` (les 2 autres paires
Type/Category citées comme "à confirmer") restent hors périmètre de cette session.

**ProductType/ProductCategory + ComponentType/ComponentCategory (2026-07-19, session suivante)** :
même trou confirmé et couvert sur les 2 dernières paires Type/Category, avec le même idiome
(`findFirst` + `mode: 'insensitive'`, `BadRequestException` avant l'insert/update Prisma) :
- `src/features/menu-items/menu-items.service.ts:1567-1602` (méthodes privées
  `assertProductTypeNameAvailable`/`assertProductCategoryNameAvailable`), appelées dans
  `createProductType` (`:1604-1614`), `updateProductType` (`:1650-1674`, id exclu via `excludeId`),
  `createProductCategory` et `updateProductCategory`. Pour `ProductCategory`, le scope suit la
  contrainte réelle `@@unique([tenantId, typeId, name])` du schéma (donc `typeId` inclus dans le
  `findFirst`, pas seulement `tenantId`), même logique que pour `MarketPriceCategory`.
- `src/features/menu-components/component-taxonomy.service.ts:15-49` (méthodes privées
  `assertTypeNameAvailable`/`assertCategoryNameAvailable`), appelées dans `createType`/`updateType`
  et `createCategory`/`updateCategory`. Même scope `typeId` inclus pour `ComponentCategory`
  (`@@unique([tenantId, typeId, name])`).

Toutes les paires Type/Category de Configurations listées comme "à confirmer" dans ce bug sont
désormais couvertes.

## Risque de régression / à surveiller

Un tenant ayant déjà des doublons différant uniquement par la casse (état actuel possible) devra
être traité séparément — la nouvelle vérification empêchera la création de *futurs* doublons mais
ne fusionnera pas les existants automatiquement.

Pour la partie Brand/DisplayName/Industrial : revue de code uniquement dans cette session (pas de
`pnpm dev` lancé), à valider manuellement — créer "Coca" puis "coca" (ou variante de casse) pour le
même tenant doit désormais échouer en 400 sur `create` et sur `update` (en excluant bien le record
lui-même, donc renommer une entrée avec la même casse ou une casse différente d'elle-même doit
continuer à fonctionner).

Pour la partie PackingType/MarketPriceType/MarketPriceCategory : revue de code uniquement (pas de
`pnpm dev` lancé dans cette session) — même validation manuelle à faire (create/update avec variante
de casse doit échouer en 400, sauf renommage d'un record sur lui-même) ; pour `MarketPriceCategory`
spécifiquement, vérifier aussi qu'un même nom de catégorie reste autorisé sous deux `typeId`
différents (le scope du check inclut `typeId`, conformément à la contrainte unique du schéma).

## Références

- Aucun bug existant sur ce point précis dans l'index — nouveau constat, audit Configurations du 2026-07-19.
