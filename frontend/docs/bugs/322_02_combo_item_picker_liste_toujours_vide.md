# BUG-322-02 — Combo Item Picker toujours vide + aucun filtrage par espace

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/ComboItemPickerDrawer.vue:139-204`,
  `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:594`, `src/i18n/translations.js`

## Symptôme

Le bouton "+ Add Combo Item" (ou "Add Combo" côté menu-fb/menu-items/create) ouvre bien le drawer
"Select Combo Items" (contrairement à BUG-074, où le bouton était un no-op) mais celui-ci affiche
systématiquement "No menu items found", quel que soit le nombre de menu items existant côté tenant.
Signalé par l'utilisateur le 2026-08-14. Par ailleurs, aucun filtrage par espace n'était appliqué :
la demande produit est que, si un espace est déjà sélectionné pour le menu item en cours de
création/édition, seuls les menu items fournis dans cet espace apparaissent dans le picker.

## Cause racine

`ComboItemPickerDrawer.vue:166` (avant fix) filtre la liste sur `comboItem === 'Yes'`, un flag
scalaire distinct de la relation `MenuItemCombo` (voir `docs/modules/04_MENU_CATALOGUE.md`), que
personne n'avait jamais positionné sur aucun menu item existant (fonctionnalité picker ajoutée le
2026-08-03) → liste vide pour tout le monde, sans que l'UI n'explique cette précondition invisible.

Par ailleurs, aucune prop `spaceId`/`spaceIds` n'était câblée entre `MenuItemCreateView.vue` (qui
connaît `form.spaces`) et le drawer, alors que l'API backend (`getAllMenuItems(spaceId)`) supporte
déjà ce filtre côté serveur.

## Correction

- Filtre `comboItem = Yes` **conservé** (règle métier volontaire — décision utilisateur du
  2026-08-14 de garder la précondition plutôt que de l'assouplir), mais le message d'état vide est
  désormais contextuel : distingue "aucun résultat pour votre recherche", "aucun menu item n'est
  encore marqué éligible combo" et "aucun menu item éligible combo dans l'espace sélectionné" — au
  lieu du message générique trompeur "No menu items found".
- Ajout d'un filtrage côté client par espace : nouvelle prop `spaceIds` sur `ComboItemPickerDrawer`,
  alimentée par `form.spaces` du parent (`MenuItemCreateView.vue:594`). Un menu item n'apparaît que
  s'il est éligible combo **et** fourni dans au moins un des espaces déjà sélectionnés pour l'item en
  cours (aucun filtre si `form.spaces` est vide). Fait entièrement côté client en réutilisant le
  cache tenant déjà chargé (`menuItems/rows`, qui inclut déjà `spaceIds` par item côté backend) —
  pas de changement à l'action Vuex `fetchMenuItems` ni à la couche API.
- 3 nouvelles clés i18n EN+FR (`menuItemCreateComboNoResults`, `menuItemCreateComboNoEligible`,
  `menuItemCreateComboNoneInSpace`).

## Risque de régression / à surveiller

Le picker reste vide tant qu'aucun menu item n'a explicitement `Combo = Oui` positionné (dans son
propre formulaire d'édition) — comportement voulu mais à vérifier avec un vrai jeu de données :
flaguer au moins un item en `Combo = Oui`, confirmer qu'il apparaît dans le picker, y compris avec
un espace sélectionné pour l'item en cours de création. Aucun test automatisé ajouté (aucun test
existant sur ce composant avant ce fix). Fix non buildé/testé par l'utilisateur au moment de la
rédaction de cette fiche.

## Références

- `docs/bugs/74_menu_items_bouton_combo_item_non_fonctionnel.md` — bug précédent (bouton no-op),
  superseded par l'implémentation du drawer ; statut mis à jour vers 🟢 avec renvoi vers cette fiche.
- `docs/modules/04_MENU_CATALOGUE.md` — champ `comboItem` vs relation `MenuItemCombo`.
- `docs/bugs/323_02_spacemenus_combo_item_no_recipe_indisponible.md` — bug distinct découvert dans
  la foulée : un menu item composé uniquement d'articles combo (relation `MenuItemCombo`) apparaît
  "No recipe"/indisponible dans Space Menus alors qu'il a bien une recette.
