# BUG-80 — `MenuComponent.create()`/`update()` : aucune vérification d'ownership sur `componentTypeId`/`componentCategoryId`

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes (Configurations)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/menu-components/menu-components.service.ts:288-289` (create), `:416-418` (update)

## Symptôme

`POST /menu-components` et `PATCH /menu-components/:id` assignent `componentTypeId`/
`componentCategoryId` directement depuis le payload client, sans vérifier que ces IDs pointent vers
un `ComponentType`/`ComponentCategory` accessible au tenant courant (privé au tenant ou global). La
contrainte FK Prisma ne garantit que l'existence de la ligne, pas son appartenance tenant. Un
tenant peut donc faire référencer par un de ses `MenuComponent` un `ComponentType`/`ComponentCategory`
**privé d'un autre tenant**, sans erreur.

## Cause racine

Même fichier, `assertIngredientsExist`/`assertChildrenExist` (`menu-components.service.ts:44-86`)
scopent bien leurs lookups par `tenantId` — mais aucun helper équivalent
(`assertComponentTypeAccessible`/`assertComponentCategoryAccessible`) n'existe pour ces deux FK de
taxonomie. C'est exactement le trou déjà documenté et corrigé pour `Event.create()`/`update()`
dans [`67_event_taxonomy_fk_sans_ownership.md`](67_event_taxonomy_fk_sans_ownership.md) — jamais porté
sur `MenuComponent`.

## Correction

Reste à faire : ajouter la vérification d'accessibilité (`OR: [{tenantId}, {tenantId: null}]`,
pattern `findAccessibleXOrThrow` déjà établi côté Events, voir aussi le correctif de
[BUG-77](77_createeventcategory_type_global_rejete_regression_bug66.md) qui précise bien utiliser la
variante "accessible" et non "owned" pour une simple référence FK) avant `create`/`update` de
`MenuComponent`.

## Risque de régression / à surveiller

Vérifier qu'un `componentTypeId`/`componentCategoryId` **global** (`tenantId=null`) reste accepté
après le fix (ne pas reproduire la régression de BUG-77 en utilisant le mauvais helper "owned" au
lieu de "accessible").

## Références

- [BUG-67](67_event_taxonomy_fk_sans_ownership.md) — même mécanisme, déjà corrigé côté Events.
- [BUG-77](77_createeventcategory_type_global_rejete_regression_bug66.md) — piège à éviter (mauvais helper = régression sur les types/catégories globaux).
