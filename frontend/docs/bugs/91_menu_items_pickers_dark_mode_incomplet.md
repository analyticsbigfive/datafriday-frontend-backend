# BUG-091 — Mode sombre non supporté par 2 des 3 pickers de recette

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:571,574,577,653`, `src/components/menu-fb/views/menu-items/drawers/ComponentPickerDrawer.vue`, `src/components/menu-fb/views/menu-items/drawers/IngredientPickerDrawer.vue`

## Symptôme

Quand l'app est en thème sombre, ouvrir `IngredientPickerDrawer` ou `ComponentPickerDrawer` affiche
un panneau blanc en dur (`.cpd-panel { background: #ffffff; }`, `.ipd-panel { background: #fff; }`)
flottant sur une page sombre, alors que `PackagingPickerDrawer` s'adapte correctement.

## Cause racine

`MenuItemCreateView.vue` n'envoie `:is-dark="isDark"` qu'à `PackagingPickerDrawer` (ligne 577), pas
aux deux autres drawers (lignes 571, 574) — et ceux-ci ne déclarent même pas la prop `isDark` ni les
styles `--dark` correspondants, contrairement à `PackagingPickerDrawer.vue` et son bloc
`.ppd-panel--dark`.

## Correction

Prop `isDark` et styles `--dark` ajoutés à `ComponentPickerDrawer.vue` et
`IngredientPickerDrawer.vue` (mêmes classes/variables que `PackagingPickerDrawer.vue`) ; `:is-dark=
"isDark"` désormais passé aux deux instances dans `MenuItemCreateView.vue`.

## Risque de régression / à surveiller

Vérifier visuellement les deux drawers en light ET dark après le fix — en particulier les zones de
survol/sélection qui utilisent souvent des couleurs codées en dur peu visibles sur fond sombre.

## Références

- Aucune.
