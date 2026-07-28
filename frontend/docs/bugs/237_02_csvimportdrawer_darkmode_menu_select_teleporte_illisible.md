# BUG-237-02 — `CsvImportDrawer.vue` : champ de mapping illisible en dark mode (overlay noir / texte non contrasté)

- **Statut** : 🟡 Corrigé non déployé (correctif écrit, **non vérifié en navigateur** — cf. « Risque de régression »)
- **Sévérité** : 🟠 Majeur (bloque la lisibilité de l'étape en thème sombre)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (styles `.elv--dark`),
  `src/components/events/drawers/EventDrawerShell.vue` (Teleport + scrim)

## Symptôme

En thème sombre, à l'étape 3 ("Espaces") et aux étapes suivantes (Configs, Types, Catégories,
Sous-catégories) de l'import CSV, le champ à mapper apparaît recouvert d'un overlay noir qui rend
son contenu illisible.

## Cause racine

Trois mécanismes cumulés, tous déjà identifiés une fois dans ce domaine (cf. BUG-198) :

1. **`EventDrawerShell.vue` téléporte tout le drawer hors de `.v-application`**
   (`<Teleport to="body">`). Le menu déroulant d'un `v-select` Vuetify est **lui-même** téléporté
   séparément par Vuetify dans `.v-overlay-container` (classe stable `.v-select__content`,
   vérifiée dans `node_modules/vuetify/lib/components/VSelect/VSelect.js:417`) — un sibling du
   drawer sous `<body>`, donc hors de portée de tout `:deep()` scoped écrit depuis
   `CsvImportDrawer.vue` (le wrapper `.elv--dark` n'est un ancêtre réel que du contenu resté dans
   l'arbre DOM du drawer, pas de ce menu).
2. **`.elv--dark` ne fixait explicitement qu'un `background`**, jamais de `color` de base — tout
   texte non explicitement recouvert par une règle dédiée hérite donc d'une couleur non garantie
   une fois sorti de `.v-application` (dont dépendent normalement les tokens de texte Vuetify).
3. Plusieurs propriétés `background`/`border` du composant utilisaient `rgb(var(--v-theme-xxx))`
   **sans valeur de repli** : si la variable CSS Vuetify n'est pas résolue dans ce sous-arbre
   téléporté, la déclaration devient invalide et la propriété peut retomber à transparent.

## Correction

- `.elv--dark` fixe désormais explicitement `color: #f3f4f6` en plus du `background`, et
  `.text-medium-emphasis` a un override dédié (`#9ca3af`).
- Toutes les propriétés `rgb(var(--v-theme-xxx))` / `rgba(var(--v-border-color), ...)` du composant
  ont désormais un repli littéral (`var(--v-theme-surface, 255, 255, 255)`, etc.) identique aux
  valeurs de la palette `dataFridayLight` (`src/plugins/vuetify.js`), pour ne jamais dépendre
  silencieusement d'une variable non résolue.
- Ajout d'un bloc `<style>` **non scoped** (à dessein, cf. commentaire dans le fichier) ciblant
  `.dark .v-overlay__content.v-select__content` — même contrat que
  [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md) : `.dark` sur `<html>` reste le seul
  ancêtre CSS fiable pour du contenu téléporté, quel que soit le niveau d'imbrication. Cette règle
  est volontairement globale (le nom de classe `.v-select__content` est générique à tous les
  `v-select` de l'app) : bénéfice direct pour tout autre select téléporté en dark mode, risque
  jugé nul (elle ne fait qu'ajouter une couleur/fond cohérents avec le thème dark existant, jamais
  remplacer une règle Vuetify plus spécifique en contexte non téléporté).
- La classe `.v-list-item-title` reste aussi ciblée via `:deep()` dans le style scoped existant,
  au cas où le DOM réel serait plus proche de l'arbre du drawer que supposé.

## Risque de régression / à surveiller

- **Non vérifié en navigateur** (contrainte de session : impossible de démarrer/redémarrer le
  serveur de dev). À valider manuellement, en dark **et** en light mode : ouvrir l'import CSV,
  passer aux étapes 3-7, ouvrir chaque dropdown de mapping, vérifier le texte des puces CSV
  (`.elv-csv-chip`), des libellés ("Colonne CSV : …"), et du menu déroulé une fois ouvert.
- Le scrim du drawer (`EventDrawerShell.vue:83-87`, forcé à `z-index: 2199 !important` pour un
  autre bug, BUG-148) **n'a pas été modifié** — je n'ai pas pu confirmer ou infirmer visuellement
  s'il contribue à l'effet "overlay noir" observé (le menu du `v-select` n'a normalement pas de
  scrim propre par défaut dans Vuetify — vérifié dans `VMenu.js:29`, `scrim: false`). Si le
  problème persiste après ce correctif, inspecter en devtools le `z-index` réel de
  `.v-navigation-drawer__scrim` par rapport au contenu du drawer au moment précis où l'overlay
  apparaît.
- Piège à retenir (déjà documenté en BUG-198) : pour tout contenu `Teleport to="body")`, cibler
  `.dark` (ancêtre `<html>`), jamais `.v-theme--dataFridayDark`/un wrapper scoped du composant.

## Correction apportée le 2026-07-28 (suite) — hypothèse affinée

Une capture d'écran utilisateur postérieure (étape 2 "Colonnes", **thème clair**) montre le même
symptôme perçu ("impossible de sélectionner autre chose") **sans dark mode du tout** : le menu d'un
`v-select` s'ouvre (chevron inversé) mais aucune option n'apparaît. Ça invalide l'hypothèse
"contraste dark mode" comme cause UNIQUE de l'« overlay noir » initial — la cause principale est en
réalité un conflit de `z-index` (menu du select rendu SOUS le scrim du drawer, indépendant du
thème), documenté et corrigé séparément en [BUG-241-02](241_02_csvimportdrawer_menu_select_derriere_scrim_drawer.md).
Les correctifs de CETTE fiche (couleur/fond du menu en dark mode) restent valides et nécessaires
une fois le menu effectivement visible (BUG-241-02 corrigé), mais ne suffisaient pas seuls : le
scrim du drawer masquait le menu AVANT même que son contraste ne pose problème.

## Références

- [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md) — même pattern, diagnostic et fix déjà
  validés une fois sur Event Predict
- [BUG-236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md) — bug voisin,
  même étape, cause différente (contenu vide, pas illisible)
- [BUG-241-02](241_02_csvimportdrawer_menu_select_derriere_scrim_drawer.md) — cause réelle probable
  de l'« overlay noir » (conflit de z-index avec le scrim du drawer, indépendant du thème)
