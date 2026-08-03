# BUG-282-01 — Dark mode : chrome global et contenus téléportés restants (loader de navigation, skeleton Predict, NumberField sur préférence OS, switcher d'espace, notifications, dialogs intégration)

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟡 Mineur (flashs blancs et éléments isolés ; aucun blocage)
- **Domaine** : Transverse / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (audit dark mode complet) — JLH
- **Fichiers** : voir liste ci-dessous

## Symptôme / cause / correction (par fichier)

1. **`src/components/RouteTransitionLoader.vue`** — voile `rgba(255,255,255,.92)` plein écran à
   **chaque navigation** (monté globalement) : flash blanc en thème sombre. → règles
   `.dark .rtl-overlay/.rtl-ring/.rtl-label` (voile `rgba(17,24,39,.92)`).
2. **`src/views/SpacePredictView.vue`** — skeleton de chargement (premier paint de
   `/spaces/:id/predict`) entièrement clair (`#F5F5F5`/`#FFFFFF`/shimmer `#EEEEEE`). → bloc
   `.dark` (fond `#111827`, cartes/shimmer `#1f2937`/`#263548`).
3. **`src/components/common/NumberField.vue`** — dark sur `@media (prefers-color-scheme: dark)`
   (préférence **OS**), seul usage du repo, découplé du toggle `.dark` de l'app : OS clair +
   app sombre = champ blanc ; OS sombre + app claire = champ sombre sur page claire. → mêmes
   règles re-scopées `.dark` (partout où NumberField est utilisé : comptage inventaire,
   restock, builder).
4. **`src/components/WorkspaceSpaceSwitcher.vue`** — champ de recherche du menu en littéraux
   clairs (`#e5e7eb`/`#f9fafb`), seul reliquat d'un fichier par ailleurs en
   `rgb(var(--v-theme-*))`. → `.dark .wsh-space-search` (surface `#1a2332`).
5. **`src/components/SpacesPage.vue:255`** — panneau notifications `bg-white` sans contrepartie
   `dark:` (`/spaces-overview`). → `dark:bg-gray-900 dark:border-gray-700` (classes vérifiées
   présentes dans le bundle Tailwind précompilé `src/index.css` — contrainte : toute classe
   `dark:*` inédite y serait sans effet).
6. **`src/components/integration/wizard/dialogs/ResolveWeezeventLinkDialog.vue`** — seule
   couleur en dur du fichier : bordure `.rwl-row` `#e5e7eb` (reste = Vuetify thémé). →
   `.dark .rwl-row { border-color:#374151 }`.

## Faux positifs de l'audit (vérifiés conformes, rien à faire)

- `src/components/EventPredictRowActions.vue` — le kebab (activator) vit DANS
  `.event-predict-overlay` (tokens hérités, déjà convertis par BUG-247-01) ; seul le `v-list`
  est téléporté et suit le thème Vuetify.
- `src/components/integration/wizard/dialogs/MapEventToExistingDialog.vue` — zéro littéral,
  zéro `<style>` : 100 % composants Vuetify thémés.

## Risque de régression / à surveiller

- Thème clair inchangé partout (overrides `.dark`/`dark:` uniquement).
- NumberField : le comportement « OS sombre + app claire » change (le champ redevient clair,
  aligné sur l'app) — c'est le but, mais à mentionner si un utilisateur s'était habitué.
- Contrôle visuel : navigation (loader), premier chargement Predict, comptage inventaire
  (NumberField), header workspace (recherche du switcher), `/spaces-overview` (notifications),
  `/data-integration/fb` (dialog Weezevent).

## Références

- [BUG-247-01](247_01_darkmode_cartes_espaces_homepage.md) — vague précédente sur le shell
  global ; l'`EventPredictRowActions` y avait déjà été converti (d'où le faux positif).
- [BUG-197](197_darkmode_workspaces_fb_inventory_logistic_restock.md) — contrat `--fb-*`.
