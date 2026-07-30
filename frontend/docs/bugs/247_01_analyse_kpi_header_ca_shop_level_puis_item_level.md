# BUG-247-01 — Analyse : les KPI du header affichent d'abord le CA shop-level (+28,6 %) puis basculent sur l'item-level, et un event perd son CA en silence

- **Statut** : 🔴 Non corrigé — diagnostic établi en navigateur (traces `[DIAG cfg]`, 2026-07-30)
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

## Correction — pas encore appliquée, deux volets

### Volet A (front, sans dépendance backend)

1. Ne pas publier le repli shop-level comme une valeur finale : marquer les pastilles KPI comme
   provisoires tant que l'item-level des events du périmètre n'est pas chargé (le composable expose
   déjà `loading` et `loadedEventIds` — `useAnalyseItemRecords.js:153`), plutôt que d'afficher un
   montant qui bougera de 28,6 %.
2. Signaler le cas mixte : comparer `loadedEventIds` aux events du périmètre qui ont du CA
   shop-level, et remonter les events dont l'item-level est vide (même canal que BUG-187 :
   `fetchError` → snackbar, ou un compteur affiché comme pour
   `predictEventsWithoutScenarioCount`). Un CA qui sous-compte doit le dire.

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

## Questions ouvertes

Le choix de source est tranché (item-level, décision A). Ne sont **pas** tranchés :

1. Que doit afficher la bande KPI pendant le chargement de l'item-level — un skeleton, la valeur
   shop-level marquée comme provisoire, ou rien ?
2. Un event avec CA shop-level mais item-level vide doit-il être compté à sa valeur shop-level (total
   juste, dataset hétérogène) ou exclu avec un avertissement (dataset homogène, total qui
   sous-compte) ?
3. Le rattachement des ventes à un event doit-il être le lien explicite `weezeventEventId` (règle de
   la RPC depuis le 2026-07-21) partout, y compris item-level ? Si oui, que devient une vente dont la
   date tombe dans la fenêtre d'un event mais qui appartient à un autre `WeezeventEvent` ?

→ à porter dans [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) si l'arbitrage n'est pas
immédiat. La question 3 a un impact backend et touche aussi les paniers et la timeline.

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

Rédaction : **JLH**, 2026-07-30.
