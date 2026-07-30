# BUG-249-02 — `v-select` invisible (menu piégé sous le drawer) sur 4 selects taxonomie, jamais protégés par le fix z-index déjà établi

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, signalé par l'utilisateur (screenshot : le select "Event Type" du
  dialog "Create Event Category" bascule bien son chevron au clic mais n'affiche aucune option).
  Confirmé par instrumentation temporaire (`console.log`) que les données atteignaient bien le
  composant (`eventTypesWithCreate` avait 2 éléments, dont le vrai type "sport") — la liste n'était
  donc PAS vide côté données, seulement invisible à l'écran.
- **Fichiers** : `src/components/events/dialogs/EventCategoryDialog.vue`,
  `src/components/events/dialogs/EventSubcategoryDialog.vue`,
  `src/components/events/views/EventsSubcategorieListView.vue` (select inline "Category"),
  `src/components/events/drawers/TaxonomyImportDrawer.vue` (3 selects de mapping)

## Symptôme

Sur les `<v-select>` listés ci-dessus, cliquer ouvre bien le champ (chevron qui bascule, state
Vuetify interne à `true`) mais **aucune option n'apparaît** — exactement le symptôme déjà
diagnostiqué et corrigé pour `CsvImportDrawer.vue` dans **BUG-241-02**, jamais reporté sur ces 4
autres selects du même domaine.

## Cause racine

Identique à BUG-241-02 : `EventDrawerShell.vue` force `.eds-drawer { z-index: 2200 !important }`
et `.v-navigation-drawer__scrim { z-index: 2199 !important }` (BUG-148, volontaire). Le menu d'un
`v-select` ouvert depuis l'intérieur d'un composant enveloppé par `EventDrawerShell` est un nouvel
overlay Vuetify dont le z-index réel est calculé par `useStack` (pile globale interne, ~2000-2011),
**indépendamment** de ces valeurs forcées — donc systématiquement inférieur, le menu se retrouve
visuellement sous le drawer.

Cette classe de bug avait déjà été corrigée sur `CsvImportDrawer.vue` (BUG-241-02, via
`menu-props="{ class: 'elv-select-overlay' }"`) et — découvert en auditant les fichiers voisins —
`EventFormDrawer.vue` avait **déjà** le correctif équivalent sur ses 5 selects
(`:menu-props="{ zIndex: 2500 }"`, pattern différent mais même principe : forcer le zIndex au-delà
de 2200/2199). Les 4 selects listés ici n'avaient jamais reçu ni l'un ni l'autre correctif —
personne n'avait fait le lien avec BUG-241-02/148 en les ajoutant après coup.

## Correction

Ajout de `:menu-props="{ zIndex: 2500 }"` sur les 4 `<v-select>` concernés — repris du pattern déjà
établi et fonctionnel dans `EventFormDrawer.vue` (plus simple qu'une classe CSS non-scopée
dédiée : `zIndex` est directement lu par `useStack` dans le composable interne de Vuetify, cf.
`node_modules/vuetify/lib/components/VOverlay/VOverlay.js:128`).

## Risque de régression / à surveiller

- Non exécuté en navigateur — à confirmer par un rechargement complet puis ouverture de chacun des
  4 selects (clair et sombre) : `/events/event-categories` (dialog "Create Event Category"),
  `/events/event-subcategories` (dialog "Create Event Subcategory" ET le select inline "Category"
  du tiroir de création), et l'import taxonomie CSV (les 3 étapes de mapping).
- `@vue/compiler-sfc` + `@babel/core` propres sur les 4 fichiers, suite `pnpm test:unit` ciblée
  (94 tests) verte.
- `EventTypeDialog.vue` n'a aucun `v-select` (création simple, pas de parent à choisir) — non
  concerné, vérifié par grep.
- Le log de diagnostic temporaire ajouté dans `EventCategoryDialog.vue` pendant l'investigation a
  été retiré avant ce commit.

## Références

- [BUG-241-02](241_02_csvimportdrawer_menu_select_derriere_scrim_drawer.md) — même cause racine,
  même famille de composants, corrigé sur `CsvImportDrawer.vue` uniquement.
- [BUG-148](00_INDEX.md) — origine du forçage z-index du drawer/scrim.
- [BUG-236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md) — bug voisin
  mais de cause différente (données jamais chargées, pas un problème de z-index) sur
  `CsvImportDrawer.vue`.
