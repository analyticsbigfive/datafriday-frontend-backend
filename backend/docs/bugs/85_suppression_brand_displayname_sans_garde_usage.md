# BUG-85 — Suppression `Brand`/`DisplayName` sans garde ni avertissement d'usage

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes (Configurations — Brand Names/Display Names)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/brands/brands.service.ts:52-57` (`remove`), `src/features/display-names/display-names.service.ts:52-57` (`remove`), `prisma/schema.prisma:1879-1880` (`MenuItem.brand`/`displayName`, relation optionnelle sans `onDelete` explicite), `prisma/migrations/20260609000000_add_brand_displayname_to_menu_item/migration.sql:44,47` (confirme `ON DELETE SET NULL` généré)

## Symptôme

Supprimer un `Brand`/`DisplayName` encore utilisé par des `MenuItem` ne provoque ni erreur ni
avertissement : la FK étant `SET NULL`, `remove()` réussit silencieusement et **détache** le
brand/display name de tous les articles qui le référençaient. Le dialog de confirmation front
(`BrandNameDeleteDialog.vue`/`DisplayNameDeleteDialog.vue`) est un texte générique "action
irréversible" — aucun décompte d'usage, aucune mention que des Menu Items vont perdre leur
brand/display name.

## Cause racine

`remove()` ne fait aucun `count()` sur les `MenuItem` référençant l'entité avant suppression, et ne
retourne aucune information d'impact à afficher côté front.

## Correction

**Décision (2026-07-19)** : option stricte retenue, alignée avec le pattern BUG-75/79/81/82/86
("bloquer si quelque chose en dépend") pour rester cohérent avec la politique uniforme appliquée
en parallèle sur ces taxonomies. `BrandsService.remove()`
(`src/features/brands/brands.service.ts:71-84`) compte désormais les `MenuItem` dépendants
(`brandId: id`) et lève `ConflictException` (« Impossible de supprimer ce brand : N article(s) de
menu en dépendent encore... ») si le compte est > 0.
`DisplayNamesService.remove()` (`src/features/display-names/display-names.service.ts:74-88`) fait
de même avec `displayNameId`. Au passage, les deux `create`/`update` gagnent une garde
anti-doublon insensible à la casse (voir BUG-87/88 pour le détail).

## Risque de régression / à surveiller

Revue de code uniquement dans cette session (pas de `pnpm dev` lancé) — à valider manuellement :
supprimer un `Brand`/`DisplayName` encore référencé par un `MenuItem` doit désormais échouer avec
un message clair (409) au lieu de détacher silencieusement la FK ; supprimer une entité non
référencée doit continuer à fonctionner normalement. Vérifier aussi que le front
(`BrandNameDeleteDialog.vue`/`DisplayNameDeleteDialog.vue`) affiche bien `e.response.data.message`
sur l'échec (pattern déjà utilisé pour BUG-75, à confirmer côté frontend — non touché dans cette
session, hors périmètre backend).

## Références

- [BUG-86](86_suppression_industrial_sans_garde_usage.md) — même famille sur `Industrial`.
- [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) — pattern de blocage strict, si l'arbitrage produit va dans ce sens.
