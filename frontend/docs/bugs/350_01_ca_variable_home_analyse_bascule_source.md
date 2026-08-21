# BUG-350-01 — Le CA change entre la carte d'espace, le chargement de l'Analyse et l'arrivée du catalogue

- **Statut** : 🟡 Corrigé non testé (correctif front livré le 2026-08-21 ; contrôle n°1 en
  navigateur non fait)
- **Sévérité** : 🔴 Critique (trois montants de CA différents pour le même espace en moins d'une
  minute, aucun signalé comme provisoire ; un total item-level qui sous-compte en silence)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend/frontend`
- **Découvert le** : 2026-08-21 (retour utilisateur, captures de l'espace **Stade Jean Bouin**)
- **Fichiers** : `src/utils/analyseRevenueSource.js` (nouveau),
  `src/components/analyse/AnalyseView.vue`,
  `src/composables/useAnalyseItemRecords.js`, `src/composables/useMetricsCalculator.js`,
  `src/composables/useShopPerformance.js`,
  `src/components/analyse/panels/FinancialMetricsGrid.vue`,
  `src/components/analyse/panels/KpiCard.vue`,
  `src/components/spaces/widgets/SpaceItem.vue`

## En clair

Trois écrans, trois nombres — mais **deux histoires différentes**, pas une seule.

**1. Entre la carte d'espace et l'Analyse, le CA ne bouge pas.** `2 926 565,31 €` et
`2 926 565 €` : le même euro au centime près. Ce qui diffère, c'est le par-spectateur (3,58 € vs
6,04 €), parce que les deux écrans ne divisent pas par le même nombre de billets. La carte prend
**tous** les événements de l'espace (à venir et sans vente compris), l'Analyse **seulement ceux
affichés**. Deux questions légitimes, une seule étiquette.

**2. Dans l'Analyse, le CA change vraiment** (`2 926 565 €` → `2 718 041 €`) parce que l'écran
**change de source** en cours de route : d'abord un pré-calculé par point de vente, puis le détail
par article. Le premier chiffre était un bouchon d'attente publié comme un résultat.

Le catalogue n'y est pour rien : **aucun calcul de CA ne passe par les menu items ni par le space
menu** (vérifié sur tous les chemins de lecture). Il n'apporte que les coûts, les noms d'articles
et la consommation de stock.

## Symptôme

Espace **Stade Jean Bouin** (Paris, capacité 20 000), onglet Analyse, tout l'historique.

| | Carte `/spaces` | Analyse au chargement | Analyse après le catalogue |
|---|---|---|---|
| CA | **2 926 565,31 €** | **2 926 565 €** | **2 718 041 €** (−7,12 %) |
| Per capita | 3,58 € | 6,04 € | 5,61 € |
| Marge | — | 100,0 % | 82,5 % |
| Shops (légende du graphe) | — | 42 | 38 |
| Tx/min | — | 38,99 | 36,79 |
| Avg/tx · Avg/event | 7,72 € · 54 195,65 € | — | — |

Deux contrôles arithmétiques qui orientent tout le diagnostic :

- `2 926 565,31 / 54 195,65 = 54,0` **exactement** → `eventsWithRevenue = 54` côté carte, et
  `totalRevenue == fbRevenue` (aucun `merchshop` mappé sur cet espace) ;
- `5,61 / 6,04 = 0,9288` et `2 718 041 / 2 926 565 = 0,9287` → PER CAP et CA varient du **même
  facteur** entre les deux états de l'Analyse : le dénominateur spectateurs ne bouge pas, seul le
  numérateur change.

## Cause racine

### 1. Carte ↔ Analyse : deux périmètres de spectateurs, un seul libellé

| | Carte home | Analyse |
|---|---|---|
| Code | `backend/src/features/spaces/spaces.service.ts:199,221` | `useMetricsCalculator.js:58-62,77` |
| Billets | `SUM(COALESCE(Event."ticketsScanned", Event."ticketsSold", 0))` sur **tous** les `Event` de l'espace | `Σ (e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0)` sur `filteredEvents` |
| Univers | vie entière de l'espace : futurs, simulés, sans vente inclus | events de la période affichée |

Dénominateurs **inférés des valeurs affichées** (non lus en base — règle projet, pas
d'`execute_sql`) : ≈ 817 000 billets côté carte, ≈ 484 500 côté Analyse, soit ≈ 40 % des billets
hors périmètre Analyse. Plausible pour un espace à 54 events joués avec une saison en cours.

**Ce n'est pas un bug de formule** : les rendre égales détruirait le sens de la carte. Le défaut
est le libellé identique sans mention du périmètre.

Écarts secondaires du même endroit : la carte n'a pas de repli `attendees`, et utilise `||` là où
l'Analyse utilise `??` (un `ticketsScanned = 0` explicite ne se comporte pas pareil).

### 2. Analyse : `kpiRecords` changeait de source en cours de chargement

`AnalyseView.vue`, avant correctif :

```js
const kpiRecords = computed(() =>
  isPredictRecords.value
    ? filteredRecords.value
    : (itemLevelRecords.value.length ? itemLevelRecords.value : filteredRecords.value),
)
```

`chartRecords` portait le même ternaire → **KPI et graphe basculaient ensemble**. Les deux sources
ne sont pas deux étapes de chargement, ce sont **deux moteurs de calcul** :

| | Au chargement (`filteredRecords`) | Après (`itemLevelRecords`) |
|---|---|---|
| Endpoint | `GET /spaces/:id/shop-details?granular=1` (RPC `get_space_shop_details`) | `GET /spaces/:id/event-timeline` (`getEventTimelineBatch`) |
| Table lue | `SpaceRevenueMinuteAgg` | **`SpaceRevenueMinuteItemAgg`** (pré-agrégé aussi — `spaces.service.ts:1451`) |
| `revenueHt` écrit par | `SUM((unitPrice×qty − COALESCE(reduction,0)) / (1+vat/100))` — `aggregation.service.ts:476` | `SUM(unitPrice×qty / (1+vat/100))` — **remise NON déduite** — `aggregation.service.ts:571` |
| Filtre statut | **aucun** (`:485-489`) | **`AND t."status" = 'V'`** (`:584`) |
| `transactionsCount` | `COUNT(ti."id")` — lignes d'articles (`:477`) | `COUNT(DISTINCT t."id")` par produit (`:572`) |
| Clé shop | `spaceElementId` (locations mappées seulement) | `COALESCE(spaceElementId, weezeventLocationId)` (`spaces.service.ts:1442-1443`) |
| `menuItemId` | **forcé à NULL par le SQL** (migration `:144`) | résolu à la lecture (`LEFT JOIN` mapping → MenuItem) |
| Rattachement event | id figé dans l'agrégat | fenêtre de dates, `MAX_EVENT_SPAN_DAYS = 2` (`spaces.service.ts:1253`) |

La divergence `reduction` / `status='V'` est **volontaire et commentée**
(`aggregation.service.ts:543-554` : préserver les chiffres historiques de `getEventTimelineBatch`,
« ne pas corriger sans validation métier »). Ce n'est donc pas un bug à réparer côté backend, mais
un écart à connaître — et à ne pas afficher comme deux états successifs du même nombre.

Sens de chaque écart, pour ne pas se tromper de suspect :

- `status = 'V'` filtré côté item-level seulement → **tire l'item-level vers le bas** ;
- `reduction` déduite côté shop-level seulement → **tire le shop-level vers le bas**, donc joue en
  sens INVERSE. BUG-247-01 avait mesuré `SUM(reduction) = 0,00 €` sur 899 308 lignes (Auxerre) :
  contribution probablement nulle, **non revérifiée sur cet espace** ;
- agrégats périmés (TTC sous libellé `revenueHt`, lignes antérieures au 2026-07-21) → **gonflent
  le shop-level**. ⚠️ **Hypothèse à ne pas propager comme un fait** : `SpaceRevenueMinuteItemAgg`
  étant une table plus récente, ses lignes seraient toutes post-fix. C'est une **inférence sur de
  la donnée qu'on n'a pas lue** (règle projet : pas d'`execute_sql`) — le script d'audit du
  point 6 « Reste à faire » est fait pour la trancher.

### 3. Cause dominante candidate : le cap item-level de 50 events

`useAnalyseItemRecords.js:9` `MAX_EVENTS = 50` ; `:59` `const list = (events || []).slice(0, maxEvents)`.
`AnalyseView.vue:736` montait l'instance principale **sans option** → cap 50. Au-delà du rang 50,
un event n'a **aucun record item-level** : son CA sort du total, ses shops de la légende, ses
transactions du tx/min — sans un mot à l'écran.

Ce plafond était **différé volontairement** :
[BUG-298-01](298_01_analyse_cout_par_event_a_zero_source_shop_level.md) le classait *« Hors
périmètre (décision JLH) : … le cap `MAX_EVENTS = 50` de l'item-level laisse les events au-delà à
0 sans signalement »*. **Différé levé par JLH le 2026-08-21 → cap porté à 100.**

**Indices concordants, aucun décisif :**

- 4 events sur 54 ≈ 7,4 %, écart observé **7,12 %** ; **42 → 38 shops** = 4 shops ;
- l'axe du graphe « CA évènement par shop » perd un bloc **contigu, d'un seul côté** : 27
  étiquettes sur la capture au chargement, 25 après (l'axe n'en libelle qu'une sur deux → ~54 puis
  ~50 barres) ; la 2ᵉ capture démarre sur la 3ᵉ étiquette de la 1ʳᵉ, la suite reste alignée sur
  9 étiquettes avant un décalage de parité. Signature d'une **troncature en bout de liste**, pas
  d'un filtre transversal. Lecture d'étiquettes pivotées sur capture — à confirmer.

⚠️ **Réserve** : `eventsWithRevenue = 54` vient de `COUNT(DISTINCT weezeventEventId WHERE
revenueHt > 0)` sur **tout l'historique** de l'espace (`spaces.service.ts:192`), tandis que
`filteredEvents` vient de `getEvents({ limit: 200, excludeSimulated })` puis du panneau de filtres.
Deux populations différentes : `filteredEvents.length` peut valoir 60 ou 48. **Contrôle n°1
ci-dessous avant d'en faire LA cause.**

Biais aggravant, jamais documenté auparavant : ce que le numérateur perd, le dénominateur le
garde. `ticketsScanned` est sommé sur **tous** les `filteredEvents` (`useMetricsCalculator.js:58-62`)
et `operatingMinutes = Σ (e.durationMinutes || 180)` aussi (`AnalyseView.vue:1284-1287`). CA,
per-capita **et** tx/min portent donc le même biais de troncature.

### 4. MARGE 100,0 % : structurel, pas transitoire

`useMetricsCalculator.js:53` : `cost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)`.

Sur les records shop-level, `menuItemId` est **forcé à NULL par la RPC** (migration `:144`) et
n'est pas reconstruit côté client — `analyseDimensions.js:101` cherche un `weezeventProductId`
absent du payload shop-level. Donc `costMap[undefined]` → coût 0 → **marge exactement 100 %, quel
que soit l'état du chargement**. Ce n'est pas une valeur provisoire : c'est une valeur qui ne peut
jamais avoir de sens dans cet état.

Corollaire indépendant : un article mappé dont `MenuItem.totalCost IS NULL` est exclu du costMap
(migration `:266`) → « absent » et « zéro » sont indistinguables, la marge gonfle en silence
(même famille que la fiche **back 30**,
`backend/docs/bugs/30_margin_analysis_gonflee_produits_non_mappes.md` — dont l'avertissement
`summary.marginWarning` ne se déclenche même pas après un `remove()`, la ligne n'étant plus
comptée comme « non mappée »).

### 5. Ce qui n'est PAS en cause : le catalogue, les menu items, le space menu

Vérifié sur **tous** les chemins de lecture de CA :

| Chemin | Jointure produit |
|---|---|
| `getEventTimelineBatch` | `LEFT JOIN` mapping + MenuItem (`spaces.service.ts:1461-1465`) |
| `getTransactionBasketsBatch` | `LEFT JOIN` — « les lignes non résolues sortent en `null` DANS le tableau, jamais écartées » (`spaces.service.ts:1584-1588`) |
| RPC `get_space_shop_details` granular | **aucune** jointure produit |
| Écritures d'agrégats | `LEFT JOIN` sur le mapping **de PdV** seulement, jamais sur le produit |

C'était l'objet de **BUG-014 / BUG-016** (juillet 2026) : l'INNER JOIN historique qui faisait
disparaître les ventes non mappées a été retiré. Le seul `INNER JOIN "MenuItem"` restant est celui
du **costMap** (migration `:262-266`) — il restreint les clés de coût, jamais les lignes de vente.

Ce que le catalogue change réellement :

- **coût et marge** : supprimer un menu item **hard-delete son `ProductMapping`**
  (`menu-items.service.ts:1752-1767`) → la clé de coût disparaît ;
- **nom / type / catégorie** : NULL → bucket gris `UNATTACHED_ITEM_KEY` ;
- **consommation de stock** : seul vrai INNER JOIN du repo (`logistics.service.ts:1658-1659`) ;
- un **renommage** est transparent (rattachement par FK, jamais par nom) ;
- `SpaceMenuItem`/`MenuAssignment` n'apparaissent dans **aucune** requête de ventes.

Le seul vecteur de disparition de CA côté configuration est le mapping **PdV↔location**
(`LocationShopMapping`) : démapper un shop vide toute la page Analyse de l'espace
(migration `:96-108`, `spaces.service.ts:1238`).

### 6. Asymétries backend relevées au passage — hors périmètre du correctif

- `fbRevenue` exclut le merch, mais `perCapita`/`avgTransaction`/`avgEvent` divisent
  `totalRevenue` qui **l'inclut** (`spaces.service.ts:219-221`) ;
- `avgEvent` divise par les events **avec CA**, `perCapita` par les billets de **tous** les
  events — deux univers sur la même carte ;
- `transactionsCount = COUNT(ti."id")` → « AVG / TX » est un prix moyen par **ligne d'article**,
  pas un panier moyen ;
- le `LEFT JOIN SpaceElement` (`:194`) fait que `NULL IS DISTINCT FROM 'merchshop'` est vrai → les
  ventes de PdV non mappés sont comptées comme **F&B**.

## Correction — appliquée le 2026-08-21 (front uniquement)

### 1. Cap item-level 50 → 100 + signalement de la troncature résiduelle

`useAnalyseItemRecords.js` : `MAX_EVENTS = 100`, exposé en `ITEM_LEVEL_EVENT_CAP` (pas de littéral
dupliqué côté vue). 100 tient en **un seul appel batch** (le backend borne `eventIds` à 100,
`spaces.service.ts:1374`). Le cache par `eventId` et le batch des seuls manquants sont intacts :
le surcoût ne porte que sur la première ouverture d'un espace à plus de 50 events.

L'instance de comparaison **garde** son `{ maxEvents: 100 }` explicite (`AnalyseView.vue:973`) :
son cap élevé a une autre raison (fenêtres prev∪N-1 jusqu'à 24 mois), les fusionner ferait bouger
le comportement de comparaison au prochain changement du cap principal.

Nouveau `truncatedEventCount` → snackbar (une fois par montage) + **bandeau permanent** au-dessus
de la bande KPI tant que le périmètre dépasse le cap.

⚠️ **À surveiller après déploiement** : ce chemin porte
[BUG-284-01](284_01_analyse_freeze_clics_segments_quick_wins.md) (freeze) et
[BUG-285-01](285_01_analyse_memoire_2_3_go_caches_sans_eviction.md) (mémoire 2-3 Go). Doubler le
volume item-level double la pression sur ce cache. Si la mémoire décroche, la réponse est
l'éviction de BUG-285-01, **pas** un retour à 50.

### 2. Zéro valeur provisoire — repli shop-level supprimé de tous les chemins d'affichage

Décision JLH : **aucun chiffre provisoire nulle part.**

- **Nouveau module `src/utils/analyseRevenueSource.js`** : `CANONICAL_REVENUE_SOURCE`
  (= `'item-level'`), `pickRevenueRecords()` et `resolveKpiSourceState()`. Point de bascule
  **unique**, sorti du SFC de 2 400 lignes précisément parce que l'arbitrage n'est pas tranché
  (cf. `NOTE_BERTRAND_2026-08-21_CA_ANALYSE.md`) : il doit rester repérable et testable.
  `kpiRecords` / `chartRecords` d'`AnalyseView.vue` s'y réduisent, **sans repli**.
  ⚠️ La branche Predict est préservée : en mode Predict, le shop-level **est** la source
  canonique (la prédiction n'a pas de grain article et couvre les events à venir), ce n'est pas un
  repli — retirer le repli sans cette exception blanchirait tout l'écran Predict. Cas couvert par
  un test dédié.
- Nouveau `kpiSourceState` à **trois valeurs** — `'loading' | 'ready' | 'empty'`. C'est le point
  délicat du lot : `records.length === 0` est aussi un état **terminal** (batch KO, `shopIds` vide
  → réponse nulle `spaces.service.ts:1238`, dates d'event hors fenêtre — cf. « Match 10 Mai »,
  [BUG-247-01](247_01_analyse_kpi_header_ca_shop_level_puis_item_level.md)). Un booléen
  `loading || !length` figerait ces cas sur un **skeleton éternel** — pire que la valeur
  provisoire retirée. `'empty'` affiche un bandeau explicite (`anItemLevelEmpty`).
- Consommateurs gatés : bande KPI (`chartsLoading` étendu), 8 chips du header (`headerKpis`
  renvoie `[]` → `WorkspaceAppHeader` masque la rangée entière), graphe par shop, donuts, tables,
  leaderboards.
- `useShopPerformance.js` : le repli `if (!enriched) return base` (agrégats shop-level) est
  **retiré** — il publiait la même valeur provisoire sous les libellés du panneau txn/min. Le
  composable expose déjà `loading`, le panneau montre son état de chargement.
- `itemSummary` : hors Predict, plus de repli sur `summary` (store, shop-level) — afficher une
  variation calculée sur l'AUTRE moteur à côté d'une valeur item-level, c'est exactement la
  divergence valeur/variation du bug #9 du module 02.

### 3. MARGE : `—` au lieu de 100 %

`useMetricsCalculator.js` renvoie `margin: null` (et expose `costResolvable`) quand aucun record
ne porte de `menuItemId` **ou** que `menuItemCostMap` est vide. `FinancialMetricsGrid.vue` rend
`—`, y compris pour le sous-texte `Total :` qui valait sinon le CA entier.
`AnalyseAppHeader.vue:459` (code mort) était déjà protégé par `Number.isFinite`.

### 4. Périmètre du per-capita affiché

- Analyse : sous-texte de la tuile PER CAP → « Spectateurs : N · sur les N évènement(s) filtrés »
  (`anPerCapScopeFiltered`) ;
- Carte d'espace : `title` sur la tuile Per Capita → « sur tous les évènements de l'espace, y
  compris à venir » (`anPerCapScopeAllSpaceEvents`).

Au passage, les 4 libellés de `SpaceItem.vue` étaient **en dur en anglais** dans le template
(règle `CLAUDE.md` : pas de texte utilisateur en dur) → routés par `src/i18n/translations.js`.
Valeurs FR **identiques** à l'anglais : c'est un routage i18n, pas une retraduction — l'écran ne
change pas d'apparence.

### Tests

`tests/unit/analyseKpiSourceGating.spec.js`, **16 cas** : cap = 100, troncature à 101 / pas à 100,
`sourceState` `'empty'` sur périmètre vide, sur batch en ÉCHEC et sur réponse vide (jamais
`'loading'` dans ces trois cas), `'ready'` dès un record, absence de repli en mode Analyse,
**présence du shop-level en mode Predict**, bascule de `canonicalSource`, `margin === null` sur
records sans `menuItemId` et sur costMap vide, marge calculée quand grain article + coûts présents.

Suite complète : **1108 tests verts** (1092 avant le lot + 16 nouveaux). **3 suites en échec,
identiques avant et après le correctif** — vérifié par `git stash` puis relance : `apiOrMock`,
`spaceMenusInventory`, `eventDetailsEditor` échouent déjà sur `develop` (transform Vuetify ESM,
antérieur et sans rapport avec ce lot).

## Reste à faire / à vérifier

1. **Contrôle décisif — le cap.** Lire `filteredEvents.length` (Vue Devtools) sur Jean Bouin,
   « tout l'historique » — **pas** `eventsWithRevenue = 54`. Si > 50, le cap était bien la cause
   dominante et le passage à 100 doit rapprocher les deux totaux à lui seul. Si ≤ 50, il était
   inerte et l'écart vient entièrement des formules (§2) : **mettre cette fiche à jour dans ce
   cas**.
2. **42 vs 38.** Comparer les deux légendes « Afficher les N shops » avant/après bascule. Si les
   38 sont un sous-ensemble strict des 42 → cohérent avec des events tronqués ; si l'item-level
   contient des shops absents du shop-level → deux jeux de données distincts.
3. **Zéro valeur provisoire**, réseau bridé (Slow 3G) : aucune des surfaces listées ne doit
   afficher de montant avant résolution du batch. **Puis les deux cas d'échec** — (a) 500 forcé
   sur `event-timeline`, (b) périmètre à zéro ligne : bandeau explicite attendu, **jamais** un
   skeleton qui tourne indéfiniment. C'est le vrai risque du lot.
4. **Charge** après le passage à 100 : mémoire onglet et réactivité des clics de segment sur
   l'espace le plus fourni (BUG-284-01 / BUG-285-01).
5. Non-régression catalogue : renommer un menu item → le CA ne doit pas bouger d'un centime.
6. Confirmation en base si voulue : script lecture seule
   `backend/prisma/sql/2026-08-21_audit_ca_jean_bouin.sql` (CA des deux tables event par event,
   ventilation `status`, `SUM(reduction)`, date d'écriture des agrégats) — **appliqué à la main**
   (ADR-0002), pas de backtick dans le SQL.

## Questions ouvertes

Portées dans [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) et dans
[`NOTE_BERTRAND_2026-08-21_CA_ANALYSE.md`](../NOTE_BERTRAND_2026-08-21_CA_ANALYSE.md) :

1. Quelle source fait foi pour le CA — pré-agrégé shop-level, ou détail item-level ? Le code est
   écrit pour que la réponse tienne en une ligne (`CANONICAL_REVENUE_SOURCE`).
2. Le per-capita de la carte d'espace doit-il rester rapporté aux billets de toute la vie de
   l'espace, ou aux seuls events joués avec CA — et le libellé doit-il porter le périmètre ?

## Hors périmètre — consigné, pas corrigé

- Rejeu `POST /aggregation/process-events` **avec `integrationId` obligatoire** (sans lui, requête
  tenant-wide → CA doublé) : ≈ 1,26 M€ d'agrégats TTC sous libellé HT sur 8 espaces (BUG-247-01).
  Fera **baisser tous les montants de 10 à 15 %** — à annoncer avant.
- Divergence volontaire `reduction` / `status='V'` entre les deux tables d'agrégat
  (`aggregation.service.ts:543-554`) — arbitrage métier.
- Asymétries de la carte d'espace (§6 ci-dessus).
- Unification des 3 formules « CA moyen par event » (module 02 bug #9, tranché #17, code non
  aligné).

## Références

- [BUG-247-01](247_01_analyse_kpi_header_ca_shop_level_puis_item_level.md) — même bascule de
  source mesurée sur Auxerre (28,6 % d'écart), TVA des agrégats périmés, portée 8 espaces.
- [BUG-298-01](298_01_analyse_cout_par_event_a_zero_source_shop_level.md) — origine du cap 50 et
  de la chaîne « shop-level sans `menuItemId` → coût 0 ». **Différé levé ici.**
- [BUG-187](187_analyse_articles_echec_event_timeline_silencieux.md) — échec du batch
  `event-timeline` avalé ; canal de signalement réutilisé.
- [`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) — corrigé le 2026-08-21 sur deux points
  périmés : `getEventTimelineBatch` n'est plus un JOIN live, et la migration RPC vivante est
  `20260818120000_shop_details_rpc_costmap_from_mappings.sql`.

---

Rédaction : **JLH**, 2026-08-21.
