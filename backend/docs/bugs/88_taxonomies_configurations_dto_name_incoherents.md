# BUG-88 — DTOs de création incohérents entre Type et Category (`name` sans `@IsNotEmpty`/`@MaxLength`) sur plusieurs taxonomies de Configurations

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/features/menu-items/dto/create-product-type.dto.ts:4-8` (`name` : `@IsString()` seul) vs `create-product-category.dto.ts` (`@IsNotEmpty()`, `@MaxLength(100)`)
  - `src/features/market-prices/dto/create-market-price-type.dto.ts:4-8` vs `create-market-price-category.dto.ts:5-9`
  - `src/features/menu-components/dto/create-component-type.dto.ts:4-8` vs `create-component-category.dto.ts:5-9`
  - `src/features/industrials/` et `src/features/packing-types/` : DTOs `create-*.dto.ts` avec `name` en `@IsString()` seul (à vérifier également pour `Brand`/`DisplayName`, non confirmé explicitement lors de cet audit)

## Symptôme

Pour 3 des 4 paires Type/Category de Configurations (ProductType/Category, MarketPriceType/Category,
ComponentType/Category), le DTO de création du **Type** n'a que `@IsString()` sur `name` — pas de
`@IsNotEmpty()` ni de `@MaxLength()` — alors que le DTO de la **Category** correspondante a les
deux. Un nom vide ou de longueur illimitée passe donc la validation côté `POST /product-types`,
`/market-price-types`, `/component-types` (et potentiellement `/industrials`, `/packing-types`) via
un appel API direct, alors que le front bloque ce cas côté formulaire (`.trim()` + validation
client) sur les 2 points d'entrée connus.

## Cause racine

Incohérence de copie entre les DTOs Type et Category au moment de leur écriture — pas de
convention partagée/DTO de base pour ce couple.

## Correction

Reste à faire : aligner tous les DTOs `create-*-type.dto.ts` sur leurs équivalents `*-category.dto.ts`
(`@IsNotEmpty()`, `@MaxLength(100)` a minima). Les `Update*Dto` héritant via `PartialType` récupèrent
le correctif automatiquement.

## Risque de régression / à surveiller

Aucun — ajout de validation strictement plus stricte, aucun cas d'usage légitime ne dépend d'un nom
vide ou surdimensionné.

## Références

- Nouveau constat, audit Configurations du 2026-07-19.
