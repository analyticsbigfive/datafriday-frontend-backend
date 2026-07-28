# BUG-148 — `EventDrawerShell.vue` inutilisé dans le périmètre Événements, header/footer dupliqués 3×

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/drawers/EventDrawerShell.vue`, vs `EventFormDrawer.vue:1-27`,
  `CsvImportDrawer.vue:1-23`, `TaxonomyImportDrawer.vue:1-23`

## Symptôme

`EventDrawerShell.vue` vit dans `components/events/drawers/` (le même dossier que les 3 autres
drawers du domaine) mais ses seuls importeurs réels sont `EventPredictSourcesDrawer.vue` et
`EventDetailsEditor.vue` — tous deux hors périmètre (domaine Prévision). Les 3 drawers du domaine
Événements (`EventFormDrawer.vue`, `CsvImportDrawer.vue`, `TaxonomyImportDrawer.vue`) réimplémentent
chacun leur propre header/footer de drawer (markup + CSS quasi identiques : dégradé rouge, icône,
titre/sous-titre, bouton fermeture) au lieu de réutiliser ce shell pourtant rangé au même endroit —
duplication de ~3× la même CSS.

## Cause racine

Non tranché — le shell a peut-être été introduit après ces 3 drawers (donc jamais rétrofité), ou
volontairement laissé de côté pour une raison non documentée (ex. besoin de personnalisation que le
shell ne permet pas).

## Correction

**Décision (2026-07-18)** : migration des 3 drawers vers `EventDrawerShell.vue`. Le shell utilise
déjà un slot `#footer` générique (`<footer v-if="$slots.footer"><slot name="footer" /></footer>`) —
aucune adaptation nécessaire pour le footer à contenu variable de `CsvImportDrawer`/
`TaxonomyImportDrawer` (Retour/Suivant/Importer, puis Fermer selon l'étape) : le slot projette
n'importe quel contenu tel quel.

Deux régressions potentielles identifiées et corrigées **avant** la migration en étendant le
shell :
1. **`persistent`** : le shell ne forwardait pas cette prop au `v-navigation-drawer` sous-jacent —
   migrer tel quel aurait réintroduit BUG-134 (drawer fermable en cliquant en dehors pendant un
   import/une sauvegarde en cours) sur les 3 drawers. Prop `persistent` ajoutée à
   `EventDrawerShell.vue`, forwardée telle quelle.
2. **Dark mode** : le shell n'avait aucun support dark mode, alors que les 3 drawers en ont un
   (palette identique : `#111827`/`rgba(255,255,255,.08)`). Prop `isDark` + classe `.eds--dark`
   ajoutées au shell (header du shell reste rouge quel que soit le thème — cohérent avec le reste
   de l'app ; body/footer du shell adaptés).

Migration effectuée sur les 3 drawers : remplacement du `<v-navigation-drawer>` + bloc header
gradient dupliqué par `<EventDrawerShell :title=... :subtitle=... :persistent=... :is-dark=...>`
+ `<template #icon>`, remplacement du `<div class="*-footer">` par `<template #footer>`. Le CSS
dupliqué (`*-drawer`, `*-header*`, `*-footer` — le conteneur, pas les boutons) supprimé dans
chacun des 3 fichiers (~90 lignes au total). Où le CSS scoped de chaque drawer dépendait d'une
classe `--dark` posée sur sa propre racine (nécessaire pour que les sélecteurs scoped Vue
matchent — l'intérieur du shell est hors de portée du CSS scoped de chaque drawer), un wrapper
`<div :class="{'*--dark': isDark}">` est conservé autour du contenu propre à chaque drawer
(step-bar + body pour les 2 imports CSV, tout le formulaire pour `EventFormDrawer`).
`CsvImportDrawer`/`TaxonomyImportDrawer` utilisent en plus `flush` sur le shell (leur contenu gère
déjà son propre padding via des classes Vuetify `pa-6`/`px-6 py-3`, pour éviter un double padding).

## Risque de régression / à surveiller

- Vérifié : `tsc`/`node --check` propres sur les 4 fichiers touchés (shell + 3 drawers), balance
  des tags `<div>`/`<template>` vérifiée sur chacun.
- Vérifié : suite de tests unitaires complète (408 tests) — zéro nouvelle régression (les 3 échecs
  restants sont pré-existants, confirmés sans lien via `git stash`).
- À tester manuellement : ouvrir chacun des 3 drawers en thème clair ET sombre ; vérifier que
  cliquer en dehors du drawer pendant un chargement (soumission de formulaire, import CSV en
  cours) ne le ferme pas ; vérifier le multi-étapes de `CsvImportDrawer`/`TaxonomyImportDrawer`
  (Retour/Suivant/Importer/Fermer selon l'étape).
- `EventDrawerShell.vue` a 2 autres consommateurs hors périmètre de cet audit
  (`EventPredictSourcesDrawer.vue`, `EventDetailsEditor.vue`, domaine Prévision) — les 2 nouvelles
  props (`persistent`, `isDark`) ont un défaut `false` qui préserve leur comportement actuel
  inchangé (additif, non-breaking).

## Références

- Aucune.
