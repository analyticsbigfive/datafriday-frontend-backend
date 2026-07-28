# BUG-061 — i18n contourné dans componentListView.vue/ComponentCreateView.vue (pattern maison au lieu de `useI18n()`)

- **Statut** : 🟡 Corrigé non testé (locale — migration composable faite ; textes en dur dans les tiroirs/dialogs voisins non traités, voir "Correction")
- **Sévérité** : 🟢 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/componentListView.vue`,
  `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`

## Symptôme

Les deux fichiers centraux de la page `/components` (liste + création/édition) géraient la locale à
la main : `locale: localStorage.getItem('appLocale') || 'en'` dans `data()`, une méthode `t(key) {
return translate(key, this.locale) }`, et un listener manuel `window.addEventListener('locale-changed',
...)` posé dans `mounted()`/retiré dans `beforeUnmount()`. CLAUDE.md prescrit le composable
`useI18n()` du dossier `src/i18n/`, déjà utilisé correctement par tous les tiroirs/dialogs voisins du
même dossier (`ComponentPickerDrawer.vue`, `IngredientPickerDrawer.vue`,
`ComponentCategoryFormDrawer.vue`, `ComponentTypeFormDrawer.vue`, `NewCategoryDialog.vue`,
`NewTypeDialog.vue`) — seuls ces deux fichiers dérogeaient au pattern.

Par ailleurs, de nombreux libellés (en-têtes de colonnes du tableau sub-items, "Sauvegarde…",
"Suppression…", messages d'erreur/chargement de `NewCategoryDialog`/`NewTypeDialog`, dialog de
création de packaging type) sont codés en dur en français ou en anglais, ignorant totalement `t()` —
un utilisateur dans l'autre langue verrait ces textes non traduits.

## Cause racine

Pattern maison introduit avant ou en parallèle du composable `useI18n()` recommandé, jamais aligné
sur les fichiers voisins créés plus tard dans le même dossier.

## Correction

- `componentListView.vue` et `ComponentCreateView.vue` : migration vers `setup() { const { t, locale
  } = useI18n(); return { t, locale }; }`, retrait de `locale` de `data()`, retrait des méthodes `t()`
  maison (dont une définition totalement morte dans `ComponentCreateView.vue`, voir
  [[67_component_methode_t_dupliquee_dead_code]]), retrait du listener manuel
  `window.addEventListener('locale-changed', ...)` dans `mounted()`/`beforeUnmount()` (le composable
  gère déjà ce cycle de vie en interne).
- Les textes codés en dur dans ces deux fichiers et dans les tiroirs/dialogs voisins (en-têtes de
  tableau, messages d'erreur/chargement transitoires) n'ont **pas** été convertis vers `t()` — cela
  nécessiterait d'ajouter de nouvelles clés dans le dictionnaire de traductions partagé
  (`src/i18n/translations.js`) pour chaque chaîne, une tâche plus large et plus subjective (choix des
  clés, traduction des deux langues) que le périmètre de ce lot de corrections. Décision : documenté
  ici, non corrigé, à traiter séparément si voulu.

## Risque de régression / à surveiller

Vérifier que le changement de langue (`useI18n().setLocale`) continue de mettre à jour l'affichage de
ces deux écrans en temps réel (le composable réagit au même événement `locale-changed` que
l'ancien pattern manuel, donc comportement identique attendu).

## Références

- `docs/modules/09_TECHNIQUE.md` / `CLAUDE.md` §Architecture — "in-house (`translations.js` +
  `useI18n()` composable)".
- [[67_component_methode_t_dupliquee_dead_code]]
