# BUG-063 — `SaveSpaceMenuConfigurationDto.menuItems` : aucune validation que les valeurs sont des booléens

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/dto/save-space-menu-configuration.dto.ts:25-26`,
  `src/features/space-menus/space-menus.service.ts:1146-1151`

## Symptôme

Un payload malformé comme `{"elementId": {"menuItemId": "yes"}}` (valeur `enabled` en string au
lieu de booléen) passe la validation DTO sans erreur et échoue plus loin, au niveau Prisma, avec un
message d'erreur opaque au lieu d'un 400 propre et explicite.

## Cause racine

`@IsObject()` (`dto/save-space-menu-configuration.dto.ts:25-26`) vérifie seulement
`typeof === 'object'` — `class-validator` ne valide pas la forme imbriquée
`Record<string, Record<string, boolean>>` sans un validateur dédié (les clés étant dynamiques,
les décorateurs déclaratifs standards ne s'appliquent pas). La valeur `enabled` passe donc
directement, non validée, dans `tx.menuAssignment.upsert({ create: {..., enabled}, update: {enabled} })`
(`space-menus.service.ts:1146-1151`).

## Correction

Validation défensive ajoutée dans `saveMenuConfiguration` : les entrées dont la valeur `enabled`
n'est pas strictement un booléen sont ignorées (comme les `elementId`/`menuItemId` hors périmètre
tenant/config), au lieu de remonter jusqu'à Prisma.

## Risque de régression / à surveiller

- Un payload avec des valeurs `enabled` non booléennes doit désormais être traité comme si ces
  entrées étaient absentes du payload (silencieusement ignorées), pas rejeté en 400 global — cohérent
  avec le traitement déjà appliqué aux `elementId`/`menuItemId` invalides dans la même fonction.

## Références

- Aucune fiche miroir : validation interne, sans impact direct visible côté front tant que les
  appelants (`assignMenuItemsToShop`, `useSpaceMenu.persist`) envoient toujours des booléens réels.
