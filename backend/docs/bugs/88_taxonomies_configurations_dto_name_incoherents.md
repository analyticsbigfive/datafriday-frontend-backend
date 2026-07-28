# BUG-88 — DTOs de création incohérents entre Type et Category (`name` sans `@IsNotEmpty`/`@MaxLength`) sur plusieurs taxonomies de Configurations

- **Statut** : 🟢 Corrigé
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

**Brand/DisplayName/Industrial (2026-07-19)** : vérifié — les 3 DTOs de création n'avaient
effectivement que `@IsString()` sur `name` (confirmant le doute non résolu de l'audit initial).
Contrairement à ce que le texte du bug supposait, ces DTOs ne vivent pas dans un dossier `dto/`
séparé : ce sont des classes `CreateBrandDto`/`CreateDisplayNameDto`/`CreateIndustrialDto`
définies inline en tête des fichiers contrôleur respectifs. `@IsNotEmpty()` et `@MaxLength(100)`
ajoutés à `name` dans `src/features/brands/brands.controller.ts:9-13`,
`src/features/display-names/display-names.controller.ts:9-13`, et
`src/features/industrials/industrials.controller.ts:9-13`. Les `UpdateXDto` héritent via
`PartialType(CreateXDto)` dans ces mêmes fichiers, donc récupèrent le correctif automatiquement
(comme prévu).

**MarketPriceType/PackingType (2026-07-19, cette session)** :
- `src/features/market-prices/dto/create-market-price-type.dto.ts:1-9` — ajout de `@IsNotEmpty()`
  et `@MaxLength(100)` sur `name`, alignée sur `create-market-price-category.dto.ts`.
- `src/features/packing-types/packing-types.controller.ts:9-14` — même constat que pour
  Brand/DisplayName/Industrial : pas de `dto/create-packing-type.dto.ts` séparé, le DTO
  `CreatePackingTypeDto` est une classe inline en tête du contrôleur. `@IsNotEmpty()`/
  `@MaxLength(100)` ajoutés à cet endroit ; `UpdatePackingTypeDto` (`PartialType(CreatePackingTypeDto)`,
  même fichier) récupère le correctif automatiquement.

**ProductType/ComponentType (2026-07-19, cette session)** : dernière paire manquante, désormais
traitée — ajout de `@IsNotEmpty()` et `@MaxLength(100)` sur `name` :
- `src/features/menu-items/dto/create-product-type.dto.ts:4-8`, aligné sur
  `create-product-category.dto.ts`.
- `src/features/menu-components/dto/create-component-type.dto.ts:4-8`, aligné sur
  `create-component-category.dto.ts`.

`UpdateProductTypeDto`/`UpdateComponentTypeDto` héritant via `PartialType`, ils récupèrent le
correctif automatiquement. Toutes les paires listées dans ce bug sont désormais alignées.

## Risque de régression / à surveiller

Aucun — ajout de validation strictement plus stricte, aucun cas d'usage légitime ne dépend d'un nom
vide ou surdimensionné.

Pour la partie ProductType/ComponentType : non testé en navigateur/via `pnpm dev` (indisponible
dans cette session) — revue de code uniquement, à valider manuellement que `POST /product-types` et
`/component-types` avec `name` vide ou > 100 caractères renvoie désormais 400 au lieu de passer.

Pour la partie Brand/DisplayName/Industrial : revue de code uniquement dans cette session (pas de
`pnpm dev` lancé) — à valider manuellement que `POST /brand-names`, `/display-names`, `/industrials`
avec `name` vide ou > 100 caractères renvoie désormais 400 au lieu de passer.

Pour la partie MarketPriceType/PackingType : revue de code uniquement (pas de `pnpm dev` lancé dans
cette session) — à valider manuellement que `POST /market-price-types` et `/packing-types` avec
`name` vide ou > 100 caractères renvoie désormais 400 au lieu de passer.

## Références

- Nouveau constat, audit Configurations du 2026-07-19.
