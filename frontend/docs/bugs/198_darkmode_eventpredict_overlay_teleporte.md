# BUG-198 — Dark mode absent sur l'overlay Event Predict (`?toolbox=event-predict`)

- **Statut** : 🟡 Corrigé non déployé (correctif écrit, **partiellement vérifié en navigateur** — cf. « Risque de régression »)
- **Sévérité** : 🟡 Mineur (lisibilité en thème sombre)
- **Domaine** : Analyse & agrégation (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-24 · **Corrigé le** : 2026-07-24 (emmanuel)
- **Fichiers** : voir la liste en fin de fiche

## Symptôme

Sur `/spaces/:id?toolbox=event-predict` (overlay Event Predict plein écran), en thème sombre :
le header et la colonne de gauche basculaient bien, mais **la grande zone centrale et la carte
d'état vide restaient blanches** (capture à l'appui). Une fois un évènement sélectionné, de
nombreux sous-blocs (sections menus/stock, éditeur d'évènement, drawer sources, terminal de
traçabilité, timeline) restaient également clairs.

## Cause racine

Trois mécanismes, tous vérifiés dans le code :

1. **Sélecteur de thème inopérant sur du contenu téléporté.** L'overlay est rendu via
   `<Teleport to="body">` (`EventPredictView.vue`) : il vit **hors** de `.v-application`. Or
   `.v-theme--dataFridayDark` est posée **sur** `.v-application` → elle n'est **pas un ancêtre** du
   contenu téléporté. Toutes les règles dark écrites `.v-theme--dataFridayDark .ep-*` (les miennes
   comme deux préexistantes) ne matchaient jamais. Ce qui basculait quand même le faisait via les
   tokens `--fb-*`, eux pilotés par `.dark .event-predict-overlay` dans
   [`src/style.css`](../../src/style.css) — `.dark` étant posée sur `<html>` (un ancêtre réel,
   `plugins/vuetify.js:89`).
2. **Cascade `background` : un dégradé clair en dernier gagnant.**
   `.event-predict-overlay` déclare **trois** fois `background` ; la dernière —
   `linear-gradient(135deg, #f6f7fb, #fafbfc)` — l'emportait sur `background: var(--ep-bg)` (qui,
   lui, bascule). D'où le fond de page blanc. Idem pour `.ep-empty-state`/`.ep-stockup-cta`
   (dégradés bleu pâle) et les skeletons. Les dégradés sont **volontairement ignorés** par la
   conversion automatique `#hex → var(--fb-*)` (trop ambigus), donc restés clairs.
3. **Composants téléportés à part.** Le drawer sources (`EventDrawerShell` →
   `Teleport to="body"`, hors `.v-application` **et** hors overlay) et le terminal (`v-dialog`)
   n'héritaient ni des `--fb-*` de l'overlay ni de `.v-theme` : rendus entièrement clairs.

## Correction

- **Sélecteur `.dark` au lieu de `.v-theme--dataFridayDark`** dans les 5 fichiers rendus dans
  l'overlay téléporté (`EventPredictView`, `EventPredictMenusSection`, `EventPredictStockUpSection`,
  `EventDetailsEditor`, `EventTimelineChart`). `.dark` est sur `<html>` → ancêtre dans **tous** les
  contextes (téléporté ou non). Corrige au passage 2 règles préexistantes latentes (fond du champ
  de recherche, override des tokens accent) et couvre `EventTimelineChart`, réutilisé dans
  `AnalyseView` (non téléporté).
- **Overrides dark des dégradés clairs** (ignorés par la conversion) : fond de l'overlay,
  `.ep-empty-state`, `.ep-stockup-cta`, skeletons (`.ep-skeleton-*`, `.ep-skel-value`).
  Spécificité `.dark <sel>` > sélecteur nu → gagne dans la cascade.
