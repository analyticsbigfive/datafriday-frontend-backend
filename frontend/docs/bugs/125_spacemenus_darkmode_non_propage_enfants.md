# BUG-125 — Dark mode non propagé de SpaceMenuView.vue à SpaceMenuShopView/SpaceMenuItemView

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:125-151`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuShopView.vue`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuItemView.vue`

## Symptôme

En thème sombre, la page `/space-menus` a un fond navy correctement thémé (`SpaceMenuView.vue` gère
`isDark` et l'applique à lui-même et à ses 2 tiroirs), mais la grille de shops et la grille de menu
items au centre de la page restent des cartes blanches sur fond gris clair (`#fff`/`#f9fafb`/
`#f3f4f6` codés en dur) — rupture visuelle nette avec le reste de la page et de l'app.

## Cause racine

`SpaceMenuShopView.vue` et `SpaceMenuItemView.vue` n'ont aucune notion de thème (aucune référence à
`isDark`/`useTheme` dans les deux fichiers, confirmé par recherche), et ne reçoivent d'ailleurs pas
la prop : `SpaceMenuView.vue` passe `:is-dark="isDark"` à ses 2 tiroirs (`:160,167`) mais pas à ces
2 sous-vues (props passées `:125-133` et `:138-151`, sans `is-dark`). Contrairement à
`MenuItemView.vue` (domaine `menu-items`), qui supporte `isDark` de bout en bout — le pattern
existe déjà ailleurs dans l'app, simplement pas répliqué ici.

## Correction

Prop `is-dark` ajoutée sur `SpaceMenuShopView`/`SpaceMenuItemView` dans `SpaceMenuView.vue`, et les
deux composants enfants récupèrent la prop et appliquent des classes/styles dark, sur le modèle
CSS déjà utilisé par `SpaceMenuView.vue` (fonds `#111827`/`#0f172a`, textes clairs, bordures
`rgba(255,255,255,.08)`).

## Risque de régression / à surveiller

- Vérifier visuellement les deux vues (shops et menu items) en thème sombre : cartes, badges de
  statut, compteurs, pagination doivent tous être lisibles.

## Références

- Aucune.
