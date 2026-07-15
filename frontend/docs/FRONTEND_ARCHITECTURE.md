# Architecture technique frontend — `datafriday-web`

> Établi le 2026-07-15 à partir du code réel de `src/`. Décrit **comment le code est organisé et
> comment il doit continuer à l'être** — pas les règles métier (→ [`docs/modules/`](modules/00_INDEX.md))
> ni les décisions déjà actées (→ [`docs/adr/`](adr/00_INDEX.md)) ni la dette du store (→
> [`AUDIT_VUEX_STORE.md`](AUDIT_VUEX_STORE.md), complémentaire à la section 3 ci-dessous).
>
> **Pour humains ET agents IA** : toute nouvelle vue, composant, module de store ou appel API doit
> suivre les conventions ci-dessous. S'en écarter ajoute une 4e variante à un pattern qui n'en a
> déjà que trop (voir §3 et §8) — si un écart semble nécessaire, le documenter (ADR) plutôt que de
> l'introduire silencieusement.

## 0. Stack

| Couche | Techno | Notes |
|---|---|---|
| Framework | Vue 3 | Majoritairement **Options API** (`export default {}`, 327 fichiers) ; `<script setup>` minoritaire mais accepté (67 fichiers) — pas de règle stricte sur lequel choisir pour un nouveau fichier, rester cohérent avec les fichiers voisins du même domaine |
| UI kit | Vuetify 3 | Composants `<v-*>` dans les templates |
| État | Vuex 4 | 34 modules `namespaced: true`, voir §3 |
| Routing | Vue Router 4 | Toutes les routes en lazy `() => import(...)`, voir §5 |
| HTTP | Axios | Client central unique `src/api/client.js`, voir §4 |
| i18n | Maison (pas `vue-i18n`) | `src/i18n/`, voir §6 |
| Build | Vue CLI (`vue.config.js`) | pas Vite |

## 1. Les 4 couches et le flux de données

```
Vue (.vue)  →  composable (use*.js)  →  store Vuex (cache/état partagé)  →  api/endpoints (*.api.js)  →  api/client.js (Axios)  →  backend
```

- **Composant `.vue`** : template + orchestration locale. Ne parle **jamais** directement à Axios —
  toujours via un composable ou une action de store.
- **Composable (`src/composables/use*.js`)** : logique réutilisable, sans état de rendu propre au
  composant. Peut lire/écrire le store, faire du calcul dérivé (`computed`), ou gérer un état
  purement local à un composant (pattern "stateless" du store, voir §3.2).
- **Store Vuex (`src/store/modules/*.js`)** : état partagé entre plusieurs composants + cache
  (TTL). Un module par ressource/référentiel.
- **`api/endpoints/*.api.js`** : un fichier par domaine, fonctions fines qui enveloppent un seul
  appel Axios (`api.get/post/patch/delete`), gèrent un `try/catch` avec `console.error` puis
  `throw` (pas de swallow silencieux).

Un composant ne doit **pas** contourner cette chaîne (ex. importer directement `api/endpoints/`
depuis un `.vue` sans passer par composable/store) sauf cas ponctuel déjà établi dans le fichier
voisin — la norme reste composant → composable/store → endpoint.

## 2. Organisation des fichiers `.vue`

Deux zones coexistent, avec un rôle différent :

- **`src/views/`** — pages "cœur" routées directement depuis `router/index.js` : auth
  (`LoginView`, `SignUpView`, `OnboardingView`...), `DashboardView`, pages `Space*View`
  (inventaire, logistique, predict, restock). Historiquement plus ancien.
- **`src/components/<domaine>/`** — tout le reste, organisé **par domaine métier**, avec un
  sous-découpage constant à l'intérieur de chaque domaine :
  - `views/` — les pages CRUD du domaine (list/create/detail), routées elles aussi
    (ex. `components/user/views/UserListView.vue`, `components/menu-fb/views/menu-items/views/MenuItemCreateView.vue`)
  - `dialogs/` — popups modales liées au domaine (ex. `UserDeleteDialog.vue`)
  - `drawers/` — panneaux latéraux d'édition (ex. `UserEditDrawer.vue`)
  - fichiers `.vue` à plat pour les composants d'affichage réutilisés dans le domaine

Les domaines complexes (`menu-fb`) imbriquent plusieurs sous-domaines sur ce même schéma
(`components/menu-fb/views/<sous-domaine>/{views,dialogs,drawers}/`) — suivre cette structure pour
tout nouvel écran plutôt que d'inventer un découpage différent.

- **`src/components/common/`** — composants transverses, pas liés à un domaine.

### Convention de nommage

- Page routée : suffixe `*View.vue` (`UserListView.vue`, `MenuItemCreateView.vue`).
- Popup modale : suffixe `*Dialog.vue`.
- Panneau latéral : suffixe `*Drawer.vue`.
- Un composant = PascalCase, sans abréviation cryptique.

## 3. State management (Vuex)

Détail complet, gabarit à copier et dette inventoriée : **[`AUDIT_VUEX_STORE.md`](AUDIT_VUEX_STORE.md)**.
Résumé de ce qui est non négociable pour tout nouveau module :

- `namespaced: true` systématique.
- **Séparation stricte mutations (synchrones, pures) / actions (async, réseau)** — respectée sans
  exception sur les 34 modules existants, ne pas être le premier à la casser.
- Pattern standard (28/34 modules) : `state: { list, cachedAt, fetching }`, getter `isCacheValid`
  (TTL 15 min par défaut), action `fetchList({ force })`, action `invalidate`. Copier ce gabarit
  pour tout nouveau référentiel/catalogue plutôt qu'improviser une 4e variante de cache.
