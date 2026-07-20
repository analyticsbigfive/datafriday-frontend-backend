# BUG-158 — `EventFormDrawer.vue` : bouton "Créer" (équipe inline) en `color="primary"` — vire violet en dark mode au lieu du rouge de marque

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/components/events/drawers/EventFormDrawer.vue:475`

## Symptôme

Trouvé lors d'un balayage de complétude (suite BUG-157, demande utilisateur "on a tout couvert ?
pour les events") : le bouton "Créer" du mini-tiroir de création d'équipe inline (dans
`EventFormDrawer.vue`) utilisait `<v-btn color="primary">`. Or `theme.primary` vaut `#ff3131`
(rouge de marque) en thème clair mais `#9F7AFF` (violet) en thème sombre
(`src/plugins/vuetify.js:9-43`, palette dark volontairement distincte). Ce bouton — et son spinner
de chargement (`:loading="teamCreateLoading"`) — aurait donc viré violet en dark mode, alors que
tous les autres CTA de ce même domaine (dizaines de boutons custom `background: #ff3131` codés en
dur dans les dialogs/drawers/écrans Événements) restent rouges quel que soit le thème.

## Cause racine

Seul `v-btn` natif Vuetify du domaine Événements côté taxonomie/formulaires à utiliser un token de
thème (`color="primary"`) plutôt que le rouge codé en dur `#ff3131` comme partout ailleurs dans ce
même sous-domaine. Repéré uniquement parce que le thème dark a une palette d'accent différente du
clair (design assumé, cf. commentaire `vuetify.js:37-39`) — sinon invisible en usage courant (thème
clair par défaut).

## Correction

`color="primary"` → `color="#ff3131"`, alignant ce bouton (et son spinner de chargement) sur la
convention du reste du domaine.

## Risque de régression / à surveiller

Aucun — changement d'une valeur de couleur statique, non reproduit en navigateur (pas de `pnpm dev`
dans cette session) mais sans risque fonctionnel.

## Références

- [BUG-157](157_events_domaine_loading_tableaux_noir_et_navigation_event_lie_retiree.md) — même famille (couleur des indicateurs de chargement), même session.
