# BUG-247-01 — Analyse : les KPI du header affichent d'abord le CA shop-level (+28,6 %) puis basculent sur l'item-level, et un event perd son CA en silence

- **Statut** : 🟡 Corrigé le 2026-08-21 (front, non testé) — **le CA d'Analyse est désormais aligné
  sur celui de la page d'accueil** (décision JLH, 2ᵉ passe du 2026-08-21, qui SUPERSEDE la
  décision A). Volet B (recalcul des agrégats TVA) toujours à faire ; diagnostic établi en
  navigateur (traces `[DIAG cfg]`, 2026-07-30)
- **Sévérité** : 🔴 Critique (un CA faux de +69 689 € est affiché puis remplacé sans signal ; le CA
  final sous-compte un event sans que rien ne l'indique)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend/frontend`
- **Découvert le** : 2026-07-30 (retour utilisateur : « les widgets de la barre du haut affichent une
  première valeur qui semble prendre en compte toutes les configurations, puis se cale sur… »)
- **Fichiers** : `src/components/analyse/AnalyseView.vue:731` (`kpiRecords`),
  `src/composables/useAnalyseItemRecords.js`, `src/composables/useMetricsCalculator.js`,
  `src/components/WorkspaceAppHeader.vue` (bande KPI)

## Symptôme

Espace **Auxerre** (`cmovsjbiz01lzvwyn30wweqpf`), onglet Analyse, « All Configurations », « Tout
l'historique ». La pastille REVENUE affiche successivement trois valeurs au chargement, sans aucun
état de chargement pour distinguer le provisoire du définitif :

| Étape | `kpiRecords` | REVENUE affiché | events avec ventes |
|---|---|---|---|
| Phase 1 (espace) | 0 | `0 €` | 0 |
| Phase 2a — shop-level (`shop-details?granular=1`) | 115 | **243 428,69 €** | 16 |
| item-level (`event-timeline` batch) | 22 684 | **173 739,07 €** | **15** |

Écart entre les deux sources réelles : **69 689,62 €**, soit **28,6 %** du montant shop-level
(rapport 1,4011). L'utilisateur a lu ce passage comme « les widgets se recalent sur une
configuration » — le périmètre événementiel, lui, ne change **pas** : `eventsInActiveConfiguration`
vaut 18 = tous les events du space, du début à la fin de la séquence (`cfg: null` partout).

Second défaut, visible sur la même trace : `eventsWithSales` passe de **16 à 15**. L'event
**« Match 10 Mai »** (2026-05-31, `configurationId: cmr8axbc80002sn07gcdh5ley`, 11 000 spectateurs)
a du CA shop-level mais **aucun record item-level** → son CA disparaît du total affiché, et il sort
du dénominateur de « Moy./Évén. » (`eventsWithRevenueCount`, `useMetricsCalculator.js:65`). Aucun
message, aucune alerte : le batch `event-timeline` a réussi, il a simplement renvoyé une réponse
vide **pour cet event seul** — cas NON couvert par [BUG-187](187_analyse_articles_echec_event_timeline_silencieux.md),
qui ne traite que l'échec complet du batch.

`ATTENDEES` reste à 238 252 sur toute la séquence : les spectateurs sont sommés sur
`filteredEvents` et non sur les records (`useMetricsCalculator.js:58-63`), donc cette pastille est
la seule à ne pas dépendre de la source qui a gagné la course.

## Occurrence n°2 — Stade Jean Bouin, 2026-08-21

Espace **Stade Jean Bouin** (`cmsufah9p0c08gpkz2wsg5pzo`), « All Configurations », « All history » :

| | au chargement (shop-level) | après « Loading the catalog… » (item-level) |
|---|---|---|
| REVENUE | **2 926 565 €** | **2 718 041 €** (−7,13 %) |
| Points de vente | 42 | 38 |
| « By area » | 6 zones | 5 zones |
| « By POS type » | 3 types (Food/Beer/…) | 4 types (Beverages/Food/…) |

L'utilisateur a naturellement attribué la chute aux **Advanced filters** : la bascule se produit
à l'instant exact où l'alerte « Loading the catalog… » disparaît. Ce libellé ment — voir
§ « Pourquoi l'utilisateur voit "Loading the catalog…" ». Aucun filtre n'est appliqué ni modifié
pendant la séquence.

L'écart (7,13 %) est plus faible que les 13,06 % d'Auxerre : la TVA périmée (bug #2 module 02)
ne peut pas être présentée comme l'explication arithmétique unique sur cet espace — des termes
compensent en sens inverse (rows non mappées `spaceElementId IS NULL` **gagnées** par
l'item-level, plafond front de 50 events, events > 2 jours). Décomposition non mesurée en base.

### Pourquoi l'utilisateur voit « Loading the catalog… »

Le libellé `anCatalogLoading` (FilterPanel) ne suit pas un catalogue : le getter `filtersState`
(`analyse.js:1232-1251`) reste `'loading'` tant que `soldItemOptionsLoading` est vrai — simple
relais de `itemRecordsLoading`, c'est-à-dire du batch `event-timeline` lui-même
(`AnalyseView.vue` → `setSoldItemOptionsLoading`). Sa disparition est donc l'instant exact où
les chiffres basculent, d'où la fausse piste « les filtres changent les données ». Corrigé le
2026-08-21 : « Chargement des ventes détaillées… » / « Loading detailed sales… » (clé conservée).

Un **second** chargement se termine quasi simultanément, sans libellé : l'union « All
Configurations » (`loadAllConfigsShopContext`, `analyse.js:2195-2281`) — voir ci-dessous.

### Effets cosmétiques simultanés : zones et POS types (à ne pas confondre avec la perte de CA)

- **Zones 6 → 5** : relabellisation, pas une perte. Après le chargement différé de
  `configShopContext`, `reconcileRecord` fait gagner `element.floorName` sur `record.shopArea`
  (`analyseReconciliation.js:396-398`) → le regroupement « By area » change de clés (fusion sous
  un même étage). Même chaîne que BUG-300-01, cause différente.
- **POS types 3 → 4** : `resolveShopType` (`analyseDimensions.js:273-283`) utilise
  `menuItemType`, présent uniquement sur les records item-level (NULL en dur dans la RPC
  shop-level) → un PdV générique se ventile sous un type réel une fois l'item-level chargé.
  Candidat secondaire : bucket « Non rattachés » (rows `spaceElementId IS NULL` conservées par
  l'item-level, jetées par la RPC).

### Exclusions exclusives à l'item-level — inventaire complet (2026-08-21)

Toutes dans `resolveEventSalesScope` (`backend/src/features/spaces/spaces.service.ts:1198-1352`),
en plus de la fenêtre de dates (cause n°3) :

- **`MAX_EVENT_SPAN_DAYS = 2`** : tout event de plus de 2 jours rend `[]` — exclusion volontaire
  des events « conteneurs de saison » (commit `113a34f`, KOUAME Ulrich, 2026-08-04). Effet de
  bord : un vrai événement de 3 jours (festival, tournoi) disparaît aussi.
- **Resserrement de fenêtre par event voisin** (`windowStart >= windowEnd` → exclu) : fix
  anti-double-comptage BUG-339-02 (commit `99af245`, JLH, 2026-08-19).
- **Plafond front `MAX_EVENTS = 50`** (`useAnalyseItemRecords.js`) : troncature silencieuse des
  events au-delà de 50 — constante héritée du commit d'initialisation du repo (`8bf2429`,
  2026-07-15), aucun propriétaire, aucune décision tracée. **Levée le 2026-08-21** (décision
  JLH, la perf n'est pas un critère). ⚠️ le backend tronque lui-même à **100 ids par requête**
  (`spaces.service.ts:1374`, `.slice(0, 100)` silencieux) → le chunking client est obligatoire.
- Le cap jumeau **`useTransactionBaskets.js` (MAX_EVENTS = 50)** n'est PAS levé → le donut
  paniers couvre 50 events quand les KPI en couvrent N. Question posée à JLH/Bertrand.

## Cause racine

Deux causes distinctes qui se cumulent.

### 1. `kpiRecords` change de source en cours de route, et les deux sources ne disent pas la même chose

`AnalyseView.vue:731` :

```js
const kpiRecords = computed(() =>
  isPredictRecords.value
    ? filteredRecords.value
    : (itemLevelRecords.value.length ? itemLevelRecords.value : filteredRecords.value),
)
```

Le repli shop-level est intentionnel (« repli quand l'item-level n'a pas encore chargé », décision A
= le CA courant vient de l'item-level). Mais il est traité comme un **équivalent** du définitif alors
que l'écart mesuré est de 28,6 % : la bande KPI publie le repli comme une valeur finale, puis la
remplace.

La divergence entre les deux sources est **déjà documentée côté backend** —
[`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) § « Bugs actifs confirmés » :

- **bug #2** (reformulé le 2026-07-30) : le pipeline d'agrégation réellement exécuté
  (`AggregationService`) convertit bien TTC→HT **depuis le 2026-07-21** (commit `a71045b`,
  BUG-015) — mais **les agrégats écrits avant cette date n'ont jamais été rejoués** et contiennent
  toujours du TTC dans une colonne nommée `revenueHt` ;
- **bug #3** : `SpaceProductRevenueDailyAgg` inclut les ventes de produits non mappés,
  `SpaceRevenueMinuteAgg` les exclut (INNER JOIN) — deux tables censées décrire le même historique
  divergent en périmètre.

Le rapport observé ici (1,4011) n'est pas un pur facteur de TVA : il mélange la TVA **et** l'event
« Match 10 Mai » absent de l'item-level (cause n°3 ci-dessous). Une fois la date de cet event
corrigée, le résidu **est** un pur facteur TVA — mesuré event par event, voir
§ « La TVA explique tout l'écart résiduel ».

### 2. Un event sans record item-level disparaît, sans repli et sans signal

`useAnalyseItemRecords.js:139-146` recompose la sortie depuis son cache par eventId. Un event dont
le batch renvoie `[]` est mis en cache à `[]` (anti-boucle, correct) et n'apporte donc aucun record.
Comme `kpiRecords` bascule **globalement** sur l'item-level dès qu'il est non vide, ce cas mixte —
15 events couverts, 1 event à `[]` — produit un total qui n'est ni le shop-level ni un item-level
complet, sans que rien ne le distingue d'un event réellement sans vente.

### 3. Pourquoi un event PEUT avoir du CA shop-level et zéro record item-level

Ce n'est pas une incohérence de données : les deux lectures n'utilisent pas la même règle pour
décider quelles ventes appartiennent à un event.

| | Rattachement des ventes à l'event |
|---|---|
| **shop-level** (`get_space_shop_details`, `granular=1`) | L'id d'event est **déjà figé dans la table d'agrégat** : `SpaceRevenueMinuteAgg."weezeventEventId"`, écrit au moment du traitement. Aucune date au moment de la lecture. |
| **item-level** (`getEventTimelineBatch`) | **Fenêtre de dates recalculée à chaque lecture** : `t."transactionDate" >= Event."eventDate" AND < (Event."eventEndDate" ?? "eventDate") + 1 jour` (`backend/src/features/spaces/spaces.service.ts:1178-1191` et `:1267-1269`). L'id d'event de l'agrégat n'est jamais consulté. |

Vérifié en base le 2026-07-30 (espace Auxerre `cmovsjbiz01lzvwyn30wweqpf`) : les lignes d'agrégat de
« Match 10 Mai » sont horodatées au **2026-05-10** et portent le bon id d'event, alors que
`Event."eventDate"` valait **2026-05-31**. La fenêtre item-level était donc
`[31 mai, 1er juin)` → zéro ligne, tandis que le shop-level continuait d'afficher ses
**47 579,50 €**. Une date d'event fausse casse une lecture sur deux, en silence.

### Précision importante sur la colonne `SpaceRevenueMinuteAgg."weezeventEventId"`

Malgré son nom, elle contient un **`Event.id` DataFriday**, pas un `WeezeventEvent.id`. Mesuré sur
cet espace : 26 819 lignes, 16 ids d'event distincts, **16/16 se résolvent en `Event.id`** et
**0/16 en `WeezeventEvent.id`**. Conséquence sur la RPC (`20260721210000_shop_details_rpc_event_link_by_id.sql:170-182`),
dont la chaîne de jointure est `we.id = srma."weezeventEventId"` puis `ev_df."weezeventEventId" = we.id` :

- `we` et `ev_df` sont NULL sur **toutes** les lignes de cet espace ;
- donc `datafridayEventId` est NULL, `eventName` retombe sur l'id brut et **`eventDate` est NULL**
  sur chaque ligne granulaire ;
- mais `'eventId', COALESCE(g."datafridayEventId", g."weezeventEventId")` recrache l'id brut — qui se
  trouve être exactement l'`Event.id` que le front attend dans `filteredShopGranularData`.

**Le shop-level fonctionne donc par coïncidence** : la colonne est mal nommée/mal peuplée (même
famille que le bug #1 du module 02, où le pipeline vivant écrit un `menuItemId` dans
`spaceElementId`), et le repli `COALESCE` de la RPC compense exactement cette erreur. Le correctif
« jointure par liaison explicite » du 2026-07-21 est, sur ce jeu de données, **inopérant** : il ne
résout jamais rien. À savoir avant de « corriger » quoi que ce soit dans cette chaîne — réparer la
colonne sans réparer la RPC, ou l'inverse, casserait le CA shop-level qui s'affiche aujourd'hui.

Corollaire général : toute date d'event mal saisie provoque, sans erreur ni avertissement, la
disparition complète du CA de cet event dans toutes les vues item-level (KPI header, donuts par
article, table articles) alors qu'il reste visible dans les vues shop-level (« Event Revenue by
shop », POS Performance). C'est la forme la plus discrète du problème.

### Vérification après correction de la date (2026-07-30)

`Event."eventDate"` et `"eventEndDate"` de « Match 10 Mai » passés à **2026-05-10**. Contrôles en
base sur la nouvelle fenêtre `[2026-05-10, 2026-05-11)`, intégration de l'espace
(`cmpzfm46d00017sis0cv5qzou`, via `WeezeventLocationSpaceMapping`) :

- 3 424 transactions, 6 059 lignes d'articles ;
- **41 618,53 € HT** avec la formule exacte de l'item-level (`unitPrice × quantity / (1 + vat/100)`).

Attendu à l'écran après rechargement : REVENUE ≈ **215 310 €** (173 739,07 + 41 618,53, à ~47 €
près liés aux fenêtres des events « [Simulé] ») et `eventsWithSales` de 15 à 16. L'écart résiduel
avec le shop-level (243 428,69 €) est dû au bug #2 du module 02 — décomposé au centime ci-dessous.

### La TVA explique tout l'écart résiduel — mesuré le 2026-07-30

Contrôle en base sur les 16 events d'Auxerre : `SUM(SpaceRevenueMinuteAgg."revenueHt")` **stocké**
vs recalcul sur `WeezeventTransactionItem`, même fenêtre, même intégration
(`cmpzfm46d00017sis0cv5qzou`). Script rejouable :
`backend/prisma/sql/2026-07-30_audit_agg_perimes.sql`, requête 2.

| Event | Agrégat calculé le | Stocké | TTC recalculé | HT recalculé | stocké / HT |
|---|---|---|---|---|---|
| AJA 13 Sept 2025 | 2026-07-07 | 53 089,00 | **53 089,00** | 47 085,69 | 1,1275 |
| Match 10 Mai | 2026-07-07 | 47 579,50 | **47 579,50** | 41 618,53 | 1,1432 |
| AJA - 17 Aout 2025 | 2026-07-07 | 37 517,50 | **37 517,50** | 33 252,30 | 1,1283 |
| AJA vs Angers | 2026-07-07 | 32 180,00 | **32 180,00** | 28 036,33 | 1,1478 |
| AJA - 21 Sept | 2026-07-07 | 30 304,00 | **30 304,00** | 26 671,68 | 1,1362 |
| AJA 9 Aout 2025 | 2026-07-07 | 18 800,50 | **18 800,50** | 16 898,13 | 1,1126 |
| AJ Auxerre vs Levante | 2026-07-07 | 18 041,00 | **18 041,00** | 16 009,02 | 1,1269 |
| AJ Auxerre vs Ipswitch | **2026-07-27** | 3 903,41 | 4 394,50 | **3 903,33** | **1,0000** |
| AJA 7 Sept 2025 | 2026-07-07 | 1 886,50 | **1 886,50** | 1 714,94 | 1,1000 |
| [Simulé] BUVETTE | **2026-07-30** | 11,85 | 12,50 | **11,85** | **1,0000** |
| [Simulé] PARVIS | **2026-07-29** | 8,18 | 9,00 | **8,18** | **1,0000** |

La coupure est nette et tombe exactement sur le fix : **agrégat écrit avant le 2026-07-21 → stocké
= TTC au centime près ; écrit après → stocké = HT au centime près.** Total stocké = **243 428,69 €**
(le chiffre exact de la pastille), total HT = **215 310,63 €**. Écart = **28 118,06 €, soit
13,06 %** — intégralement de la TVA.

Décomposition des taux sur la journée du 10/05 (6 059 lignes) :

| Taux | Lignes | TTC | % du CA | TVA |
|---|---|---|---|---|
| 10 % | 3 629 | 24 375,50 € | 51,2 % | 2 215,95 € |
| 20 % | 1 988 | 22 136,00 € | 46,5 % | 3 689,33 € |
| 5,5 % | 442 | 1 068,00 € | 2,2 % | 55,68 € |

Moyenne pondérée **14,32 %** → ratio 1,1432. Le ratio varie de 1,10 à 1,15 d'un match à l'autre
avec le mix bière / soft / food : signature d'un problème de TVA, pas de périmètre.

**Deux hypothèses concurrentes mesurées et écartées**, à ne pas réexplorer :

- **`reduction`** — l'agrégat la soustrait (`aggregation.service.ts:297`), l'item-level l'ignore
  (`spaces.service.ts:1262-1265`) : `SUM(reduction) = 0,00 €` sur **899 308 lignes** de
  `WeezeventTransactionItem`. Aucun impact, ni aujourd'hui ni après recalcul.
- **Filtre `status = 'V'`** — présent côté item-level (`spaces.service.ts:1272`), absent de
  l'agrégat : sur le 10/05, TTC total = TTC filtré = 47 579,50 €. Aucun écart.

**Portée : 8 espaces, pas seulement Auxerre** (requête 1 du script d'audit) —
Stade Français Paris 522 501,63 € (4 events), Auxerre 239 400,00 € (11), Stade Abbé Deschamps
164 033,00 € (7), Habita 150 777,22 € (5), St Etienne 101 620,95 € (1), Aix Arena 50 772,00 € (4),
Paris Football Club 34 438,50 € (1). Soit ≈ **1,26 M€ affichés en TTC sous un libellé HT**, sur les
cartes de la home page, les KPI Analyse shop-level, `Event.revenue` et tous les per-capita qui en
dérivent. **Ce n'est pas un bug de code : c'est de la donnée périmée.**

### Le même lot de lignes porte un second défaut périmé (bug #1 du module 02)

Découvert en vérifiant le statut de #1 : le code est corrigé (commentaire BUG-014,
`aggregation.service.ts:267-277`), mais exactement comme pour la TVA, **les lignes antérieures au
fix n'ont jamais été rejouées** et portent toujours le défaut. Mesuré sur Auxerre :

| Lignes | `spaceElementId` distincts | = un `SpaceElement.id` | = un `MenuItem.id` | `locationId` = `merchantId` |
|---|---|---|---|---|
| **avant** le 2026-07-21 | 249 | **0** | **249** | **249 / 249** |
| **après** | 17 | **17** | 0 | 0 |

Sur ces events, le « Par shop » ne groupe donc pas par point de vente mais **par article vendu** —
249 « shops » fantômes au lieu de 17 PdV réels — et la colonne merchant ne contient jamais un vrai
id de marchand. Requête 5 du script d'audit.

**Conséquence pratique : un seul recalcul répare #1 et #2 en même temps.** Ne pas les traiter comme
deux chantiers.

Leçon transverse à retenir : **corriger une formule d'agrégation ne corrige pas l'historique déjà
agrégé.** Les deux fiches BUG-014 et BUG-015 ont été classées « corrigé » sur la foi du code, alors
que l'écran continuait — et continue — d'afficher l'ancienne erreur.

Effet de bord relevé au passage, **hors périmètre** : deux `integrationId`
(`cmpzfm46d00017sis0cv5qzou` et `cms49iint03xin18629wbtocv`) portent les **mêmes** 3 424
transactions et les mêmes 6 059 lignes pour cette journée. Une seule est rattachée à l'espace, donc
aucun double comptage aujourd'hui — mais un rattachement des deux le provoquerait.

## Révision du 2026-08-21 (2ᵉ passe) — le CA d'Analyse s'aligne sur la page d'accueil

**Demande JLH** : « il faut que le CA soit le même que celui de la page d'accueil ». Sur
`/spaces`, la carte Stade Jean Bouin affiche **2 926 565,31 €** ; Analyse affichait ce montant au
chargement puis basculait à 2 718 041 €. **Le chiffre de l'accueil fait foi.**

### Ce que compare exactement l'utilisateur : deux requêtes sur la même table

| | Page d'accueil | Analyse (shop-level) |
|---|---|---|
| Code | `getRevenueSummaries`, `backend/src/features/spaces/spaces.service.ts:166-224` | RPC `get_space_shop_details`, migration `20260818120000_...sql:131-205` |
| Affichage | `space.fbRevenue` brut, `frontend/src/components/spaces/widgets/SpaceItem.vue:61` | getter `filteredShopGranularData` → `filteredRecords` |
| Table | `SpaceRevenueMinuteAgg."revenueHt"` | **la même** |
| Rattachement PdV | `se.id = srma."spaceElementId"` | via `WeezeventLocationShopMapping` |
| Whitelist locations | **aucune** | `weezeventLocationId = ANY(v_location_ids)` → lignes des locations **non mappées jetées** |
| Merch | **exclu** (`se.type = 'merchshop'`) | non exclu |
| Events simulés / futurs | inclus | exclus (`analysableEvents`) |

**L'égalité n'est donc PAS structurelle** : elle tient sur Jean Bouin parce que ces trois axes y
sont nuls. Sur un espace à locations non mappées Analyse lira **plus bas** ; sur un espace avec du
merch, **plus haut**. La rendre garantie demande un choix backend (RPC sans whitelist + exclusion
merch, ou accueil adoptant la RPC) — voir la question portée à Bertrand.

### Pourquoi aucun rattrapage ne suffisait

L'item-level ne lit pas la même table d'agrégat (`SpaceRevenueMinuteItemAgg`) et sa formule
diverge **par conception** (`backend/prisma/schema.prisma:2940-2977` : la remise n'y est pas
soustraite, contrairement à `SpaceRevenueMinuteAgg`). Le montant diffère **event par event** :
ajouter les events manquants — ce que faisait le repli de la 1ʳᵉ passe — ne ramène jamais au
montant de l'accueil. Seul un CA sourcé shop-level de bout en bout y arrive.

### Implémentation (2ᵉ passe)

- `chartRecords` / `kpiRecords` = `filteredRecords` (shop-level), Predict inchangé.
  `articleRecords` reste item-level pur.
- **Coût et marge** : les lignes shop-level portent `menuItemId: NULL` / `itemCost: NULL`
  (migration `:143-152`) et le coût est un produit `costMap[menuItemId] × quantity`
  (`useMetricsCalculator.js:53`) → coût 0, **marge 100 %** si on ne fait rien (visible sur la
  capture du premier chargement : COST 0,00 € / MARGIN 100,0 %). Le coût est donc pris sur
  l'item-level (`itemLevelCost`), et **la marge est recalculée sur les valeurs AFFICHÉES**
  `(revenue − cost) / revenue` : le sous-titre de la carte montre « Total : revenue − cost »,
  l'arithmétique doit tomber juste à l'écran. Conséquence assumée : marge légèrement optimiste,
  sa base de revenus étant la plus large des deux.
- Attente ciblée : pastille COST en skeleton (`kpi.loading` par pastille) et carte Marge à « — »
  tant que l'item-level charge ; le CA, lui, n'attend plus rien (définitif dès le shop-level).
- `EventRevenueByShopChart` reçoit `:item-records="articleRecords"` — son mode « Menu Types »
  indexe sur `menuItemType` (`:251`), absent du shop-level : sans cette source dédiée il se
  viderait.
- Supprimés (sans objet) : `itemCoveredEventIds`, `articleFilterActive`, `shopFallbackEventIds`,
  `shopFallbackRecords`, `shopFallbackEventCount`, l'alerte et les 2 clés `anShopFallbackCounted`.

### Décisions de la 1ʳᵉ passe SUPERSEDED (conservées pour mémoire)

- **Décision A** (« le CA courant vient de l'item-level ») → remplacée : le CA vient du
  shop-level, aligné sur l'accueil.
- **Q1 skeleton sur tous les KPI** → réduit au coût et à la marge : masquer un CA déjà définitif
  ferait attendre l'utilisateur pour rien.
- **Q2 « events sans item-level comptés à leur valeur shop-level » + garde filtre article** →
  sans objet : le shop-level les contient tous par construction.

### Limites connues, non traitées

- Les variations Précédent/N-1 restent calculées sur l'item-level (`itemSummary`,
  `AnalyseView.vue`) alors que les totaux sont shop-level : chaque comparaison est cohérente avec
  elle-même (même base des deux côtés), mais la base diffère de celle du montant affiché. Tracé
  en question, non modifié — la comparaison est OFF par défaut.
- Les vues article totalisent **moins** que les KPI (grain et table différents). Attendu.
- Le CA affiché reste celui de l'accueil, donc **gonflé de 10-15 % par les agrégats TTC
  antérieurs au 2026-07-21** (bug #2 du module 02). S'aligner dessus propage ce biais à Analyse :
  c'est assumé, seul le Volet B le corrige.

## Correction — Volet A appliqué le 2026-08-21 (1ʳᵉ passe, partiellement superseded ci-dessus), Volet B restant

### Volet A (front) — APPLIQUÉ le 2026-08-21, selon les décisions JLH du même jour

| Décision JLH | Implémentation |
|---|---|
| 1. **Skeleton** pendant le chargement item-level | `itemLevelPending` (AnalyseView) : `itemRecordsLoading` OU couverture incomplète de `filteredEvents` par `mainLoadedEventIds`. Cartes KPI : skeletons existants étendus (`chartsLoading \|\| itemLevelPending`). Bande header : prop `kpisLoading` sur `WorkspaceAppHeader` → `v-skeleton-loader` à largeur fixe à la place des montants, labels conservés. Predict : jamais de skeleton. |
| 2. Event avec CA shop-level mais item-level vide : **compté** | Dataset hybride : `analyseRecords = [...itemLevelRecords, ...shopFallbackRecords]` où `shopFallbackRecords` = lignes shop-level des events à `revenue > 0` non couverts par `globalItemRecords` (BRUT, pas filtré — sinon un event vidé par un filtre article rentrerait par la porte de derrière). Signalé par une `v-alert` compacte au-dessus des KPI (`anShopFallbackCounted`, « {n} événement(s) compté(s) depuis les totaux pré-agrégés »). **Garde** : si une dimension article est active, le repli est exclu du total (ses lignes n'ont pas le grain article — décision JLH « exclure du total »). Les vues article consomment `itemLevelRecords` pur (pas de lignes repli « Unattached » artificielles). |
| 3. **Plafond 50 levé** | `useAnalyseItemRecords` : `MAX_EVENTS` supprimé → `CHUNK_SIZE = 50`, tranches **séquentielles** avec patch du cache après chacune (rendu progressif) ; erreur par tranche → ids cachés `[]`, alerte une fois, tranches suivantes continuées (les events KO tombent dans le comptage de repli au lieu de disparaître) ; `refresh()` (Live) chunké pareil ; option `maxEvents` retirée (l'instance comparaison passait 100 — au-delà du slice backend de 100, déjà limite). |
| 4. **Libellé corrigé** | `anCatalogLoading` : « Chargement des ventes détaillées… » / « Loading detailed sales… » (clé conservée, seul consommateur FilterPanel). |

Limites connues du Volet A, assumées et documentées :

- Les events de repli sont comptés **tels que stockés** : agrégat écrit avant le 2026-07-21 =
  TTC (bug #2) → part du total gonflée de 10-15 % jusqu'au recalcul (Volet B).
- Marge légèrement surestimée pour les events de repli (`menuItemId` null → coût 0) — identique
  au comportement shop-level historique.
- Le panneau filtres reste « loading » jusqu'à la dernière tranche — message désormais honnête,
  et les options article se remplissent au fil des tranches ; `pruneFiltersToOptions` (gardé par
  `filtersState === 'ready'`) s'exécute sur des options complètes, plus sûr qu'avant.
- Cap `useTransactionBaskets` (50) non levé → périmètre du donut paniers ≠ périmètre KPI sur les
  espaces à > 50 events.
- Total hybride : pour les events de repli, aucun détail article — la somme du tableau articles
  ne retombe pas sur le total KPI. C'est le prix du choix « compté » (total juste, dataset
  hétérogène, signalé).

### Volet B (backend — la vraie racine)

1. **Aligner la règle de rattachement** (cause n°3) : faire lire à `getEventTimelineBatch` l'id
   d'event déjà présent dans `SpaceRevenueMinuteAgg` (ou une liaison event↔transactions explicite),
   au lieu de recalculer une fenêtre de dates à chaque lecture — ou au minimum signaler le cas
   « l'agrégat a du CA, la fenêtre ne renvoie rien ».
   `backend/src/features/spaces/spaces.service.ts:1141-1221` (`resolveEventSalesScope`) est le point
   unique : `getTransactionBasketsBatch` consomme le même scope et porte donc le même défaut, tout
   comme la timeline intra-event.
   ⚠️ Prérequis : la colonne `SpaceRevenueMinuteAgg."weezeventEventId"` contient un `Event.id`
   DataFriday malgré son nom, et la RPC ne fonctionne aujourd'hui QUE grâce à ce décalage (cf.
   § Précision ci-dessus). Renommer/réparer l'un sans l'autre casse le CA shop-level affiché.
2. **Rejouer l'agrégation** (bug #2 du module 02, reformulé) : la formule est correcte depuis le
   2026-07-21, seules les **données** sont périmées. Aucun changement de code —
   `POST /aggregation/process-events` (`aggregation.controller.ts:83`), job idempotent
   (delete-then-insert par event, `aggregation.service.ts:255-257`), sur les 8 espaces listés
   ci-dessus. Effet de bord souhaitable : le rollup BUG-033 (`aggregation.service.ts:363-376`)
   remplira `Event.revenue` / `calculatedAt`, `null` aujourd'hui sur 9 events d'Auxerre sur 16.
   ⚠️ **Toujours passer `integrationId` explicitement.** Sans lui `integrationClause` est vide
   (`aggregation.service.ts:260-262`) et la requête devient tenant-wide — avec les deux
   `integrationId` jumeaux signalés ci-dessus, le CA serait **doublé**. C'est le seul risque
   destructeur de l'opération. Prévenir aussi que tous les montants affichés vont **baisser de 10
   à 15 %** : c'est la correction, pas une perte.
   Reste **#3** (périmètres divergents entre les deux tables d'agrégat), non couvert par le
   recalcul.

Tant que 1 et 2 tiennent, **toute** vue shop-level et toute vue item-level du même espace
afficheront des CA différents — ce n'est pas propre à la bande KPI.

## Questions ouvertes — arbitrées le 2026-08-21 (JLH), sauf la n°3

1. Affichage pendant le chargement item-level : **skeleton** (décision JLH 2026-08-21, appliquée).
2. Event avec CA shop-level mais item-level vide : **compté** à sa valeur shop-level, avec
   signalement visible ; **exclu du total si un filtre article est actif** (impossible de savoir
   quelle part répond au filtre). Décision JLH 2026-08-21, appliquée.
3. Le rattachement des ventes à un event doit-il être le lien explicite `weezeventEventId` (règle de
   la RPC depuis le 2026-07-21) partout, y compris item-level ? Si oui, que devient une vente dont la
   date tombe dans la fenêtre d'un event mais qui appartient à un autre `WeezeventEvent` ?
   **Non tranchée** → portée dans [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md)
   (impact backend : paniers et timeline aussi).
4. (Nouvelle, 2026-08-21) Le cap 50 de `useTransactionBaskets` doit-il être levé comme celui de
   `useAnalyseItemRecords` ? → portée dans `QUESTIONS_A_BERTRAND.md`.

## Ce que la trace a écarté

Quatre hypothèses testées et **invalidées** en navigateur le 2026-07-30, à ne pas réexplorer :

- **pré-sélection de configuration** ([BUG-225](225_analyse_predict_config_par_defaut_et_dedup_contexte.md),
  retirée le jour même) : les traces montrent `preserved: null` et `cfg: null` sur toute la
  séquence — le recalage observé n'a jamais été un scope de configuration ;
- **échec du fetch `/configurations`** : `configurationsFetchFailed: false` (le durcissement de
  `resolveConfigSelectionAfterLoad` reste, à titre défensif — une liste vide ne prouve pas qu'un id
  est périmé) ;
- **périmètre config dégénéré** : `linkedEvents: 12` sur `totalEvents: 18` et `eventIds: 0` — le
  rattachement passe uniquement par `event.configurationId`, 6 events analysables n'ont aucune
  config. All ≠ config, le filtre a bien un effet théorique ;
- **filtre Configuration inerte** : reproduit et **infirmé** le 2026-07-30. Le clic est légitime et
  atteint le store (`onConfigurationChange` → `setFilterImmediate`, pile complète capturée), aucun
  re-dispatch ne l'écrase, et le périmètre change bien :

  | | All Configurations | Config principale |
  |---|---|---|
  | `filteredEvents` | 16 | **10** |
  | `kpiRecords` (item-level) | 22 684 | **22 537** |
  | records shop-level | 115 | **68** |

  Les 6 events retirés (4 « [Simulé] » + 2 « Transactions Adhoc », tous à `configurationId: null`)
  pèsent **147 records item-level sur 22 684 — 0,65 %**, alors qu'ils représentent **41 %** des
  records shop-level (47 sur 115). Le filtre fonctionne : il n'a quasiment aucune matière à retirer
  du dataset qui alimente réellement les KPI. D'où la perception « rien ne change ».

  C'est la **même cause racine** que ci-dessus, sous un autre angle : ces events ont des agrégats
  shop-level sans transactions item-level correspondantes. Le poids d'un event diffère d'un facteur
  ~60 selon la vue qui le regarde.

## En clair (sans jargon)

La page Analyse a deux « calculettes ». La rapide lit des totaux pré-calculés par buvette —
certains gardent la TVA par erreur (données jamais recalculées depuis le fix du 21/07). C'est
elle qui alimente aussi les cartes de la page d'accueil. La lente recompte article par article,
mais avec des règles plus strictes pour rattacher une vente à un match : la date du match (fausse
date = CA perdu en silence), maximum 2 jours (les « saisons » sont ignorées, exprès), et —
jusqu'au 2026-08-21 — seulement les 50 premiers événements.

Au chargement, la page affichait le chiffre de la rapide, puis le remplaçait sans prévenir par
celui de la lente, pendant un message qui prétendait charger « le catalogue ».

**Décision finale du 2026-08-21 : le chiffre de la page d'accueil fait foi.** Analyse garde donc
la calculette rapide pour tout le chiffre d'affaires, du début à la fin — plus aucune bascule.
La calculette lente ne sert plus qu'à ce qu'elle seule sait faire : le détail par article, et le
**coût** (sans lui, la marge afficherait 100 %). Le plafond de 50 événements est supprimé et le
message dit enfin la vérité.

À savoir : le chiffre affiché est le même partout, mais il reste **trop haut de 10 à 15 %** tant
que les vieux totaux n'ont pas été recalculés (TVA comptée en trop, Volet B). Quand ce sera fait,
tous les montants baisseront d'autant — c'est la correction, pas une panne.

## Journal — session du 2026-08-21

### Contexte

Occurrence n°2 signalée par l'utilisateur sur Stade Jean Bouin (« des events disparaissent quand
Advanced filters finit de charger ») — diagnostic : même cause racine, PAS un filtrage. Nouveaux
mécanismes documentés : libellé `anCatalogLoading` trompeur, plafond `MAX_EVENTS = 50` (hérité,
sans propriétaire), `MAX_EVENT_SPAN_DAYS = 2`, troncature backend silencieuse à 100 ids/requête,
relabellisation zones (configShopContext) et POS types (menuItemType) — cosmétiques.

### Livré — 2ᵉ passe (alignement sur la page d'accueil)

- `src/components/analyse/AnalyseView.vue` — `chartRecords`/`kpiRecords` = shop-level ;
  `itemLevelCost` + `metrics` composé (coût item-level, marge recalculée sur les valeurs
  affichées) ; `itemLevelPending` recentré sur coût/marge ; machinerie de repli supprimée ;
  `:item-records` passé au graphique.
- `src/components/WorkspaceAppHeader.vue` — prop globale `kpisLoading` remplacée par un flag
  `loading` **par pastille**.
- `src/components/analyse/panels/FinancialMetricsGrid.vue` — prop `marginLoading` (carte Marge à
  « — » au lieu de 100 %).
- `src/components/analyse/charts/EventRevenueByShopChart.vue` — prop `itemRecords` + computed
  `sourceRecords` (mode « Menu Types » sur le grain article).
- `src/i18n/translations.js` — clés `anShopFallbackCounted` retirées (EN/FR).
- Cette fiche (§ Révision 2ᵉ passe) + `00_INDEX.md` + `QUESTIONS_A_BERTRAND.md`.

Tests : `analyseFiltersState`, `analyseDataset`, `analyseAggregations` — 51 verts, aucun spec
modifié.

### Livré — 1ʳᵉ passe (Volet A, code)

- `src/composables/useAnalyseItemRecords.js` — plafond levé, chunking séquentiel par 50 avec
  rendu progressif, erreurs par tranche non bloquantes, `refresh()` (Live) chunké.
- `src/components/analyse/AnalyseView.vue` — `itemLevelPending` (skeleton KPI), dataset hybride
  `analyseRecords` (item-level + repli shop-level des events non couverts, garde filtre article),
  alerte `anShopFallbackCounted`, `articleRecords` → item-level pur hors predict, instance
  comparaison sans cap.
- `src/components/WorkspaceAppHeader.vue` — prop `kpisLoading` + skeleton à largeur fixe.
- `src/i18n/translations.js` — `anCatalogLoading` corrigé (EN/FR), `anShopFallbackCounted` (EN/FR).
- Cette fiche + `00_INDEX.md` + `QUESTIONS_A_BERTRAND.md` (Q3 rattachement, cap paniers).

Non testé (dev server / tests lancés par l'utilisateur). Vérifs attendues : skeletons au
chargement puis une seule publication de valeur ; plusieurs requêtes `event-timeline` de ≤ 50
ids ; alerte « N événement(s) compté(s)… » si events de repli ; Predict inchangé ;
`tests/unit/analyseFiltersState.spec.js` vert sans modification.

## Journal — session du 2026-07-30

### Livré

- **`backend/prisma/sql/2026-07-30_audit_agg_perimes.sql`** (nouveau) — 5 requêtes de lecture
  seule : espaces concernés · détail par event avec ratio stocké/HT · décomposition des taux ·
  contrôle anti-double-comptage · résolution de `spaceElementId` (bug #1). Requête 2 testée sur
  `datafriday-dev`, elle produit bien le tableau de preuve ci-dessus.
- **[`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md)** — bugs **#1 et #2 reformulés** + note
  datée. Le schéma d'architecture (`:41`) et le tableau du Piège n°1 (`:97`) décrivaient encore le
  pipeline vivant comme « formule SANS conversion TVA » : faux depuis `a71045b`, corrigé.
- **Cette fiche** — section de preuve (11 events, décomposition des taux, portée 8 espaces, défaut
  BUG-014 mesuré), caveat « le ratio n'est pas un pur facteur TVA » **levé**, Volet B point 2
  réécrit en « rejouer l'agrégation, zéro ligne de code » avec l'avertissement `integrationId`.
- **[`bugs/00_INDEX.md`](00_INDEX.md)** — entrée 247-01 à jour.

### Non fait, délibérément : le recalcul

C'est une mutation de données sur 8 espaces, elle appartient à l'équipe backend. Commande, espace
par espace, `integrationId` **obligatoire** :

```bash
curl -X POST "$API/aggregation/process-events" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"spaceId":"cmovsjbiz01lzvwyn30wweqpf","integrationId":"cmpzfm46d00017sis0cv5qzou"}'
```

Auxerre en premier, c'est le jeu de contrôle déjà mesuré : attendu **243 428,69 € → ~215 310 €**,
et les vues shop-level et item-level convergent.

### À communiquer aux utilisateurs AVANT le recalcul

**Tous les montants affichés vont baisser de 10 à 15 %** — home page, KPI Analyse, per-capita,
CA moyen par événement. Ce n'est pas une perte de données ni une régression : c'est le montant
hors taxes qui remplace enfin un montant TTC mal étiqueté. Sans ce message, la correction sera
lue comme une panne.

### Anomalie de session, à vérifier

Un commit **`c363a4b`** « Add HR/audit SQL; dark-mode & analyse fixes » est apparu le 2026-07-30 à
10:00:40 sous l'identité *Jean Luc Houedanou*, balayant **27 fichiers** — tout le working tree, y
compris un `.DS_Store` et le script d'audit ci-dessus. Il n'a été demandé par personne pendant la
session. Si ce n'est pas un geste manuel, une automatisation commite sans intervention : à
identifier avant qu'elle n'embarque du travail non relu dans une PR.

## Références

- [`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) — § Piège n°1 (deux moteurs d'agrégation),
  § Bugs actifs #2 (reformulé le 2026-07-30) et #3, § `GET /spaces/:id/event-timeline`.
- `backend/prisma/sql/2026-07-30_audit_agg_perimes.sql` — script de lecture seule qui rejoue les
  mesures ci-dessus : espaces concernés, détail par event avec ratio stocké/HT, décomposition des
  taux, et contrôle anti-double-comptage à passer **avant** tout recalcul.
- [BUG-187](187_analyse_articles_echec_event_timeline_silencieux.md) — échec **complet** du batch
  `event-timeline` avalé. Cette fiche traite le cas **partiel** (batch OK, un event vide).
- [BUG-225](225_analyse_predict_config_par_defaut_et_dedup_contexte.md) — pré-sélection de
  configuration, annulée le 2026-07-30.

---

Rédaction : **JLH**, 2026-07-30. Mise à jour (occurrence n°2, décisions, Volet A) : **JLH**,
2026-08-21.
