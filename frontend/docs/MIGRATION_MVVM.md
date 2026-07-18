# Migration vers une architecture MVVM — analyse de faisabilité

> Établi le 2026-07-18 à partir de mesures réelles sur `src/` (395 fichiers `.vue`, ~228 000 lignes).
> Ce document n'est **pas** une décision actée : c'est l'état des lieux chiffré, ce qui est
> réalisable, ce qui ne l'est pas, et à quel prix. Si une migration est engagée, elle devra faire
> l'objet d'une ADR ([`adr/TEMPLATE.md`](adr/TEMPLATE.md)).
>
> Prérequis de lecture : [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) (les conventions
> actuelles), [`AUDIT_VUEX_STORE.md`](AUDIT_VUEX_STORE.md) (la dette du store).

---

## 0. La conclusion d'abord

**Le projet est déjà MVVM à ~40 %, sans l'avoir nommé.** Vue 3 + Composition API *est* un
framework MVVM : le template est la View, un composable est un ViewModel, `utils/` est le Model.

Il n'y a donc **pas de migration d'architecture à faire** — il y a une **convention à finir
d'appliquer** sur les 60 % restants. C'est une distinction pratique, pas sémantique : une
« migration MVVM » entendue comme réécriture globale est irréalisable ici et casserait le projet ;
une convergence incrémentale vers le même modèle cible est réalisable et à faible risque.

Ce que dit la mesure :

| Couche MVVM | Correspondance dans `src/` | État |
|---|---|---|
| **Model** | `utils/` (algorithmes purs) | ✅ **Sain** — ~5 500 lignes, couvertes par 5 146 lignes de tests |
| **Service** | `api/endpoints/*.api.js` + `store/modules/` | 🟡 **Contourné** — 104 `.vue` (26 %) appellent l'API en direct |
| **ViewModel** | `composables/use*.js` | 🟡 **Amorcé** — 7 vrais VM sur 28 fichiers, consommés par 10 % des vues |
| **View** | les 395 `.vue` | 🔴 **Le chantier** — 82,5 % Options API, logique métier dans les composants |

---

## 1. L'état des lieux chiffré

### 1.1 Volumétrie

```
src/  ≈ 228 000 lignes   (dont ~185 000 en .vue)
├── components/   290 fichiers   163 953 l.   ← dont 113 .vue À PLAT à la racine (~73 000 l.)
├── views/         18 fichiers    17 646 l.
├── utils/         39 fichiers     8 841 l.   ← le Model, déjà propre
├── i18n/           4 fichiers     7 382 l.
├── store/         35 fichiers     6 236 l.
├── composables/   28 fichiers     5 324 l.   ← le ViewModel embryonnaire
├── ui/            94 fichiers     4 128 l.   ← ZONE MORTE (vestige React)
└── api/           30 fichiers     3 871 l.
```

### 1.2 Les monstres

| # | Fichier | Lignes | Script | Methods | Computed | API directe |
|---|---|---|---|---|---|---|
| 1 | `components/EventPredictView.vue` | **9 192** | 5 053 | **113** | **106** | 6 endpoints + `utils/api` + `utils/eventApi` |
| 2 | `views/SpaceRestockView.vue` | **5 853** | 2 527 | 91 | 53 | 3 endpoints + `utils/api` |
| 3 | `components/EventPredictMenusSection.vue` | 3 230 | 1 571 | 76 | 22 | — |
| 4 | `views/DataIntegrationView.vue` | 2 934 | 989 | 44 | 6 | `mapping.api` |
| 5 | `components/PropertiesPanel.vue` | 2 890 | 676 | 34 | 0 | `utils/api` |

Puis `MenuItemCreateView.vue` (2 849), `SpaceInventoryView.vue` (2 746), `StepMapMenuItems.vue`
(2 597), `StepMapShops.vue` (2 587), `SpaceBuilderViewRoute.vue` (2 561)…

