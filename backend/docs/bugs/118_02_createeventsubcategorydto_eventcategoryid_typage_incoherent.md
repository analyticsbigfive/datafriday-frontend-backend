# BUG-118-02 — `CreateEventSubcategoryDto.eventCategoryId` typé requis en TS mais optionnel en validation

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 (audit ciblé du module backend Events)
- **Fichiers** : `src/features/events/dto/create-event-subcategory.dto.ts:11-21`

## Symptôme

`eventCategoryId` était déclaré `eventCategoryId: string;` (type TS non-optionnel, et
`@ApiProperty` sans `required: false` — donc marqué requis dans le schéma Swagger) mais annoté
`@IsOptional()` côté `class-validator`. La vraie règle métier ("il faut fournir au moins
`eventCategoryId` OU son alias `categoryId`") est réimplémentée à la main dans
`EventsService.createEventSubcategory` — le typage TS/Swagger du DTO ne reflétait donc pas la
validation réelle, source de confusion pour quiconque lit le DTO sans lire aussi le service.

## Cause racine

Le champ a été rendu optionnel côté validation (pour permettre l'alias `categoryId` seul) sans
répercuter ce changement sur son typage TS ni sur son annotation Swagger.

## Correction

`eventCategoryId?: string` (type TS aligné sur `@IsOptional()`), `@ApiProperty` → `@ApiPropertyOptional`
(et retrait de `required: false` sur `categoryId`, redondant avec `ApiPropertyOptional`). Un
commentaire renvoie vers `EventsService.createEventSubcategory` pour la règle réelle ("au moins un
des deux"). **La question de fond (lequel des deux alias, `eventCategoryId` ou `categoryId`,
devrait être l'unique champ officiel) n'est pas tranchée ici** — elle est déjà loggée comme zone
grise produit non résolue côté frontend (`docs/modules/07_EVENEMENTS.md`) ; ce fix corrige
uniquement l'incohérence de typage, pas le choix de l'alias.

## Risque de régression / à surveiller

- Purement un changement de typage TS/Swagger, aucune logique de validation modifiée
  (`@IsOptional()`/`@IsString()`/`@IsNotEmpty()` inchangés sur les deux champs) — la validation
  runtime se comporte à l'identique.
- `npx tsc --noEmit` propre, suite `jest src/features/events` (67 tests, y compris
  `events.validation.spec.ts`) verte.

## Références

- `docs/modules/07_EVENEMENTS.md` côté `datafriday-web` ("Zones grises restantes — décisions
  produit non encore prises", alias `categoryId`/`eventCategoryId`).
