# BUG-076 — Impossible d'ajouter ou de modifier un groupe de prix en mode édition

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:399,451-454,607-615`

## Symptôme

En édition d'un article existant, on ne peut plus ajouter de nouveau groupe de prix (le bloc
d'ajout est masqué par `v-if="!isEditMode"`), et le prix affiché dans une carte de groupe est un
simple `<span>` en lecture seule dans les deux modes. Le `SpaceGroupDrawer` ouvert au clic sur la
carte n'a pas de handler `@confirm` (commenté "view mode"), contrairement à l'instance de
sélection des spaces qui, elle, en a un. Seule la suppression du groupe est possible en édition.

## Cause racine

Logique d'ajout/édition des prix par groupe volontairement (ou par oubli) limitée au mode création
uniquement — aucun chemin pour rouvrir un groupe existant en édition dans le formulaire.

## Correction

**Non corrigé** : réactiver l'édition d'un groupe de prix existant (ou l'ajout d'un nouveau groupe)
en mode édition est une décision de comportement métier (faut-il permettre de changer le prix
d'un espace déjà en vente sans repasser par l'historique `MenuItemPriceHistory` ?) qui dépasse un
simple fix mécanique — nécessite validation produit avant implémentation, pour éviter d'introduire
un chemin d'édition de prix qui contournerait l'historisation attendue ailleurs dans le domaine
(voir `MenuItemPriceHistory` dans `docs/modules/04_MENU_CATALOGUE.md`).

## Risque de régression / à surveiller

Si corrigé plus tard : vérifier la cohérence avec `docs/modules/04_MENU_CATALOGUE.md` sur
l'historisation des prix (`MenuItemPriceHistory`) et sur la source de vérité `SpaceMenuItem`.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (SpaceMenuItem, MenuItemPriceHistory).