`EventPredictView.vue` représente à lui seul **5 % de tout le `.vue` du projet**.

### 1.3 Les frontières perméables

- **104 `.vue` (26 %) importent directement l'API** : 86 depuis `api/endpoints/`, 22 depuis le
  monolithe `utils/api.js` (1 497 lignes), dont 4 cumulent les deux. `StepMapMenuItems.vue` importe
  à lui seul 4 endpoints différents.
- **106 `.vue` (27 %) touchent le store directement**, contre **41 (10 %) qui passent par un
  composable**. La chaîne canonique de [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) §1 est
  minoritaire dans les faits.

### 1.4 Le filet de sécurité

| | Volume | Ce que ça couvre |
|---|---|---|
| `tests/unit/` | 29 fichiers, **5 146 l.** | `utils/` et `store/modules/analyse.js`. **Un seul spec de composant** (`eventDetailsEditor.spec.js`, 85 l.) |
| `tests/e2e/` | 6 fichiers, **95 l.** | Quasi rien — 25 lignes de specs réelles, 70 de scaffolding Cypress |

**C'est le fait le plus déterminant du document.** Extraire de la logique **hors** d'un composant se
fait sans aucun filet de régression sur l'UI. Mais la logique déjà sortie dans `utils/` est, elle,
bien protégée — donc **plus on extrait, plus on devient testable**. La migration finance sa propre
sécurité, à condition d'écrire le test au moment de l'extraction.

### 1.5 Typage

**Zéro TypeScript** : 0 fichier `.ts`, 0 `lang="ts"`, pas de `tsconfig.json`. Le typage est de la
JSDoc décorative, non vérifiée. `src/types/index.js` (237 l.) est **mort** ;
`src/types/inventoryCount.js` (66 l.) est vivant mais exporte des constantes runtime — c'est un
module de constantes mal rangé.

---

## 2. Ce qui est possible

### ✅ P1 — Assainir la frontière View ↔ Service (le meilleur rapport gain/risque)

Ramener les 104 `.vue` qui appellent l'API dans la chaîne canonique. **~60 d'entre eux sont des CRUD
répétitifs** (drawers/dialogs/lists de `brand-name`, `display-name`, `industrial`, `packing-type`,
`product-*`, `market-price-*`, `component-*`, `permission`, `role`) qui se traitent en série avec un
seul pattern.

Ces mêmes entités ont **24 modules Vuex de 58 à 96 lignes quasi identiques** — une factory de module
générique les remplacerait tous. Le refactor du composant et celui du store se font dans le même
geste.

**Risque : faible.** Périmètre étroit, comportement identique, testable à l'œil sur un écran CRUD.

### ✅ P2 — Formaliser la couche ViewModel

7 composables sont **déjà** des ViewModels de fait (~3 400 l.) : `usePredictiveTimeline` (1 129),
`useEventPredictVersions` (727), `useSpaceData` (418), `useInventoryData` (410), `useShopPerformance`
(272), `useShoppingList` (153), `useMetricsCalculator` (140). Ils exposent state réactif + actions et
encapsulent le chargement.

Il manque une convention écrite qui distingue les trois choses aujourd'hui mélangées dans
`composables/` :