- Consommation dans les composants : **Composition API `useStore()`** (27 fichiers) est la norme
  actuelle. Seul `auth` (code plus ancien) utilise encore `mapGetters`/`mapActions` — ne pas
  reproduire ce pattern dans un nouveau module, et ne pas utiliser `this.$store`/`mapState` (0
  usage dans tout le projet).
- Pattern "stateless" (`spaceConfigurations.js`, `spaceShops.js` : pas de state Vuex, le composant
  consommateur gère son propre cache local) : réservé aux données toujours scopées à un seul
  composant vivant à la fois — voir critère détaillé dans l'audit avant de l'utiliser pour un
  nouveau module.

## 4. Couche API (`src/api/`)

- **`client.js`** — instance Axios unique (`apiClient`), gestion centralisée du token d'accès
  (`setAccessToken`/`getAccessToken`), intercepteurs request/response (refresh token, redirection
  login sur 401). Timeout 60s (délibéré, voir commentaire en tête de fichier — catalogue lourd sur
  Render). **Ne jamais instancier un second client Axios** dans un domaine.
- **`api/endpoints/<domaine>.api.js`** — un fichier par domaine (`menu.api.js`,
  `market.price.api.js`, `aggregation.api.js`...), fonctions nommées `getX`/`createX`/`updateX`
  wrappant un seul appel HTTP, avec `try { ... } catch (error) { console.error(...); throw error }`.
  Suivre ce format pour toute nouvelle fonction plutôt qu'un appel Axios inline dans un composant
  ou un store.
- **`apiOrMock.js`** — wrapper historique de fallback mock, **le fallback silencieux a été retiré**
  (voir commentaire en tête de fichier) : appelle toujours l'API réelle, laisse remonter l'erreur.
  Ne pas réintroduire de mock silencieux dessus.
- **`src/utils/api.js`** — monolithe legacy de 45 Ko, encore appelé par Restock uniquement. Ne pas
  y ajouter de nouvelles fonctions ; toute nouvelle route API passe par `api/endpoints/`.

## 5. Routing (`src/router/`)

- `index.js` déclare toutes les vues en **lazy** (`() => import('.../XView.vue')`) — jamais
  d'import statique d'une vue, ça casse le découpage en chunks (règle perf actée, voir commentaire
  en tête de fichier : import statique = vue inlinée dans le chunk eager, payée par CHAQUE route).
- `guards.js` centralise les guards de navigation : `requireAuth`, `requireOrganization`,
  `guestOnly`, `spaceEntryGuard`, `onboardingGuard`. Toute nouvelle règle d'accès passe par un
  guard existant ou un nouveau guard dans ce fichier — pas de vérification d'accès inline dans un
  composant de page.

## 6. i18n (`src/i18n/`)

- **Pas `vue-i18n`** — implémentation maison : `translations.js` (dictionnaire de clés),
  `useI18n()` (composable, `locale`/`t`/`setLocale`, écoute l'event `locale-changed`).
- Usage dans un composant : `import { useI18n } from '@/i18n/useI18n'` puis `const { t } = useI18n()`
  dans `setup()`, appel `t('maCle')` en template. Ne pas hardcoder de texte utilisateur FR/EN en
  dur dans un template — toute nouvelle clé passe par `translations.js`.

## 7. Styles

- Vuetify (`color="surface"`, classes utilitaires `px-4`, `ml-1`...) comme socle.
- CSS global minimal (`src/style.css`, reset), `src/styles/workspace-ui.css` pour les styles
  transverses au shell applicatif. Pas de framework CSS utilitaire (Tailwind) en dehors des
  classes Vuetify.
- **Typographie** : voir [`CHARTE_GRAPHIQUE.md`](CHARTE_GRAPHIQUE.md) ([ADR-0003](adr/0003_charte_graphique_typographie.md))
  — 1 police d'interface (stack système) + 1 police technique (monospace, logs/terminal
  uniquement), échelle fermée de 7 paliers de taille, 4 poids (400/500/600/700). Obligatoire pour
  tout nouveau `font-size`/`font-weight`/`font-family`.

## 8. Zones mortes — ne pas construire dessus

Vestiges d'un ancien prototype React (Figma Make), **jamais migrés vers Vue** :

- `src/ui/` — 94 composants (shadcn-like : `Command.vue`, `alertDialog.vue`...). Une seule
  consommation légitime actuellement (`components/UserMenu.vue`) — ne pas en ajouter d'autres, ne
  pas partir de ce dossier pour un nouveau composant.
- `src/figma/`, `src/hooks/`, `src/types/` — copies du prototype React, non branchées sur le code
  Vue actif.
- `versionReact/`, `api-datafriday-main/` (racine du repo) — prototypes/copies archivés, voir
  [ADR-0001](adr/0001_vue_source_de_verite_unique.md). Lecture interdite pour comprendre le
  comportement actuel, ne jamais construire dessus.

## 9. Checklist pour un agent qui ajoute une fonctionnalité

1. Nouvel écran de référentiel/CRUD ? → suivre l'arborescence `components/<domaine>/views|dialogs|drawers/` (§2), pas `src/views/`.
2. Nouvel état partagé/cache ? → copier le gabarit Vuex standard (§3, détail dans l'audit).
3. Nouvel appel backend ? → fonction dans `api/endpoints/<domaine>.api.js`, jamais d'Axios inline (§4).
4. Nouvelle route ? → import lazy + guard existant si accès restreint (§5).
5. Nouveau texte utilisateur ? → clé dans `i18n/translations.js`, jamais de texte en dur (§6).
6. Avant de copier un pattern d'un fichier existant : vérifier qu'il n'est pas dans une zone morte (§8) ou une exception documentée (`auth.js` en Options API, §3).
