# BUG-246-01 — Référentiels : 11 écrans bloqués sur la page 1 (`items-length` posé sur `v-data-table` au lieu de `v-data-table-server`)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (une partie du référentiel est purement inatteignable dans l'UI)
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-29 (retour utilisateur) · **Corrigé le** : 2026-07-29 (JLH)
- **Fichiers** : 8 composants de liste, voir tableau ci-dessous

## Symptôme

Signalé par l'utilisateur : *« certaines catégories apparaissent dans le formulaire d'édition d'un
article mais pas dans l'écran Product Categories »*.

La capture d'écran suffit à établir le défaut, sans même regarder le code :

> l'en-tête annonce « **41 Total Categories** », le pied de tableau affiche « **1-10 of 10** ».

Le tableau croit qu'il n'y a que 10 lignes au total. Les flèches « page suivante » / « dernière
page » sont donc **inertes**, et les 31 autres catégories sont **inatteignables depuis cet écran**.
Les entrées visibles dans le dropdown de l'article (`Desert`, `Hot Dog`, `Main`) sont
alphabétiquement après `Cup`, donc sur les pages 2 à 5.

Le dropdown, lui, était correct : il lit le store `productCategories`, qui **boucle** sur les pages
serveur pour reconstituer la liste complète
([`store/modules/productCategories.js:56-83`](../../src/store/modules/productCategories.js)). D'où
la divergence entre les deux écrans, et la conclusion naturelle mais fausse que « les catégories ne
sont pas liées ».

## Cause racine

`items-length` est une prop de **`<v-data-table-server>`** — vérifié dans Vuetify 3.12.4 : seul
`VDataTableServer.js` la déclare. Posée sur un `<v-data-table>` ordinaire, elle est **ignorée** :
ce composant pagine côté client à partir de `items.length`, c'est-à-dire les 10 lignes de la page
serveur courante.

`serverTotal` était pourtant lu correctement depuis `meta.total`
([`ProductCategoryList.vue:230`](../../src/components/products/views/ProductCategoryList.vue)) et
affiché dans le compteur d'en-tête — ce qui explique l'incohérence visible entre les deux nombres.

### Origine : le correctif de BUG-171 était à moitié fait

[BUG-171](171_configurations_pagination_recherche_server_side.md) (2026-07-19) a basculé « les
10 écrans de liste Configurations » en pagination serveur : requête paginée, recherche serveur,
`serverPage`/`serverItemsPerPage`/`serverTotal`. Toute cette plomberie est correcte. **Mais le
composant est resté `<v-data-table>`.** Le chargement complet côté client a donc été supprimé sans
donner au paginateur de quoi connaître le total — d'où la régression.

Cette fiche était marquée **🟢 Corrigé** ; elle est repassée à ⚪ Diagnostiqué avec un renvoi ici.
Une fiche corrigée à tort est précisément ce que le tracker doit éviter : un agent qui la lit
conclut que le sujet est clos.

**Pourquoi ce n'est pas remonté plus tôt** : le défaut est invisible tant que le référentiel tient
en une page. Avec `Items per page: 10` par défaut, il faut 11 lignes pour le voir. Et il ne se
manifeste que dans le rendu Vuetify — aucun test unitaire ne pouvait l'attraper.

## Correction

Bascule sur `<v-data-table-server>`, le composant prévu pour ce contrat. La plomberie serveur
existante n'a pas été touchée : seule la balise change, plus `:page="serverPage"` (sans lui, une
recherche remet les *données* en page 1 mais le paginateur reste visuellement sur la page
précédente).

| Fichier | Écrans |
|---|---|
| `products/views/ProductCategoryList.vue` | Product Categories |
| `products/views/ProductTypeList.vue` | Product Types |
| `market-prices/views/MarketPriceCategoryList.vue` | Market Price Categories |
| `market-prices/views/MarketPriceTypeList.vue` | Market Price Types |
| `menu-fb/.../component-library/views/ComponentCategoryList.vue` | Component Categories |
| `menu-fb/.../component-library/views/ComponentTypeList.vue` | Component Types |
| `common/FlatReferentialListView.vue` | **4 écrans** : Display Names, Brand Names, Industrials, Packing Types |
| `menu-fb/.../menu-items/views/MenuItemView.vue` | Menu Items (bi-mode, voir ci-dessous) |

### Tri des colonnes désactivé — et pourquoi c'est un gain

Vérifié : **tous** les services concernés ordonnent en dur par `orderBy: { name: 'asc' }` et
n'acceptent **aucun** paramètre de tri (`menu-items.service.ts`, `component-taxonomy.service.ts`,
`market-price-taxonomy.service.ts`, et les 4 services plats). En pagination serveur, un en-tête
cliquable ne trierait donc **rien du tout**.

