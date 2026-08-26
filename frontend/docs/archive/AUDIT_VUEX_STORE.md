# Audit Vuex — Store `datafriday-web`

> Établi le 15 juillet 2026 à partir du code réel de `datafriday-web/src/store/` (branche courante au moment de l'audit — à revérifier avec `git branch --show-current` avant toute action, ce projet change de branche en cours de route).
> Complète [CARTOGRAPHIE_MODULES.md](CARTOGRAPHIE_MODULES.md) (§3, « Les 34 stores Vuex ») avec le détail du gestionnaire d'état : état des lieux factuel, dette technique inventoriée, plan d'action priorisé.

## 0. Chiffres clés

| | |
|---|---|
| Fichiers | 35 (`index.js` + 34 modules dans `src/store/modules/`) |
| Lignes totales | 6160 |
| Modules `namespaced: true` | 34/34 |
| Plus gros module | `analyse.js` — 2273 lignes (37 % du store à lui seul) |
| Plus petit module | `spaceConfigurations.js` — 28 lignes |
| Librairie de persistance Vuex | Aucune (`vuex-persistedstate` absent, `store/index.js` n'a pas de `plugins:`) |
| Mécanismes de cache différents cohabitant | 3 |
| Mécanismes de persistance locale différents cohabitant | 3 |

---

## 1. Structure du store

`src/store/index.js:1-82` importe statiquement les 34 modules et les enregistre dans `createStore()`. Le store racine est vide (`state/getters/mutations/actions` racine tous vides, `index.js:38-45`) : toute la logique métier vit dans les modules, tous `namespaced: true`.

34 modules : `auth, analyse, inventory, logistics, spaces, suppliers, events, eventSubcategories, eventCategories, eventTypes, productCategories, productTypes, marketPriceCategories, marketPriceTypes, componentCategories, componentTypes, brandNames, displayNames, industrials, packingTypes, permissions, roles, users, marketPrices, menuComponents, marketPriceIngredients, menuItems, packaging, spaceConfigurations, spaceShops, shopMenuItems, weezeventLocations, weezeventProducts, notifications`.

---

## 2. Pattern standard (28 modules sur 34)

La grande majorité des modules — tous les référentiels/catalogues (users, roles, brandNames, suppliers, packingTypes, menuItems, marketPrices, etc.) — suivent **exactement** le même squelette :

```js
// Template du module Vuex standard du projet — à copier pour tout nouveau référentiel
const TTL = 15 * 60 * 1000 // 15 min partout, y compris events.js (5→15 min le 2026-07-18, BUG-147,
                           // confirmé définitif le 2026-07-24) — le futur module Live aura son
                           // propre mécanisme de fraîcheur ~2 min, séparé de ce TTL

export default {
  namespaced: true,
  state: () => ({ list: [], cachedAt: null, fetching: false }),
  getters: {
    all: state => state.list,
    isCacheValid: state => state.cachedAt && Date.now() - state.cachedAt < TTL,
  },
  mutations: {
    SET_LIST(state, list) { state.list = list; state.cachedAt = Date.now() },
    SET_FETCHING(state, v) { state.fetching = v },
    INVALIDATE(state) { state.cachedAt = null },
    // ADD_X / UPDATE_X / REMOVE_X ponctuels après une mutation serveur réussie
  },
  actions: {
    async fetchList({ state, commit, getters }, { force = false } = {}) {
      if (getters.isCacheValid && !force) return state.list
      if (state.fetching) return state.list // garde simple — voir §3.2 pour le vrai single-flight
      commit('SET_FETCHING', true)
      try {
        const data = await api.getList()
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
        commit('SET_LIST', list)
        return list
      } finally {
        commit('SET_FETCHING', false)
      }
    },
    invalidate({ commit }) { commit('INVALIDATE') },
  },
}
```

Points positifs constatés et à préserver :
- **Aucune mutation ne fait d'appel API** — 100 % des 34 modules respectent la séparation mutations (synchrones, pures) / actions (asynchrones, réseau). C'est la règle la plus importante du store et elle est tenue sans exception.
- Le TTL de cache est cohérent (15 min partout, y compris `events.js` depuis le 2026-07-18 — cf. [BUG-147](bugs/147_events_store_ttl_5min_incoherent.md), décision confirmée définitive le 2026-07-24 ; le futur module Live gèrera sa propre fraîcheur ~2 min séparément).

---

## 3. Les écarts au pattern standard

### 3.1 `analyse.js` — god module

2273 lignes, 51 getters, 49 mutations, 17 actions dans un seul fichier (`src/store/modules/analyse.js`). Concentre : filtres Event Predict (~30 clés dans `DEFAULT_FILTERS`, `analyse.js:400-448`), agrégats de vente, réconciliation shop/menu, timelines, logique de prédiction (`pctDiff`, `buildVariations`, `totalsForEventIds`, `analyse.js:48-129`), et — depuis la réduction de `spaceShops` (§3.2) — un cache de shops rapatrié en interne (`SET_SPACE_SHOPS_ROWS`, `analyse.js:1528`, état `spaceShopsRows`, `analyse.js:526`).

### 3.2 `spaceConfigurations.js` et `spaceShops.js` — modules « stateless »

Réduits volontairement, sans state Vuex ni getters :

> `spaceConfigurations.js:11-13` : *« Module stateless : pas de state ni de getters. `fetchForSpace` retourne les configs sans les stocker — chaque composant consomme le retour et gère son propre cache local s'il en a besoin. »*

Le cache (quand il existe) est géré en `Map()` module-scope hors réactivité Vuex (`spaceShops.js:9-10`).

### 3.3 Conséquence : 3 stratégies de cache cohabitent

1. **Vuex state + `cachedAt`** (28 modules, la norme).
2. **`Map()` module-scope pur, hors Vuex** (`spaceConfigurations`, `spaceShops`).
3. **Vuex state (cache) + `Map()` module-scope pour le in-flight dedup** (`shopMenuItems.js:9`, partiellement `weezeventProducts`/`weezeventLocations`, et `auth.js:9-11` avec `checkOnboardingStatusPromise`/`fetchCurrentUserPromise`).

Aucune des trois n'est « fausse » en soi, mais leur coexistence sans doc explicite oblige à relire le code de chaque module avant de savoir comment le consommer.

---

## 4. Consommation dans les composants — deux strates

- **`auth`** (et lui seul) : Options API classique, `mapGetters`/`mapActions` — 15 fichiers, tous dans les vues login/onboarding/profil (`LoginView.vue`, `DashboardView.vue`, `AcceptInviteView.vue`, `AuthCallbackView.vue`, `ProfileView.vue`, etc.).
- **Tout le reste** (analyse, inventory, logistics, menu, spaces...) : Composition API via `useStore()` — 27 fichiers.
- 0 usage de `mapState`, `mapMutations`, ou `this.$store` direct dans tout le projet.

Ce n'est pas un mélange anarchique — c'est un clivage net entre deux strates de code (probablement `auth` = code plus ancien jamais migré vers la Composition API).

---

## 5. Dette technique inventoriée

| # | Sévérité | Emplacement | Description |
|---|---|---|---|
| D1 | 🔴 Bug silencieux | `inventory.js:310-316` et `:318-324` | `invalidateMarketPrices`/`invalidatePackagingTypes` définies deux fois à l'identique dans le même objet `actions` — la 2e écrase la 1re sans erreur JS. Copier-coller mort. |
| D2 | 🟠 Requêtes réseau redondantes | `componentCategories.js:1,48,57-67`, `marketPriceCategories.js:1,48,57-67` | Ces modules n'ont pas leur propre endpoint : ils réutilisent `getComponentTypes()`/`getMarketPriceTypes()` (mêmes endpoints que `componentTypes`/`marketPriceTypes`) et extraient `.categories` en local. Les vrais endpoints `getComponentCategories()` (`src/api/endpoints/menu.api.js:156`) et `getMarketPriceCategories()` (`src/api/endpoints/market.price.api.js:88`) existent mais ne sont **jamais appelés**. Chaque fetch « categories » déclenche un appel réseau redondant avec « types », sans cache partagé entre les deux modules jumeaux. |
| D3 | 🟡 Boilerplate dupliqué | `spaceConfigurations.js:3-9`, `spaceShops.js:19-28`, `shopMenuItems.js:19-28`, `weezeventLocations.js`, `weezeventProducts.js:5-12` | Fonction `unwrap()` réimplémentée localement dans ≥5 modules au lieu d'un helper partagé. |
| D4 | 🟡 Boilerplate dupliqué | ≥21 actions `fetch*` (`brandNames.js:49-55`, `users.js:49-55`, `roles.js:49-55`, `events.js:49-55`, `productCategories.js:57-63`, etc.) | Normalisation `Array.isArray(data) ? data : Array.isArray(data?.data) ? ... : []` copiée-collée quasi à l'identique partout. |
| D5 | 🟡 Logs de debug en prod | `inventory.js` (21 occurrences), `auth.js` (14), `analyse.js` (10, avec emojis 📥💰📤), `logistics.js` (5) | `console.log`/`console.error`/`console.warn` verbeux laissés dans les actions, sans logger centralisé ni niveau configurable. |
| D6 | 🟡 State dupliqué structurellement | `componentTypes.js`/`componentCategories.js`, `marketPriceTypes.js`/`marketPriceCategories.js` | Deux states Vuex distincts (cache TTL et cycle de vie indépendants) pour une donnée en réalité hiérarchique (categories ⊂ types). Lié à D2. |
| D7 | 🟢 Incohérence de convention | §3.3 | 3 stratégies de cache différentes sans documentation du choix (quand utiliser stateful vs stateless). |
| D8 | 🟢 Incohérence de convention | §4 | `auth` seul en Options API/`mapGetters`, tout le reste en Composition API — pas bloquant mais à trancher pour toute nouvelle vue touchant `auth`. |
| D9 | 🟢 Bus d'événements implicite | `events.js:76-85`, `inventory.js:238-247` | Dispatch cross-module `notifications/push` (`{ root: true }`) — cohérent mais `notifications` agit de facto comme un event bus partagé non isolé ; à surveiller si le nombre de dispatchers cross-module augmente. |

Aucun TODO/FIXME/XXX/HACK trouvé dans `src/store/` — la dette n'est pas signalée par des marqueurs, elle est simplement présente dans le code.

---

## 6. Persistance locale — 3 mécanismes non unifiés

1. **`src/data/localDb.js`** — couche maison localStorage avec clés préfixées (`analyse:space-inventory-counts:...`). Consommée par `inventory.js:16-17,270,281`.
2. **`notifications.js:14-53`** — localStorage 100 % local au module (pas via `localDb.js`), debounce 400 ms, ring-buffer 50 items, dédoublonnage 3 s.
3. **`analyse.js:2076`** — accès `localStorage` inline pour les versions Event Predict, préfixe `analyse:` partagé avec `localDb.js` mais code de lecture dupliqué, pas de fonction commune.

---

## 7. Plan d'action

### Tier 1 — Quick wins (< 1 jour, zéro risque, indépendants les uns des autres)

1. **D1** — Supprimer le doublon `invalidateMarketPrices`/`invalidatePackagingTypes` dans `inventory.js:310-324` (garder une seule déclaration).
2. **D2/D6** — Trancher explicitement : soit brancher `componentCategories`/`marketPriceCategories` sur les vrais endpoints `getComponentCategories()`/`getMarketPriceCategories()` (supprime l'appel réseau redondant), soit supprimer ces deux endpoints inutilisés côté API et documenter que « categories » est dérivé de « types » en mémoire. Les deux sont légitimes ; ce qui manque aujourd'hui, c'est juste la décision explicite.
3. **D5** — Retirer ou gater les `console.log`/emojis de debug derrière un flag d'environnement (`if (process.env.NODE_ENV !== 'production')`) en attendant un vrai logger (Tier 2).

### Tier 2 — Consolidation (quelques jours, tests navigateur nécessaires)

1. **D3/D4** — Extraire `unwrap()` et la normalisation de payload (`Array.isArray(...)`) dans un helper partagé (ex. `src/store/utils.js`), puis migrer les modules un par un (risque faible, mais 25+ fichiers à toucher → à faire par petits lots avec build+test après chaque lot, cf. règle « pas de build/commit auto »).
2. **D5** — Introduire un logger avec niveaux (silence en prod par défaut), migrer les `console.*` existants dessus module par module en commençant par `inventory.js` (le plus verbeux).
3. **§6** — Unifier la persistance locale : faire de `localDb.js` le point d'entrée unique, migrer `notifications.js` et l'accès inline de `analyse.js` dessus (ou au minimum partager la fonction de lecture/écriture avec le préfixe `analyse:`).

### Tier 3 — Décisions structurantes (à trancher avant d'agir, impact plus large)

1. **D7 — Standard de cache unique.** Choisir UNE convention pour les futurs modules « scopés » (ex. `spaceConfigurations`, `spaceShops`) : soit généraliser le pattern stateless (cache local au composable/composant, cohérent avec l'esprit Composition API déjà majoritaire — §4), soit revenir au pattern stateful standard pour tout le monde. Documenter le choix dans ce fichier une fois tranché, avec un critère clair (« stateless si la donnée est toujours scopée à un seul composant vivant, stateful sinon »).
2. **`analyse.js` — découpage du god module.** Scinder en sous-modules par responsabilité (filtres, agrégation/KPI, réconciliation shop/menu, timelines/prédictions) une fois qu'un besoin de modification y touche — ne pas le refactorer à froid sans raison fonctionnelle, le risque de régression est réel sur 2273 lignes sans tests.
3. **D8 — Harmoniser `auth`** vers Composition API/`useStore()` par cohérence avec le reste du store — faible priorité, aucun bug associé, à faire seulement si `auth.js` est de toute façon touché pour une autre raison.
4. **Vuex 4 vs Pinia** (cf. échange précédent) — pas urgent, Vuex 4 reste stable sur Vue 3. À réévaluer seulement si le coût du boilerplate (D3/D4) devient réellement douloureux malgré le Tier 2, ou si un nouveau module complexe justifie le typage TS natif de Pinia.

### Garde-fous pour ne pas recréer de dette

- Tout nouveau module référentiel/catalogue part du template §2, pas d'improvisation de pattern de cache.
- Avant de créer un module « stateless » comme `spaceConfigurations`/`spaceShops`, vérifier qu'il respecte le critère du Tier 3.1 une fois qu'il sera tranché — sinon rester sur le pattern standard par défaut.
- Pas de `console.log` nu dans une action `fetch*`/mutation : passer par le logger (une fois introduit en Tier 2) ou ne rien logger en dehors du dev local.
- Toute nouvelle donnée « categories » qui découle structurellement d'une donnée « types » (ou inversement) : vérifier D2/D6 avant de créer un state Vuex séparé — dériver via un getter plutôt que dupliquer le fetch.
- Revue de code : un module dépassant ~300-400 lignes est un signal à discuter avant qu'il ne devienne un `analyse.js` bis.