| Nature | Exemples actuels | Où ça devrait vivre |
|---|---|---|
| **ViewModel** (state + actions d'un écran) | `useSpaceData`, `useInventoryData` | `composables/` |
| **Helper de présentation** | `useFormatters` (48), `useConfirmDialog` (68) | `composables/` ou `utils/` — à trancher |
| **Wrapper de service** | `useInventoryApi` (17), `useFilters` (proxy Vuex nu) | à supprimer ou à fondre dans le store |

**Risque : très faible** — c'est de la documentation et du rangement.

### ✅ P3 — Découper les monstres, un par un, par extraction

La seule méthode viable sur `EventPredictView.vue` : **extraire sans réécrire**. Sortir un bloc
cohérent (ex. les 106 computed liés au scoring) vers un composable, écrire le test unitaire sur ce
composable, vérifier dans le navigateur, commiter. Répéter.

Ordre recommandé, du plus rentable au plus risqué :
1. `MenuItemCreateView.vue` (2 849) — domaine bien documenté, 80 fiches bugs, comportement connu.
2. `SpaceInventoryView.vue` (2 746) — la formule d'inventaire est déjà dans `utils/`.
3. `SpaceRestockView.vue` (5 853) — **attention**, seul consommateur de `utils/api.js` à migrer aussi.
4. `EventPredictView.vue` (9 192) — **en dernier**, voir §3.

**Risque : moyen à élevé**, décroissant à chaque extraction testée.

### ✅ P4 — Supprimer les zones mortes

Gains immédiats, zéro risque fonctionnel : `src/ui/` (94 fichiers, 4 128 l., 1 seul consommateur
légitime), `src/figma/`, `src/hooks/`, `src/types/index.js` (237 l.),
`utils/predictiveAnalytics.legacy.js` (411 l.), `utils/predictiveAnalytics.js.bak`.

⚠️ `predictiveAnalytics.legacy.js` porte des **noms de fonctions identiques** au vrai moteur —
sa suppression est un gain de sécurité, pas seulement de propreté.

Et surtout la racine morte **`appCopy.vue`**, qui porte des branches mortes dans 4 domaines plus le
module Staff/HR entier ([`modules/`](modules/00_INDEX.md)).

### ✅ P5 — `<script setup>` pour tout nouveau fichier

67 fichiers l'utilisent déjà (17 %). En faire la norme pour le neuf coûte zéro et fait converger le
parc naturellement.

---

## 3. Ce qui n'est pas possible

### ❌ Un big-bang

228 000 lignes, 395 composants, **95 lignes d'e2e**. Une réécriture globale n'a aucun moyen d'être
validée. Elle produirait exactement la classe de bug la plus dangereuse de ce projet : des chiffres
faux affichés sans erreur (voir [`modules/02_ANALYSE.md`](modules/02_ANALYSE.md)).

### ❌ Réécrire `EventPredictView.vue` d'un bloc

9 192 lignes, 113 méthodes, 106 computed, 6 endpoints. Et surtout : le moteur qu'il pilote
(`utils/predictiveAnalytics.js`) est **partagé par trois domaines** — Event Predict, le mode
« predict » d'Analyse (`analyse.js:regeneratePredictions`), et le Réarmement
(`SpaceRestockView.vue:2518`). Une régression ici casse trois écrans, dont deux appartiennent à un
autre owner.

Aggravant : le spec de référence [`ALGORITHME_PREDICTION_NEW_RULES.md`](utiles/ALGORITHME_PREDICTION_NEW_RULES.md)
**ne décrit pas fidèlement le code** (7 divergences documentées dans
[`prototypes/06`](utiles/prototypes/06_REACT_ALGORITHME_PREDICTION.md)). Il n'existe donc **aucune
référence fiable** contre laquelle valider une réécriture. Extraction incrémentale uniquement.

### ❌ Un ViewModel pur par vue, sans Vuex

MVVM canonique voudrait un ViewModel propriétaire de son état. Ici, 34 modules Vuex portent l'état
partagé et le cache TTL, et `analyse.js` (2 273 l., 51 getters, 49 mutations) est le socle de tout un
domaine. Le remplacer par des VM locaux **supprimerait le cache partagé** et multiplierait les
requêtes — sur une latence dev de ~600 ms/requête, l'effet serait immédiat.

**La forme réaliste** : Vuex reste la couche Service/cache, le ViewModel s'appuie dessus. Ce n'est
pas du MVVM de manuel, c'est du MVVM applicable ici.

### ❌ Des contrats typés sans TypeScript

Un ViewModel non typé en JS n'offre aucune garantie de contrat. Introduire TS sur 395 `.vue` en
Options API est un chantier distinct, plus gros que la migration elle-même. **Si le typage est
l'objectif réel, il faut le dire — c'est une autre décision.** Un compromis existe (JSDoc + `checkJs`
sur `utils/` et `composables/` seulement) mais reste à arbitrer.

### ❌ Migrer les 326 fichiers Options API

Sans bénéfice fonctionnel, avec un risque de régression sur chacun. La règle actuelle de
[`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — « rester cohérent avec les fichiers voisins »
— reste la bonne. On convertit **quand on touche déjà au fichier**, jamais pour convertir.

### ❌ Toucher au Builder pendant la migration

Deux architectures complètes (v1/v2) cohabitent sur la même table `SpaceElement`, sans flag de
rollout, avec bascule silencieuse v1→v2 ([ADR-0002](adr/0002_builder_v2_relationnel_seul.md)).
Y superposer un refactor transverse, c'est empiler deux migrations non terminées. **Geler ce domaine
jusqu'à ce que la bascule v2 soit close.**

---

## 4. Les risques

| # | Risque | Gravité | Mitigation |
|---|---|---|---|
| R1 | **Aucun filet e2e** (95 l.) — une régression UI ne se voit qu'à l'usage | 🔴 | Écrire le test unitaire **au moment** de l'extraction, pas après. Test navigateur obligatoire ([CONTRIBUTING](../CONTRIBUTING.md)) |
| R2 | **Régression silencieuse sur les chiffres** — Analyse affiche déjà des valeurs potentiellement fausses sans erreur | 🔴 | Ne pas toucher au pipeline Analyse dans le même lot. Comparer les valeurs avant/après sur un espace réel |
| R3 | **`predictiveAnalytics.js` partagé par 3 domaines** | 🔴 | Ne jamais modifier le moteur pendant un refactor de vue. Extraire *autour*, jamais *dedans* |
| R4 | **Push sur `develop` = déploiement prod Cloudflare**, sans tests bloquants | 🟠 | PR vers `staging` uniquement, merge par le lead |
| R5 | **Conflits de merge massifs** sur des fichiers de 5 000+ lignes | 🟠 | Un fichier monstre = une PR dédiée, courte, mergée vite. Jamais deux personnes sur le même monstre |
| R6 | **Doc désynchronisée** — les pages `modules/` citent `fichier:ligne` | 🟠 | Mettre à jour la page du domaine **dans la même PR** (règle existante de `modules/00_INDEX.md`) |
| R7 | **Ownership croisé** — Jean-Luc (Analyse/Predict/Inventory/Restock), Emmanuel (auth/RBAC), Ulrich (le reste) | 🟠 | Aucun refactor transverse sans accord de l'owner du domaine |
| R8 | **Reproduire une incohérence connue** en refactorant | 🟡 | Lire les fiches [`bugs/`](bugs/00_INDEX.md) du domaine avant. 24 bugs ouverts, dont 3 « non corrigés par choix » |
| R9 | **Régression de perf** — casser le lazy-loading des routes ou le cache TTL | 🟡 | Ne jamais transformer un `() => import()` en import statique |
| R10 | **Migration abandonnée à mi-parcours** → 3 conventions au lieu de 2 | 🟡 | Séquencer par lots complets et livrables. Un lot fini avant le suivant |

---

## 5. Séquencement proposé

Chaque lot est **livrable et arrêtable** : si la migration s'interrompt après n'importe lequel, le
projet est dans un état cohérent, jamais à moitié converti.

| Lot | Contenu | Effort | Risque | Livrable |
|---|---|---|---|---|
| **0** | ADR de décision + convention écrite des 4 couches + définition de « ViewModel » | S | — | 1 ADR + màj `FRONTEND_ARCHITECTURE.md` |
| **1** | Purge des zones mortes (`ui/`, `figma/`, `hooks/`, `types/index.js`, `legacy`, `.bak`, `appCopy.vue`) | S | 🟢 | −5 000 l. environ |
| **2** | Factory de module Vuex + les 24 CRUD alignés dessus | M | 🟢 | −1 500 l. de duplication |
| **3** | Les ~60 CRUD `.vue` ramenés dans la chaîne canonique | M | 🟢 | 104 → ~45 fichiers hors chaîne |
| **4** | Rangement de `composables/` : VM / helper / wrapper. Suppression des proxies nus | S | 🟢 | Couche VM lisible |
| **5** | Migration de Restock hors `utils/api.js`, puis suppression du monolithe (1 497 l.) | M | 🟠 | Un seul client HTTP |
| **6** | Découpe par extraction : `MenuItemCreateView` → `SpaceInventoryView` → `SpaceRestockView` | L | 🟠 | 1 PR par fichier, tests unitaires ajoutés |
| **7** | `EventPredictView.vue`, extraction progressive | XL | 🔴 | **Ne pas commencer avant que 6 soit clos** |

Le Builder (`spaces/`, 19 894 l.) est **hors périmètre** jusqu'à clôture de la bascule v2.

---

## 6. Ce que ça donne, concrètement

Avant — un CRUD typique aujourd'hui :

```
BrandNameListView.vue
├── import { getBrandNames, deleteBrandName } from '@/api/endpoints/...'  ← court-circuit
├── data() { list: [], loading: false, error: null }                       ← état dupliqué
├── methods: { async load() { ... }, async remove() { ... } }              ← logique dans la vue
└── template
```

Après :

```
BrandNameListView.vue          ← View : template + bindings, ~80 lignes
   └── useBrandNames()         ← ViewModel : { items, loading, error, load(), remove() }
          └── store/brandNames ← Service : cache TTL 15 min, single-flight
                 └── brand.name.api.js  ← endpoint
                        └── api/client.js
```

Le template ne change pas. C'est le point : **la View est la partie qu'on ne réécrit pas.**

---

## 7. Recommandation

**Faire les lots 0 à 4, puis réévaluer.** Ils représentent l'essentiel du gain structurel pour un
risque quasi nul, et laissent le projet dans un état strictement meilleur quoi qu'il arrive ensuite.

Les lots 5 à 7 touchent au cœur métier (Restock, Predict) avec un filet de test faible et un spec de
référence non fiable — ils méritent leur propre décision, prise avec Jean-Luc, une fois que les
premiers lots auront montré le coût réel d'une extraction.

**Ne pas engager la migration si** : la bascule Builder v2 n'est pas close, ou si le pipeline de
déploiement `develop` → prod Cloudflare n'a pas été sécurisé (R4).

**Question ouverte à trancher avant le lot 0** : l'objectif réel est-il l'architecture (séparation
des couches) ou le typage (contrats vérifiés) ? Les deux sont légitimes, mais ce sont deux chantiers
différents et le second est le plus gros. À poser dans
[`QUESTIONS_A_BERTRAND.md`](QUESTIONS_A_BERTRAND.md) si la réponse n'est pas évidente.

---

## Références

- [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — la chaîne canonique actuelle (§1), les
  zones mortes (§8)
- [`AUDIT_VUEX_STORE.md`](AUDIT_VUEX_STORE.md) — gabarit standard, dette D1-D9, `analyse.js`
- [`adr/0002_builder_v2_relationnel_seul.md`](adr/0002_builder_v2_relationnel_seul.md) — pourquoi le
  Builder est hors périmètre
- [`modules/00_INDEX.md`](modules/00_INDEX.md) — les pièges par domaine, à lire avant de toucher à un
  monstre
- [`bugs/00_INDEX.md`](bugs/00_INDEX.md) — 24 bugs ouverts, 3 « documentés non corrigés par choix »
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — workflow Git, obligation de test navigateur
