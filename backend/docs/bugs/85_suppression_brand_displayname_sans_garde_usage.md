# BUG-85 — Suppression `Brand`/`DisplayName` sans garde ni avertissement d'usage

- **Statut** : 🔴 Ouvert
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

Reste à faire — arbitrage produit à faire (contrairement à BUG-79/81/82, ici la FK `SetNull` est
déjà un choix de design raisonnable, pas nécessairement à bloquer totalement) :
1. Option légère : `remove()` renvoie le nombre de `MenuItem` affectés, le front affiche un
   avertissement explicite ("N articles vont perdre ce nom de marque") avant confirmation finale.
2. Option stricte : bloquer la suppression tant que des `MenuItem` référencent encore l'entité
   (aligné avec le pattern BUG-75/79/81/82).

## Risque de régression / à surveiller

Si option 1 retenue, vérifier que le décompte reste correct sous charge concurrente (un autre
utilisateur pourrait rattacher un MenuItem entre le décompte affiché et la confirmation).

## Références

- [BUG-86](86_suppression_industrial_sans_garde_usage.md) — même famille sur `Industrial`.
- [BUG-75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) — pattern de blocage strict, si l'arbitrage produit va dans ce sens.
