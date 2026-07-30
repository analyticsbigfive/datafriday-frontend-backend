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

- **bug #2** : le pipeline d'agrégation réellement exécuté (`AggregationService`) ne convertit
  jamais TTC→HT (pas de division par `1+vat/100`), contrairement au calcul live de
  `getEventTimelineBatch` ;
- **bug #3** : `SpaceProductRevenueDailyAgg` inclut les ventes de produits non mappés,
  `SpaceRevenueMinuteAgg` les exclut (INNER JOIN) — deux tables censées décrire le même historique
  divergent en périmètre.

Le rapport observé (1,4011) n'est pas un pur facteur de TVA (1,20 ou 1,055) : il combine
vraisemblablement les deux causes. **À confirmer event par event avant tout correctif backend** —
cette fiche documente ce qui est mesuré côté front, pas l'arithmétique exacte côté agrégation.

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

Attendu à l'écran après rechargement : REVENUE ≈ **215 357,60 €** (173 739,07 + 41 618,53) et
`eventsWithSales` de 15 à 16. L'écart résiduel avec le shop-level (243 428,69 €) reste dû à la
formule : pour ce seul event, agrégat **47 579,50 €** sans conversion TVA contre **41 618,53 €** HT,
soit ×1,143 — bug #2 du module 02, cohérent avec des taux de TVA mixtes.

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
2. Bugs **#2** (TTC→HT jamais converti par le pipeline vivant) et **#3** (périmètres divergents) du
   module 02 : ils expliquent le reste de l'écart. À traiter dans le repo backend d'agrégation.

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

## Références

- [`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) — § Piège n°1 (deux moteurs d'agrégation),
  § Bugs actifs #2 et #3, § `GET /spaces/:id/event-timeline`.
- [BUG-187](187_analyse_articles_echec_event_timeline_silencieux.md) — échec **complet** du batch
  `event-timeline` avalé. Cette fiche traite le cas **partiel** (batch OK, un event vide).
- [BUG-225](225_analyse_predict_config_par_defaut_et_dedup_contexte.md) — pré-sélection de
  configuration, annulée le 2026-07-30.

---

Rédaction : **JLH**, 2026-07-30.
