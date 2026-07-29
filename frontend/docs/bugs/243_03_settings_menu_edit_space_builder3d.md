# BUG-243-03 — Settings : menu déroulant « Edit space » → builder 3D

> Note : pas un défaut mais une **amélioration** UI, tracée ici pour garder l'historique des
> changements de navigation au même endroit que les bugs.

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur (navigation, aucun impact données)
- **Domaine** : Espaces & builder / Navigation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-29 · **Traité le** : 2026-07-29 (emmanuel)
- **Fichiers** : `constants/navigation.js`, `views/DashboardView.vue`, `i18n/translations.js`

## Besoin

Pouvoir, depuis le menu Settings, choisir un espace et atterrir directement sur son **builder 3D**
(`/spaces/:id/builder2`), sans passer par la page `/spaces` complète (qui gère aussi création /
suppression / stats).

## Solution

Nouveau groupe déroulant **« Edit space »**, placé **en tête** de la section Settings
(`navConfiguration`), dont les items sont **la liste dynamique des espaces** :

- **`navigation.js`** — groupe `settings-edit-space` marqué `dynamic: 'spaces'`, `permission:
  'space.edit'`, icône `Building2`, sans items statiques (résolus au runtime).
- **`DashboardView.vue`** :
  - computed `editSpaceItems` : un item par espace du store (`spaces/spaces`) →
    `{ title: nom, route: '/spaces/:id/builder2' }` ; `t()` retombe sur le nom brut (pas une clé i18n).
  - `visibleSettingsNavigation` : injecte ces items pour le groupe dynamique, gated par la
    permission de groupe. Le groupe dynamique **reste visible dès que la permission est présente**
    (même sans espace) pour afficher un état vide — les groupes statiques restent masqués si aucun
    item autorisé.
  - Fetch `spaces/fetchSpaces` déclenché **à l'ouverture du drawer Settings** (cache TTL du store).
  - **Barre de recherche** en tête du déroulé (`editSpaceSearch` + `filteredGroupItems`), filtrant
    sur le nom ; `@click.stop`/`@keydown.stop` pour ne pas replier le groupe ni déclencher la
    navigation clavier ; réinitialisée après sélection.
  - **États vides** : « Aucune correspondance » si la recherche ne matche rien, « Aucun espace
    disponible » si la liste est vide.
- **i18n** : `navEditSpace`, `editSpaceSearchPlaceholder`, `editSpaceNoResult`, `editSpaceEmpty`
  (FR/EN).

Le clic sur un espace ferme le drawer et pousse vers son builder 3D (`goToFromSettings`).

## Risque de régression / à surveiller

- Aucun impact données. À revérifier après rebuild : ordre des groupes (Edit space en 1er), la
  recherche filtre bien, les deux états vides s'affichent, et le groupe est **absent** pour un rôle
  sans `space.edit`.
- Une 1ʳᵉ ouverture du drawer sur un store non peuplé peut afficher brièvement « Aucun espace » le
  temps que `fetchSpaces` résolve (puis la liste se remplit, réactivement).

## Références

- Route cible : `SpaceBuilder2` (`/spaces/:spaceId/builder2`, permission `space.edit`).
- [`modules/00_INDEX.md`](../modules/00_INDEX.md) — domaine Espaces & builder.
