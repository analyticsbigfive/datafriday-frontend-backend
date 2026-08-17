# BUG-324-02 — ComponentCreateView.vue : `<v-app>` imbriqué (architecture)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`

## Symptôme

Aucun symptôme utilisateur direct rapporté — trouvé en creusant une demande de refonte visuelle
(aligner le design sur `MenuItemCreateView.vue`). `App.vue` enveloppe déjà toute l'application dans
un unique `<v-app>` (ligne 2). `ComponentCreateView.vue` était le **seul** écran de tout
`components/menu-fb/views/` à instancier son propre `<v-app id="component-create-page">` en plus,
créant un `<v-app>` imbriqué — non standard en architecture Vuetify (un seul `v-app` par
application), source potentielle de bugs de layout/theming difficiles à diagnostiquer (double
provide/inject de contexte Vuetify).

## Cause racine

Racine du template : `<v-app id="component-create-page" :class="{ 'cc--dark': isDark }">` au lieu
d'un simple `<div>` comme dans toutes les autres vues du domaine (ex. `MenuItemCreateView.vue`
ligne 2 : `<div id="menu-item-create-page" ...>`).

## Correction

Remplacé par `<div id="component-create-page" ...>` (et sa fermeture `</v-app>` → `</div>`), dans le
cadre de la refonte du layout de cet écran pour matcher `MenuItemCreateView.vue`. Les conteneurs
`<v-container fluid>` imbriqués ont aussi été retirés au profit d'un layout flex fixe plein
viewport, cohérent avec le reste du domaine.

## Risque de régression / à surveiller

Aucun comportement Vuetify (theming, breakpoints) ne dépendait explicitement de ce `v-app`
supplémentaire d'après relecture du fichier — mais à surveiller si un composant Vuetify de cet
écran se comportait différemment après coup (rare, non identifié lors du fix). Pas de test
automatisé sur ce fichier.

## Références

- `docs/FRONTEND_ARCHITECTURE.md` (convention : un seul `v-app`, posé dans `App.vue`).
