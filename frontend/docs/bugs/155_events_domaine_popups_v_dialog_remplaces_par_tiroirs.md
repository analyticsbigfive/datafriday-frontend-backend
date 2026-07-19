# BUG-155 — Domaine Événements : popups `v-dialog` remplacés par des tiroirs (cohérence charte graphique)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (UX/cohérence, aucune perte de données)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** :
  - `src/components/events/dialogs/EventTypeDialog.vue`
  - `src/components/events/dialogs/EventCategoryDialog.vue`
  - `src/components/events/dialogs/EventSubcategoryDialog.vue`
  - `src/components/events/dialogs/EventDeleteDialog.vue`
  - `src/components/events/drawers/EventFormDrawer.vue` (mini-dialog "Créer une équipe" inline)
  - `src/components/events/views/EventsTypeListView.vue` (dialog de suppression)
  - `src/components/events/views/EventsCategorieListView.vue` (dialog de suppression)
  - `src/components/events/views/EventsSubcategorieListView.vue` (dialog de suppression)

## Symptôme

Retour utilisateur explicite après BUG-153 : "on ne doit pas avoir des popups sur ces pages
d'events". Malgré l'usage de tiroirs (`v-navigation-drawer`) pour les formulaires principaux
(`EventFormDrawer.vue`, `TaxonomyImportDrawer.vue`, et le nouveau `TaxonomyDetailDrawer.vue`), 8
endroits du domaine Événements utilisaient encore un `v-dialog` centré : les 3 dialogs de
création/édition de taxonomie (Type/Catégorie/Sous-catégorie), le dialog de suppression partagé
`EventDeleteDialog.vue`, les 3 dialogs de suppression inline des écrans taxonomie (dupliqués plutôt
que de réutiliser `EventDeleteDialog.vue`), et un mini-dialog de création d'équipe inline dans
`EventFormDrawer.vue`.

## Cause racine

Aucune règle explicite n'imposait "tiroir uniquement" avant ce retour — `EventDrawerShell.vue`
(le shell de tiroir partagé du domaine) n'existait initialement que pour les formulaires jugés
"volumineux" (BUG-148 : migration d'`EventFormDrawer.vue`/`CsvImportDrawer.vue`/
`TaxonomyImportDrawer.vue`), laissant les dialogs de confirmation/quick-create plus courts sur
`v-dialog`.

## Correction

Les 8 fichiers migrés vers `EventDrawerShell.vue` (root `<v-dialog>` → tiroir latéral, header
gradient/dark mode/`persistent` déjà fournis par le shell — CSS bespoke dupliquée par fichier
supprimée en conséquence : `.etl-modal*`/`.ecl-modal*`/`.esl-modal*` sur les 3 écrans taxonomie).
Les 3 dialogs de taxonomie (`EventTypeDialog.vue`/`EventCategoryDialog.vue`/
`EventSubcategoryDialog.vue`) et `EventDeleteDialog.vue` n'avaient jusque-là aucun support dark mode
réel (fond blanc codé en dur, `isDark` absent) — ajouté au passage via `useTheme()` (même pattern
que les écrans hôtes), nécessaire pour rendre correctement à l'intérieur du shell.

Les 3 dialogs de suppression désormais dupliqués (Types/Categories/Subcategories, chacun son propre
tiroir plutôt que de réutiliser `EventDeleteDialog.vue`) : duplication déjà présente avant ce fix
(3 implémentations `v-dialog` quasi identiques), non consolidée en un composant partagé unique dans
ce passage pour limiter le risque (`EventDeleteDialog.vue` est spécifique aux events, ses clés i18n
`eventsList.delete*` ne correspondent pas au texte des 3 écrans taxonomie) — à revisiter si une
4ᵉ page de suppression apparaît dans ce domaine.

## Risque de régression / à surveiller

Tiroirs imbriqués (ex. `EventFormDrawer.vue` ouvert → `EventCategoryDialog.vue` ouvert par dessus →
`EventTypeDialog.vue` "créer un type" ouvert par dessus) : chaque `EventDrawerShell` est téléporté
sur `<body>` avec le même z-index fixe (2200/2199) — l'empilement correct dépend de l'ordre
d'insertion DOM (activation chronologique), pas d'un gestionnaire d'overlay dédié comme Vuetify en
a un pour `v-dialog`. Comportement correct dans le flux normal (ouverture séquentielle), non
re-testé en navigateur pour des cas de bascule rapide (pas de `pnpm dev` dans cette session).

## Références

- [BUG-148](148_eventdrawershell_inutilise_duplication_markup.md) — introduction d'`EventDrawerShell.vue`, jusque-là adopté seulement par les 3 gros formulaires.
- [BUG-153](153_taxonomie_view_popup_non_conforme_liste_evenements_absente.md) — retour utilisateur à l'origine de cette fiche.
- [BUG-156](156_taxonomydetaildrawer_i18n_texte_en_dur.md) — fix i18n connexe sur `TaxonomyDetailDrawer.vue`.
