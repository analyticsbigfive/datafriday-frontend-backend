# BUG-058 — Le fix BUG-051 (`deletedAt` sur `MenuAssignment.menuItem`) n'a pas été répliqué partout

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:1062-1069` (`getConfigShopMenuItemsLight`),
  `:1014-1017` (`getMenuConfiguration`), `:1122-1128` (`saveMenuConfiguration`, validation d'écriture)

## Symptôme

Un `MenuItem` soft-deleted (ex. doublon nettoyé lors d'un re-mapping Data Integration, exactement
le scénario documenté par BUG-051) qui a encore une ligne `MenuAssignment(enabled: true)` pour un
shop peut réapparaître :
- dans `GET /space-menu/:spaceId/:configId/shop-items` (sert la page Analyse, cf. son propre
  docstring) — id/nom/catégorie de l'article supprimé listés comme actif sur le shop ;
- dans la matrice `GET /space-menu/:spaceId/:configId` (`{elementId: {menuItemId: boolean}}`) —
  une clé « fantôme » pour l'item supprimé ;
- côté écriture, `saveMenuConfiguration` peut créer une nouvelle `MenuAssignment` (et, si
  `enabled: true`, une ligne `SpaceMenuItem`) pour un `menuItemId` déjà soft-deleted, si l'appelant
  envoie encore cet id (state front périmé, requête rejouée).

## Cause racine

BUG-051 a corrigé exactement cette fuite dans `getShopMenu` en ajoutant
`menuAssignments: { where: { menuItem: { deletedAt: null } }, ... }` (`space-menus.service.ts:106`).
Le même filtre n'a jamais été répliqué dans les 3 autres endroits du fichier qui lisent ou écrivent
des `MenuAssignment` :
- `getConfigShopMenuItemsLight` (`:1062-1069`) : `menuAssignments: { where: { configId, enabled: true }, select: { menuItem: {...} } }` — aucun `deletedAt: null`.
- `getMenuConfiguration` (`:1014-1017`) : `menuAssignments: { where: { configId }, select: { menuItemId: true, enabled: true } }` — aucun `deletedAt: null`.
- `saveMenuConfiguration` (`:1122-1128`) : la validation `menuItem.findMany({ where: { id: { in: [...] }, tenantId }, ... })` qui détermine les `menuItemId` acceptés dans le payload ne filtre pas non plus `deletedAt: null`.

## Correction

Filtre `deletedAt: null` ajouté sur les 3 emplacements, en miroir exact du pattern déjà utilisé
dans `getShopMenu` (`menuAssignments.where.menuItem.deletedAt: null` pour les deux lectures,
`deletedAt: null` ajouté au `where` de la requête `menuItem.findMany` de validation d'écriture).

## Risque de régression / à surveiller

- Vérifier après déploiement que la page Analyse (`/space-menus/:spaceId/:configId/shop-items`,
  consommée par `getConfigShopMenuItemsLight`) n'affiche plus d'article supprimé pour un espace où
  BUG-051 avait déjà été constaté (ex. Auxerre).
- La matrice `GET /space-menu/:spaceId/:configId` ne doit plus contenir de clé `menuItemId`
  correspondant à un item soft-deleted.
- Un payload de sauvegarde référençant un `menuItemId` soft-deleted doit désormais être
  silencieusement ignoré (comme les ids hors-tenant), pas créer de ligne orpheline.

## Références

- [BUG-051](51_spacemenuitem_orphelins_apres_soft_delete_menuitem.md) — le fix original, dont ce
  ticket est la réplication manquante.
