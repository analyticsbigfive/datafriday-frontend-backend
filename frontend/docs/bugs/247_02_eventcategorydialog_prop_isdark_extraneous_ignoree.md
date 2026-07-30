# BUG-247-02 — `EventCategoryDialog.vue` : prop `is-dark` passée par 2 vues mais ignorée (jamais déclarée)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, signalé par l'utilisateur (warning Vue en console : "Extraneous
  non-props attributes (is-dark) were passed to component but could not be automatically
  inherited...")
- **Fichiers** : `src/components/events/views/EventsCategorieListView.vue`,
  `src/components/events/views/EventsSubcategorieListView.vue`

## Symptôme

`EventsCategorieListView.vue` et `EventsSubcategorieListView.vue` montent
`<EventCategoryDialog :is-dark="isDark" ...>`. Or `EventCategoryDialog.vue` ne déclare **aucune**
prop `isDark` dans son `props: {...}` — il calcule son propre état sombre en interne
(`setup() { const isDark = computed(() => !!theme.global.current.value.dark); ... }`, identique au
pattern de `EventSubcategoryDialog.vue`/`EventTypeDialog.vue`). L'attribut `is-dark` passé par ces
2 vues est donc un "fallthrough attribute" que Vue ne peut pas rattacher automatiquement (le
composant rend via `EventDrawerShell`, qui téléporte son contenu — pas de nœud racine DOM unique à
qui transmettre l'attribut), d'où le warning en boucle à chaque ouverture/fermeture du dialog.

Purement cosmétique dans la console — sans impact fonctionnel, puisque le composant calcule de
toute façon la même valeur en interne via le même composable `useTheme()` que ses parents.

## Cause racine

Copié-collé du binding `:is-dark="isDark"` depuis d'autres composants du domaine qui, eux,
déclarent réellement `isDark` en prop (`TaxonomyDetailDrawer.vue`, `EventDrawerShell.vue`) —
`EventCategoryDialog.vue` (et ses cousins `EventSubcategoryDialog.vue`/`EventTypeDialog.vue`) ont
délibérément un pattern différent (calcul interne), jamais aligné dans les 2 vues appelantes.

## Correction

Retiré le binding `:is-dark="isDark"` des 2 seuls call-sites concernés
(`EventsCategorieListView.vue:97`, `EventsSubcategorieListView.vue:171`) — `EventFormDrawer.vue`
(3ᵉ appelant d'`EventCategoryDialog`) ne le passait déjà pas, confirmant que c'était bien une
divergence locale à ces 2 vues, pas un besoin réel du composant.

## Risque de régression / à surveiller

- Aucun changement de comportement visuel attendu : le composant calculait déjà indépendamment la
  même valeur via `useTheme()`. `isDark` reste utilisé par ailleurs dans les 2 vues (classe racine,
  `EventDrawerShell`/`TaxonomyDetailDrawer`, qui eux déclarent réellement la prop) — non retiré à
  tort.
- `@vue/compiler-sfc` + `@babel/core` propres sur les 2 fichiers, suite `pnpm test:unit` ciblée
  (94 tests) verte.
- Non exécuté en navigateur au-delà du retour utilisateur ayant signalé le warning — à confirmer
  que la console n'affiche plus ce warning à l'ouverture du dialog en dark mode notamment.

## Références

- [[145_eventcategorielist_duplication_creation_categorie]]
