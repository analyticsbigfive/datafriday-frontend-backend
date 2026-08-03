# BUG-277-01 — Drawer « Event detail » (Event Predict) illisible en dark mode : texte blanc sur fond clair

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟠 Majeur (drawer d'édition inutilisable en thème sombre — valeurs des champs invisibles)
- **Domaine** : Analyse & agrégation (Event Predict) / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (capture utilisateur, page `?toolbox=event-predict`) — JLH
- **Fichiers** : `src/components/EventDetailsEditor.vue:46-53` (shell sans `is-dark`),
  `:1254-1258` (`var(--fb-surface, #FFFFFF)`), `:1497` (`var(--card, #fff)`),
  `src/components/events/drawers/EventDrawerShell.vue:69` (prop `isDark`), `:211-222`
  (styles `.eds--dark`, BUG-148)

## Symptôme

En thème sombre, ouvrir le drawer « Event detail » (crayon du bandeau rouge, page Event Predict) :
le corps du drawer reste clair (`#f9fafb`) mais les valeurs des champs (`v-text-field`,
`v-select`) sont quasi blanches — illisibles. Les labels de section (« General information »,
« Taxonomy », « Home team »…) restent lisibles, ce qui rend le bug partiel et trompeur : seuls
les textes hérités de Vuetify disparaissent.

## Cause racine

Triple défaut, tous liés à la téléportation du drawer dans `<body>` (via `EventDrawerShell`) :

1. **`is-dark` jamais passé au shell** — `EventDetailsEditor.vue` montait `<EventDrawerShell>`
   sans `:is-dark`, alors que le shell gate tout son dark mode derrière `.eds--dark`
   (`EventDrawerShell.vue:69` + styles BUG-148). Corps figé en `background:#f9fafb` même en sombre.
2. **Texte forcé blanc par Vuetify** — le `v-navigation-drawer` téléporté reçoit quand même les
   `themeClasses` du thème global → `color: rgba(var(--v-theme-on-surface))` = `#FAFAFA` en dark.
   Blanc sur fond clair.
3. **Tokens `--fb-*` non hérités** — la téléportation sort le contenu de
   `.event-predict-overlay`, seule racine où `style.css` (bloc dark, :96-123) redéfinit les
   `--fb-*` sombres. Tous les `var(--fb-…, littéral clair)` du composant retombaient sur leur
   fallback clair → champs blancs à texte blanc. Idem pour le dialog « créer une équipe »
   (`v-dialog` téléporté, `background: var(--card, #fff)`).

Le commentaire de fin de `<style>` (« drawer NON téléporté : surfaces/bordures/textes suivent
les `--fb-*` hérités ») était obsolète depuis la migration vers `EventDrawerShell`
(commit `b60e220`) — il documentait précisément l'inverse de la réalité.

## Généralisation : non (audit fait)

Les 9 autres consommateurs d'`EventDrawerShell` (`EventPredictSourcesDrawer`, `EventFormDrawer`,
`CsvImportDrawer`, `TaxonomyImportDrawer`, `TaxonomyDetailDrawer`, dialogs
Delete/Category/Type/Subcategory) passent tous `:is-dark` et portent leur propre bloc `--dark` —
`EventDetailsEditor.vue` était le seul à échouer sur les deux axes. Fragilité de classe
persistante : plusieurs consommateurs reçoivent `isDark` en **prop** (parent oublieux = même
bug), déjà matérialisée par BUG-247-02.

La copie `datafriday-web` (repo distinct) a le même défaut en pire (shell sans prop `isDark` du
tout) — hors périmètre, `datafriday-frontend-backend/frontend/` est la source de vérité (ADR-0001).

## Correction

Corrigé le 2026-08-02 dans `EventDetailsEditor.vue` (1 fichier), pattern identique à
`EventPredictSourcesDrawer.vue` (`.eds--dark .eps-drawer-scroll`) :

- `setup()` : ajout `useTheme()` + `isDark` computed, passé au shell via `:is-dark="isDark"` —
  le shell peint fond `#111827` et footer `#1f2937` (BUG-148).
- Bloc `.eds--dark .ede-drawer-body` en fin de `<style scoped>` : redéfinition des tokens
  (`--fb-surface:#1f2937`, `--fb-border:#374151`, `--fb-text:#f9fafb`, `--fb-muted:#94a3b8`,
  `--fb-faint:#6b7280`) + `color:#e5e7eb`. Palette identique au shell/BUG-148, rouge de marque
  `#ff3131` conservé.
- Bouton Annuler du slot `#footer` (couleurs en dur) : override `.eds--dark .ede-footer-btn--cancel`.
- Dialog équipe : règle `.dark .ede-team-dialog` (fond `#1f2937`) — accroché à `.dark` sur
  `<html>` car le `v-dialog` est téléporté hors du shell, donc hors `.eds--dark`.
- Commentaire obsolète remplacé par l'explication réelle (téléporté, tokens redéfinis).

## Risque de régression / à surveiller

- Thème clair : aucun changement attendu (toutes les règles ajoutées sont gatées `.eds--dark`
  ou `.dark`) — à revérifier visuellement.
- Menus `v-select`/`v-autocomplete` téléportés dans leur propre overlay : précédent connu
  (BUG-237-02, BUG-249-02 : menu hors de la classe `--dark` du drawer) — à contrôler à l'écran ;
  ici les menus suivent le thème Vuetify global, a priori corrects.
- `.ede-empty` (état vide, dans l'overlay non téléporté) volontairement non touché — suit le
  bloc dark de l'overlay (BUG-198).
- `pnpm test:unit` passé le 2026-08-02 : 647 tests OK ; 3 suites en échec **identiques avant et
  après le fix** (`eventDetailsEditor.spec.js`, `apiOrMock.spec.js`, `spaceMenusInventory.spec.js`
  — « SyntaxError: Cannot use import statement outside a module » sur `axios`/`vuetify`, dette
  Jest `transformIgnorePatterns` pré-existante, ces suites ne se lançaient déjà pas). Aucune
  régression introduite.
- Contrôle visuel restant (dark : fond `#111827`, champs `#1f2937`, texte lisible ; dialog
  équipe ; thème clair inchangé) avant passage 🟢.

## Références

- [BUG-148](148_eventdrawershell_inutilise_duplication_markup.md) — support dark du shell (`.eds--dark`).
- [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md) — dark de l'overlay Event Predict
  téléporté (même famille : téléportation hors des racines à tokens).
- [BUG-237-02](237_02_csvimportdrawer_darkmode_menu_select_teleporte_illisible.md) — menu
  `v-select` téléporté hors `.elv--dark`.
- [BUG-247-02](247_02_eventcategorydialog_prop_isdark_extraneous_ignoree.md) — prop `is-dark`
  passée mais ignorée : même classe de fragilité (contrat prop non vérifié).