- **Conversion structurelle `#hex → var(--fb-*, #hex)`** (littéral en fallback, mode clair
  inchangé) sur les surfaces/bordures/textes en dur, via un script piloté par (propriété + valeur)
  n'opérant que sur les `#hex` **nus** (ceux déjà dans un `var(--ep-*, …)` basculent seuls).
  Garde-fous : `color:#fff` (texte sur accent), fonds volontairement sombres, dégradés, ombres et
  le rouge `#ff3131` intouchés. **Revert manuel** d'un faux positif : la pastille « dirty » et le
  bouton « éditer » d'`EventDetailsEditor`, blancs **sur le bandeau rouge**, que le script avait
  passés en `var(--fb-surface)` (→ sombres sur rouge).
- **Tokens accent définis sur l'overlay** (`--destructive`/`--success`/`--warning`) : indéfinis →
  repli sur littéral ; désormais valeurs claires en clair, éclaircies en sombre → tous les badges
  map/cost/remap/add du parent **et** des sections enfants (héritage) suivent.
- **Composants téléportés à classe propre** : drawer sources branché sur `:is-dark` +
  `.eds--dark` (pattern events, [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md)) ;
  terminal piloté par `.att--dark` (`useTheme`) redéfinissant les tokens shadcn sur la racine du
  modal.
- **Chart.js theme-aware** : le `<canvas>` étant hors CSS, `EventTimelineChart` dérive `gridColor`
  et `tickColor` de `isDark` (la palette des séries reste lisible sur les deux fonds).
- **Bandeau rouge `#ff3131`** et contrôles blancs conservés dans les deux thèmes (parité établie).

## Risque de régression / à surveiller

- **Vérifié uniquement sur l'état vide** (fond de page + carte) après le dernier correctif ; le
  reste (évènement sélectionné : timeline, sections menus/stock, drawers, terminal) **reste à
  valider à l'écran**, en clair **et** en sombre. Le mode clair est censé inchangé (fallbacks
  identiques) — point à contrôler en priorité.
- **`.dark` doit rester synchronisée** avec le thème Vuetify. C'est le cas (`plugins/vuetify.js`,
  `views/DashboardView.vue`) et `style.css` en dépend déjà pour l'overlay, mais tout nouveau point
  d'entrée de thème doit continuer à basculer `.dark` sur `<html>`, sinon l'overlay téléporté
  repartira en clair.
- **Piège à retenir** : pour tout contenu `Teleport to="body"`, cibler `.dark` (ancêtre `<html>`),
  **jamais** `.v-theme--dataFridayDark` (sur `.v-application`, non-ancêtre). Idem : une 2ᵉ/3ᵉ
  déclaration `background` (dégradé) peut écraser silencieusement un `var(--…-bg)` qui basculait.
- Les composants portés `ui/*` (dead zone shadcn) consommés par l'overlay n'ont pas été audités :
  d'éventuelles couleurs claires en dur y resteraient.

## Références

- [BUG-197](197_darkmode_workspaces_fb_inventory_logistic_restock.md) — vague précédente (workspaces
  Inventory/Logistic/Restock) ; même contrat `--fb-*`.
- [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) — pattern `.eds--dark`
  des drawers events téléportés, et cause `bg-color="grey-lighten-5"`.
- Contrat de variables + bascule `.dark`/`.v-theme` de l'overlay :
  [`src/style.css`](../../src/style.css).

## Fichiers touchés

| Fichier | Objet |
|---|---|
| `src/components/EventPredictView.vue` | `.dark` au lieu de `.v-theme` ; override dark du fond overlay + dégradés + skeletons ; tokens accent ; conversion structurelle |
| `src/components/EventPredictMenusSection.vue` | conversion + `.dark` ; bordure pilule de quantité |
| `src/components/EventPredictStockUpSection.vue` | conversion + `.dark` ; bordure costbar |
| `src/components/EventDetailsEditor.vue` | conversion + `.dark` ; revert pastille/bouton sur bandeau rouge ; bouton « ajouter session » |
| `src/components/EventPredictSourcesDrawer.vue` | téléporté : `:is-dark` + tokens sous `.eds--dark` |
| `src/components/AlgoTraceTerminal.vue` | v-dialog : thème local `.att--dark` (`useTheme`) |
| `src/components/analyse/charts/EventTimelineChart.vue` | `.dark` ; grille/ticks chart.js theme-aware |
