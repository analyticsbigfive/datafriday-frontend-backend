# BUG-059 — `saveMenuConfiguration` : la création des `SpaceMenuItem` n'est pas dans la même transaction que les `MenuAssignment`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:1133-1175`

## Symptôme

Si l'appel réseau qui écrit les `SpaceMenuItem` échoue (erreur DB transitoire, redémarrage du pod,
timeout) juste après que la transaction précédente a committé les `MenuAssignment`, on obtient des
lignes `MenuAssignment.enabled = true` sans la ligne `SpaceMenuItem` correspondante. Comme
`spaceAssociationWhere` (condition 0) est appliquée sur **tous** les chemins de lecture
(`getItemsWithAvailabilityForSpace`, utilisée par `getShopAvailableMenuItems`/`getSpaceMenuItems`),
l'item devient invisible partout côté disponibilité/catalogue alors qu'il est « enabled » en base —
exactement le bug que ce bout de code affirme prévenir dans son propre commentaire.

## Cause racine

`space-menus.service.ts:1133-1154` : le `$transaction` ne wrappe que la boucle d'upsert
`menuAssignment`. Le `spaceMenuItem.createMany` (`:1171-1174`) qui établit l'association espace
(condition 0) tourne sur `this.prisma` (pas `tx`), **après** que la transaction a déjà committé —
les deux écritures ne sont plus atomiques.

## Correction

Le `spaceMenuItem.createMany` est déplacé à l'intérieur du même `$transaction` que les upserts
`menuAssignment`, en utilisant `tx` au lieu de `this.prisma`. Les deux écritures deviennent
atomiques : soit les deux réussissent, soit aucune n'est appliquée.

## Risque de régression / à surveiller

- Vérifier qu'une sauvegarde normale (cocher un item sur un shop) crée toujours la ligne
  `SpaceMenuItem` correspondante en une seule transaction.
- Simuler un échec de la seconde écriture (ex. contrainte violée) et vérifier que les
  `MenuAssignment` de cet appel sont bien rollback également (plus de MenuAssignment orphelin).

## Références

- [BUG-051](51_spacemenuitem_orphelins_apres_soft_delete_menuitem.md) — même famille de symptôme
  (item enabled mais invisible faute de `SpaceMenuItem`), cause racine différente (ici : intégrité
  d'écriture, pas soft-delete).
