# BUG-251-02 — `EventFormDrawer.vue` : sélection Home/Visiting Team possiblement réinitialisée par `auto-select-first` pendant le chargement asynchrone des équipes

- **Statut** : ⚪ Diagnostiqué (correctif défensif appliqué, mécanisme exact non confirmé en navigateur)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, signalé par l'utilisateur ("Home Team et Visiting Team ne sont pas
  importées" — capture d'écran du formulaire d'édition, les deux `v-autocomplete` vides).
- **Fichiers** : `src/components/events/drawers/EventFormDrawer.vue` (`handleTeamSelectChange`,
  `handleHomeTeamSelectChange`, watcher `modelValue`)

## Symptôme

Après import CSV d'un event avec équipes (`AJA-Nice` : Home = "AJ Auxerre", Visiting = "OGC Nice"),
les deux champs "Home Team"/"Visiting Team" apparaissent vides à l'ouverture du formulaire
d'édition.

**Vérifié en base (lecture directe, Prisma)** : la donnée est présente et correcte —
`homeTeamName: "AJ Auxerre"`, `visitingTeamId: "<uuid réel>"`, `visitingTeamName: "OGC Nice"`. Ce
n'est donc **pas** un problème de données perdues à l'import, mais un problème d'affichage/
d'initialisation du formulaire.

## Cause racine (hypothèse la plus probable, non confirmée en navigateur)

Les deux `<v-autocomplete>` (Home/Visiting Team) chargent leurs options (`teamsWithCreate`) depuis
`this.teams`, rempli de façon **asynchrone** par `loadTeams()` — appelé sans `await` en tout début
du watcher `modelValue`, en parallèle du reste de l'initialisation. Tant que `teams` n'a pas fini de
charger, `teamsWithCreate` ne contient que l'option `{id:'__create__', ...}`. Les deux
`v-autocomplete` ont `auto-select-first` actif ; si ce comportement Vuetify émet
`update:modelValue('__create__')` avant que `teams` soit chargé, les handlers
`handleTeamSelectChange`/`handleHomeTeamSelectChange` **remettaient `visitingTeamId`/`homeTeamId`
à `''`** (branche `value === '__create__'`) — écrasant la valeur pourtant déjà correctement
initialisée par `initFormFromEvent()` juste avant.

Le flag `this._initializingEdit` existe déjà dans ce fichier précisément pour bloquer ce genre
d'effet de bord pendant l'initialisation programmatique (utilisé par le watcher
`newEvent.spaceId`), mais n'était pas vérifié dans ces deux handlers.

## Correction (défensive)

Ajout de `if (this._initializingEdit) return;` en tête de `handleTeamSelectChange` et
`handleHomeTeamSelectChange`, sur le modèle du garde déjà utilisé pour `newEvent.spaceId`.

**Limite connue de ce correctif** : `_initializingEdit` repasse à `false` dès le `$nextTick` suivant
`initFormFromEvent()` (quelques ms), alors que `loadTeams()` (requête réseau) peut mettre plus
longtemps à résoudre — si le déclenchement `auto-select-first` a lieu APRÈS ce
`$nextTick` (ex. réseau lent), ce garde ne protège plus. Si le symptôme persiste après ce fix,
la cause réelle est probablement ailleurs (à instrumenter à nouveau, cf. méthode utilisée pour
BUG-249-02) — candidats à vérifier : `auto-select-first` lui-même (comportement exact selon la
version Vuetify installée), ou un `watch` implicite sur `teamsWithCreate` non identifié.

## Risque de régression / à surveiller

- Correctif additif, ne change aucun comportement pour une interaction utilisateur réelle (le
  garde ne bloque que la fenêtre d'initialisation programmatique).
- `@vue/compiler-sfc` + `@babel/core` propres, suite `pnpm test:unit` ciblée (94 tests) verte.
- **Non confirmé en navigateur** — statut ⚪ Diagnostiqué plutôt que 🟢/🟡 tant que l'utilisateur n'a
  pas revérifié sur un event importé avec équipes. Si le champ reste vide malgré ce fix, revenir
  ici avant de chercher ailleurs : la donnée elle-même est confirmée correcte en base.

## Références

- [BUG-249-02](249_02_taxonomie_v_select_menu_invisible_zindex_drawer.md) — méthode de diagnostic
  similaire (instrumentation temporaire pour distinguer bug de données vs bug d'affichage).
