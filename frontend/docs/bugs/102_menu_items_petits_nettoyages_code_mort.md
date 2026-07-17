# BUG-102 — Petits nettoyages de code mort sur `/menu-items`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `MenuItemView.vue:480,483,396-397`, `SpaceGroupDrawer.vue:194`, `src/api/endpoints/menu-item.api.js:71-75,128-130,148-150`, `src/composables/useMenuItemAvailability.js`, `CreatePackingTypeDialog.vue` (CSS)

## Symptôme

Plusieurs petits éléments de dette technique sans impact runtime individuel, mais qui polluent la
lecture du code :
- `MenuItemView.vue` : clé dupliquée `Upload` dans `components: {}` (la seconde écrase
  silencieusement la première avec la même valeur) ; commentaires HTML trompeurs
  (`<!-- Delete Dialog -->` positionné juste avant un `<RecipeImportDrawer>`, pas un dialogue de
  suppression).
- `SpaceGroupDrawer.vue` : méthode `getSpace()` jamais appelée.
- `menu-item.api.js` : trois fonctions exportées (`getMenuItemsPaginated`,
  `replaceMenuItemComponents`, `replaceMenuItemPackagings`) sans aucun appelant dans le repo ; de
  plus `getMenuItemsPaginated({search})` serait de toute façon ignorée par le backend, qui n'accepte
  pas ce paramètre sur `GET /menu-items`.
- `src/composables/useMenuItemAvailability.js` : composable entier (38 lignes) jamais importé nulle
  part ; son fallback `store.state.analyse?.marketPrices` pointe en plus vers un champ qui n'existe
  pas dans le module `analyse.js` — mort dans du code mort.
- `CreatePackingTypeDialog.vue` : classe CSS `.ctd-*` recopiée telle quelle de `CreateTypeDialog.vue`
  sans renommage (inoffensif grâce au `scoped`, mais source de confusion en recherche globale).

## Cause racine

Accumulation normale de résidus de développement incrémental (copier-coller, fonctionnalités
retirées du template sans retirer leur code support).

## Correction

- `MenuItemView.vue` : doublon `Upload` retiré, commentaires HTML repositionnés pour décrire le
  bloc qui suit réellement.
- `SpaceGroupDrawer.vue` : `getSpace()` supprimée.
- `menu-item.api.js` : les 3 fonctions mortes supprimées.
- `useMenuItemAvailability.js` : supprimé (aucun consommateur, logique dupliquée avec
  `src/utils/menuItemAvailability.js` déjà utilisé ailleurs dans le domaine si un besoin de
  disponibilité doit être branché plus tard).
- `CreatePackingTypeDialog.vue` : préfixe CSS renommé en `cptd-*`.

## Risque de régression / à surveiller

Aucun — toutes les suppressions concernent du code sans appelant confirmé par grep.

## Références

- [[65_component_logs_debug_laisses_en_production]], [[67_component_methode_t_dupliquee_dead_code]]
  (même type de nettoyage sur `/components`).