Avant le correctif il triait les 10 lignes de la page courante — c'est-à-dire **un tri qui ment sur
son périmètre** : l'utilisateur croit trier 41 catégories, il en trie 10. `sortable: false` sur
toutes les colonnes est donc plus honnête que l'état antérieur, pas une régression.

### `MenuItemView.vue` — cas bi-mode

Cet écran alterne entre catalogue complet (`viewMode === 'grid'` ou regroupement activé → tri et
filtrage client sur des données complètes, pied de page masqué) et pagination serveur. Le premier
mode n'a jamais eu le bug ; le second si.

Résolu par un **composant dynamique** (`tableComponent`) plutôt qu'en dupliquant ~150 lignes de
slots. Deux points de vigilance traités :

- **Import explicite obligatoire** — `import { VDataTable, VDataTableServer } from
  'vuetify/components/VDataTable'`. L'auto-import de `webpack-plugin-vuetify` (tree-shaking actif,
  [`vue.config.js:101`](../../vue.config.js)) résout les composants depuis les balises **statiques**
  du template ; il ne peut rien faire d'un `<component :is>`. Sans ces imports, la table serait
  absente à l'exécution. Le sous-chemin `./components/*` est un export public déclaré par le
  `package.json` de Vuetify.
- **Tri conditionnel** — `sortable` vaut `needsFullCatalog` : le tri par colonne reste actif en
  mode catalogue complet (où il fonctionne réellement) et n'est désactivé qu'en mode serveur.
- `groupByColumns` n'est peuplé que si `groupByEnabled`, lequel implique `needsFullCatalog` : le
  mode serveur reçoit donc toujours `[]`, aucun conflit entre regroupement et pagination serveur.

## Risque de régression / à surveiller

- **Non vérifié en navigateur** (pas de `pnpm dev` dans cette session). Les 8 fichiers compilent
  (parse + `compileTemplate`), suite unitaire et `pnpm lint:typo` au vert — mais ce bug est par
  nature invisible en test unitaire, c'est exactement ce qui l'a laissé passer lors de BUG-171.
  **La validation doit être manuelle.**
- `v-data-table-server` **exige** `items-length` et n'a aucun repli sur `items.length` : un
  `serverTotal` resté à 0 vide la table au lieu d'afficher la page reçue. À surveiller sur le
  chemin d'erreur (`loadServerPage` met `serverTotal = 0` dans son `catch`).
- `FlatReferentialListView.vue` est partagé par 4 écrans aux API distinctes : les retester
  séparément.
- **Si le paginateur « saute » brièvement en page 1 au clic sur « suivant », chercher ici d'abord** :
  `:page` est lié en **une seule direction**, sans écouteur `@update:page` — c'est
  `onUpdateOptions` qui met `serverPage` à jour après coup. Le correctif serait
  `v-model:page="serverPage"`, **mais attention** : cela mettrait `serverPage` à jour *avant*
  l'émission de `update:options`, ce qui ferait passer la garde anti-doublon d'`onUpdateOptions`
  (`page === this.serverPage`) et **supprimerait le refetch**. Il faudrait alors retirer cette
  garde en même temps. Ne pas faire l'un sans l'autre.
- Le tri par colonne devient inactif sur les 10 écrans de référentiel. Si le métier le veut
  réellement, il faut d'abord que les endpoints acceptent un paramètre de tri — chantier backend
  séparé.

### Vérification manuelle attendue

Sur `/configurations/product-categories` :

1. le pied de tableau affiche « 1-10 of 41 » (et non « of 10 ») ;
2. les flèches page suivante / dernière page sont actives **et ramènent des lignes différentes** —
   c'est le test qui compte, pas seulement le libellé du compteur ;
3. `Desert`, `Hot Dog`, `Main` apparaissent bien sur une page — c'est l'observation d'origine ;
4. changer « Items per page » à 25 puis 50 refetch et recompte ;
5. une recherche filtre côté serveur, recompte le total **et** ramène le paginateur en page 1 ;
6. rejouer sur les 5 autres écrans individuels, sur les 4 écrans plats, et sur Menu Items dans
   **les deux** modes (grille/regroupé, puis liste paginée).

## Références

- [BUG-171](171_configurations_pagination_recherche_server_side.md) — a introduit la pagination
  serveur sans changer de composant. Statut corrigé à ⚪ par cette fiche.
- [BUG-169](169_taxonomies_configurations_requetes_non_paginees.md) — étape précédente (bornage des
  requêtes à 200 lignes).
- [BUG-142](142_events_vdatatable_pagination_non_configuree.md) — même famille de défaut sur
  l'écran Événements.
- Constat connexe, **non traité ici** : la couverture `MenuItem.categoryId` est très faible
  (36,7 % des lignes vendues) et le référentiel contient des catégories en doublon
  (`Soft`/`SOFT`/`Softs`…) — problème de **données**, mesuré le 2026-07-29, à arbitrer séparément.

---

JLH
