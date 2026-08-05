# BUG-258-02 — `v-select` "Icon" invisible (menu piégé sous le drawer) dans DepartmentFormDrawer, 3e occurrence du même bug jamais protégé par le fix z-index déjà établi

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Espaces & builder (CFG-2, taxonomie unifiée Département/Sous-type)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31, signalé par l'utilisateur (screenshot : le select "Icon" du tiroir
  de création/édition de département bascule bien son chevron au clic mais n'affiche aucune
  option), avec le commentaire "je pense qu'on a rencontré ce problème à plusieurs reprises à
  cause du z-index" — exact.
- **Fichiers** : `src/components/departments/drawers/DepartmentFormDrawer.vue:52-62`

## Symptôme

Le `<v-select>` de sélection d'icône (liste curatée de ~18 icônes MDI) dans le tiroir
create/edit de `DepartmentListView.vue` s'ouvre visuellement (bordure rouge active, chevron
inversé) mais n'affiche aucune option cliquable — le menu déroulant est rendu mais invisible.

## Cause racine

Identique à **BUG-241-02** et **BUG-249-02**, déjà diagnostiquée et documentée deux fois dans ce
même changelog : `DepartmentFormDrawer.vue` est un tiroir `<Teleport to="body">` avec
`.dfd-overlay { z-index: 9999 }` (motif copié de `ComponentTypeFormDrawer.vue`/
`ProductCategoryFormDrawer.vue`). Le menu d'un `v-select` ouvert depuis l'intérieur de ce tiroir
est un **nouvel** overlay Vuetify dont le z-index réel est calculé par `useStack` (pile globale
interne à Vuetify), **indépendamment** du `z-index: 9999` du tiroir — le menu se retrouve donc
visuellement sous le tiroir.

Ce composant a été écrit dans cette session en copiant la structure de
`ComponentTypeFormDrawer.vue`, qui n'a lui-même aucun `v-select` (juste un champ texte) — le motif
copié ne portait donc pas le correctif, et rien n'a alerté à la création puisque
`ProductCategoryFormDrawer.vue` (le jumeau structurel exact, même overlay `z-index: 9999`) AVAIT
déjà le correctif sur son propre `v-select` (`:menu-props="{ zIndex: 10001 }"`,
`ProductCategoryFormDrawer.vue:38`) sans que ça ait été identifié comme le motif à répliquer avant
que le bug ne soit signalé une 3e fois.

## Correction

Ajout de `:menu-props="{ zIndex: 10001 }"` sur le `v-select` "Icon" — valeur reprise du motif déjà
établi et fonctionnel sur les tiroirs de la même famille (`ProductCategoryFormDrawer.vue:38`,
`MarketPriceCategoryFormDrawer.vue:38`, `ComponentCategoryFormDrawer.vue:38`, tous avec un overlay
`z-index: 9999` identique).

## Risque de régression / à surveiller

- Non exécuté en navigateur (pas de `pnpm dev` dans cette session) — à confirmer par un
  rechargement complet puis ouverture du select "Icon" (clair et sombre) dans
  `/configurations/departments` (create ET edit).
- `@vue/compiler-sfc` + `@babel/parser` propres sur le fichier modifié.
- Aucun autre `v-select`/`v-menu`/`v-autocomplete` dans `DepartmentFormDrawer.vue` ni
  `DepartmentSubtypesDrawer.vue` (vérifié par grep) — pas d'autre instance à corriger dans ces
  deux nouveaux fichiers.
- **À généraliser** : ce motif (copier un tiroir sans `v-select` comme référence structurelle, puis
  ajouter un `v-select` sans le correctif z-index) peut se reproduire pour tout futur tiroir créé
  par copie de `ComponentTypeFormDrawer.vue`/`PackingTypeFormDrawer.vue` (aucun des deux n'a de
  `v-select`, contrairement à leurs cousins `ProductCategoryFormDrawer.vue`/
  `MarketPriceCategoryFormDrawer.vue`) — vérifier explicitement ce point à chaque nouveau tiroir
  contenant un `v-select`, plutôt que de supposer que copier un tiroir existant suffit.

## Références

- [BUG-241-02](241_02_csvimportdrawer_menu_select_derriere_scrim_drawer.md) — 1re occurrence,
  diagnostic complet de la cause racine (z-index posé sur `.v-overlay`, pas `.v-overlay__content`).
- [BUG-249-02](249_02_taxonomie_v_select_menu_invisible_zindex_drawer.md) — 2e occurrence (4
  selects taxonomie Événements jamais protégés).
