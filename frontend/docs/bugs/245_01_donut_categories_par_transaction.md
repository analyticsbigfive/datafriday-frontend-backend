# BUG-245-01 — Feature : donut « Répartition des catégories de produits par transaction »

> Fiche de **feature**, pas de défaut : ouverte pour tracer les décisions de données et les deux
> questions produit qui bloquent le merge. Convention maison — un chantier qui repose sur des
> hypothèses métier non tranchées se documente ici plutôt que dans un message de commit.

- **Statut** : 🟡 Implémenté, non déployé — **non mergeable** tant que la question #41 est 🔴
  (#42 tranchée le 2026-07-29 : sémantique « contient »)
- **Sévérité** : — (ajout fonctionnel)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux
- **Créée le** : 2026-07-29 (JLH)
- **Fichiers** : `backend/src/features/spaces/spaces.service.ts` (`getTransactionBasketsBatch`),
  `backend/src/features/spaces/spaces.controller.ts`,
  [`src/components/analyse/charts/TransactionCategoryMixChart.vue`](../../src/components/analyse/charts/TransactionCategoryMixChart.vue),
  [`src/utils/transactionBaskets.js`](../../src/utils/transactionBaskets.js),
  [`src/composables/useTransactionBaskets.js`](../../src/composables/useTransactionBaskets.js)

## Besoin

Deux donuts côte à côte, d'après une capture de référence fournie par l'utilisateur :

- **gauche** — chaque part = l'ensemble distinct des catégories présentes dans un même panier
  (« Bières » 44,2 %, « Boissons Soft » 9,2 %, « Bières, Boissons Soft » 5,7 %, « Bières,
  Consigne » 4,9 %…), la valeur étant un **nombre de transactions** ;
- **droite** — le même calcul au grain **article** (« Consigne Pichet, Pichet Biere 1,5l »…) ;
- cliquer une part à gauche restreint le donut de droite aux paniers de cette combinaison.

La demande séparée « Rapport *Type de transaction* avec des camemberts » désigne **ce même
graphique** : un « type de transaction » *est* une combinaison de catégories. Vérifié au préalable —
`transactionType` n'existe nulle part dans le code (une seule ligne de doc périmée), et les
candidats voisins ne conviennent pas : `SalesTransaction.status` est un cycle de vie Weezevent
(V/W/C/R), `SalesPayment.paymentMethodId` est un identifiant opaque jamais résolu en libellé et
rattaché à la **ligne** et non à la transaction, `metadata.medium` (canal) n'est lu nulle part et
n'existe que côté Digifood. Il n'y avait donc **aucune dimension moyen-de-paiement ou canal à
brancher** — les deux demandes sont un seul chantier.

## Faisabilité — pourquoi un nouvel endpoint était obligatoire

L'entité de regroupement existe et est peuplée : `SalesTransaction` 1:N `SalesTransactionItem` via
`transactionId` (indexé), alimentée par les 4 chemins d'ingestion — Weezevent complet **et
incrémental** (le cron 10 min de production), Digifood webhook et CSV (qui regroupe explicitement
par `order_id`), et `simulateSale`.

La chaîne vers la catégorie existe aussi, et était **déjà écrite** dans `getEventTimelineBatch` :
`SalesTransactionItem.productId → SalesProduct → ProductMapping → MenuItem.categoryId →
ProductCategory.name`. C'est bien la taxonomie Menu Item, comme l'annotation de la capture le
confirmait.

Mais **aucune lecture existante ne préserve l'identité du panier** : `getEventTimelineBatch` porte
toute la jointure puis écrase `t.id` en `COUNT(DISTINCT t.id)` ; `SpaceRevenueMinuteAgg` n'a aucune
dimension produit ; `SpaceProductRevenueDailyAgg` aucune dimension transaction (et son
`transactionsCount` compte en réalité des **lignes**, pas des transactions). D'où
`GET /spaces/:id/transaction-baskets`.

## Décisions d'implémentation

### Grain de la réponse

Pré-groupé par `(event × minute × PdV × combo catégories × combo articles)` avec un
`transactionCount`, et **non** des combinaisons déjà comptées globalement.

Renvoyer des comptes finaux aurait forcé un refetch à chaque changement de filtre, ou fait ignorer
les filtres — soit exactement le défaut corrigé par [BUG-244-01](244_01_timeline_analyse_filtres_non_appliques.md),
recréé à neuf le jour de la livraison. Renvoyer les transactions brutes était impraticable (des
dizaines de milliers de paniers × 50 events). Les paniers étant très majoritairement des
singletons, ce grain s'effondre fortement tout en restant filtrable côté client.

`categoryCombo` / `itemCombo` sont des **tableaux**, pas des chaînes jointes : le `", "` est une
affaire de présentation et doit être i18n-aware pour la sentinelle `null`. Le tri est fait en SQL
(`ARRAY_AGG(DISTINCT … ORDER BY …)`) pour que « Bières, Consigne » et « Consigne, Bières » tombent
dans le même bucket.

### Sémantique des données — assumée et testée

| Cas | Décision |
|---|---|
| **Remboursements** (`status='V'`, montants négatifs, indiscernables d'une vente) | **Comptés** au dénominateur. L'endpoint ne filtre pas sur le signe : ça changerait le dénominateur sans le dire. → question #41, **encore ouverte** |
| **Paniers vides** (possibles sur le chemin incrémental quand `rows` est absent) | Écartés naturellement par l'`INNER JOIN` sur les items — un panier sans ligne n'a pas de combinaison. |
| **Produit non mappé** / **`MenuItem.categoryId` NULL** | Entrée `null` **dans** le tableau, jamais écartée ; rendue « Non rattachés » côté front. Un panier mixte s'affiche « Bières, Non rattachés ». Les deux cas ne sont pas distingués dans l'UI (deux gris embrouillent) ; la distinction reste récupérable car `itemCombo` nomme l'article. |
| **Formules / compounds** | Non regroupées — confirmé par la capture de référence (aucune catégorie « Formule », et « Bières, Consigne » y figure : les artefacts mécaniques produisent déjà des combinaisons). De toute façon `compoundId` est codé à `null` sur le chemin de synchro incrémental, celui qui tourne en production. |
| **Jamais écarter en silence** | Aucun `WHERE pc.name IS NOT NULL`, aucun INNER JOIN sur `ProductCategory` — verrouillé par test. |

### Filtrage — sémantique « contient » (question #42, tranchée le 2026-07-29)

**Tous** les filtres de la page s'appliquent au graphique. Les dimensions PdV et horaire passent par
le prédicat partagé `buildItemFilterPredicate` ; les dimensions article sont évaluées en
**« CONTIENT »** sur les combinaisons du panier — filtrer « Bières » garde le ticket
« Bières, Boissons Soft », et non les seuls tickets 100 % bière.

- Multi-sélection = **OU**, comme partout ailleurs dans la page : un panier passe dès qu'**une** de
  ses entrées figure dans la sélection.
- Une entrée `null` du backend est équivalente à `UNATTACHED_ITEM_KEY` — c'est la clé que le donut
  « Non rattachés » émet, sans quoi cliquer la part grise ne retrouverait aucun panier.
- Le sous-titre affiche le dénominateur retenu, qui **bouge donc avec les filtres**. Voulu : un
  pourcentage doit toujours dire sur quoi il porte.
- A nécessité d'ajouter **`typeCombo`** à l'endpoint (jointure `ProductType`) : sans lui, le donut
  « type d'article » de la page n'avait aucune dimension à filtrer côté panier et cliquer une de
  ses parts aurait vidé le camembert.

Implémenté dans [`buildBasketFilterPredicate`](../../src/utils/transactionBaskets.js) — pas d'un
prédicat maison recopié : les dimensions PdV/horaire délèguent à l'implémentation partagée, seules
les dimensions article ont leur logique propre (un panier porte des combinaisons, pas un
`menuItemCategory`). 10 tests dédiés, dont un qui échoue explicitement si l'on repasse en
« uniquement ».

### Un écart assumé à la convention de la page

**Le drill-down reste local au composant**, il ne passe pas par `toggleArrayFilter`. Une combinaison
de catégories n'est pas une dimension de page : ni les KPI, ni les barres par event, ni les tables
article ne savent l'appliquer. La router dans le store propagerait un filtre que rien d'autre
n'honore.

### Portée et rafraîchissement

Un seul point de montage couvre **Analyse, Live et Predict** : les trois sont le même composant
`AnalyseView.vue` (Live = `route.name === 'space-live'`, Predict = `selectedToolbox === 'predict'` ;
seul `event-predict` ouvre un overlay distinct), et le conteneur d'insertion n'a aucune garde
`!isLive`.

Le composable est branché sur `livePoll()` avec `bypassCache: true` — il a son propre cache session
(`_basketCache`), avec la même hypothèse d'immuabilité que celui de la timeline ; sans ce bypass le
donut se figerait pendant que le reste de la page tique toutes les 15 s.

En mode **Predict**, un scénario produit des quantités par article et **jamais de tickets** : il n'y
a rien à répartir. Le graphique n'affiche donc que le réel et **compte les events sans panier**
plutôt que de les laisser disparaître du dénominateur (même principe que
`predictEventsWithoutScenarioCount`). Aucun panier synthétique n'est fabriqué à partir de prévisions.

### Aucune migration

`@@index([transactionId])`, `@@index([productId, transactionId])` et
`@@index([tenantId, integrationId, transactionDate])` couvrent exactement les prédicats. Vérifié
dans le schéma — rien à créer.

Un helper privé `resolveEventSalesScope` a été extrait de `getEventTimelineBatch` et est désormais
partagé par les deux méthodes : les deux lisent les mêmes tables sur les mêmes bornes, et un scope
qui divergerait ferait afficher deux périmètres différents sur le même écran.

## Constat sur données réelles (2026-07-29, 1ᵉʳ rendu)

Le graphique a été affiché sur des données réelles le jour même. Il fonctionne, mais **« Autres »
pèse 35,1 % (5 732 tx) — la plus grosse part du donut**, contre 10,5 % sur la capture de référence
produit. Un bucket d'agrégation majoritaire rend le graphique difficile à lire.

Deux causes, de nature différente :

1. **Structurelle et attendue** — le nombre de combinaisons possibles croît de façon combinatoire
   avec le nombre de catégories : une dizaine de catégories suffit à produire des centaines de
   sous-ensembles, chacun rare. La traîne est intrinsèque à ce type de graphique. Palliatif appliqué
   le jour même : le libellé porte désormais le **nombre de combinaisons agrégées**
   (« Autres (N combinaisons) ») — sans quoi rien ne distingue un bucket cachant 3 combinaisons d'un
   bucket en cachant 300.

2. **Qualité de référentiel, corrigeable** — le référentiel `ProductCategory` du tenant observé
   contient des **quasi-doublons** : « Soft » (721 tx) et « Softs » (583 tx) apparaissent comme deux
   catégories distinctes. Conséquence directe et visible sur le même graphique : « Beer, Soft »
   (514 tx) et « Beer, Softs » (376 tx) sont **le même panier réel scindé en deux**, et
   « Soft, Softs » (149 tx) est un ticket contenant les deux variantes du même concept. Chaque paire
   de doublons multiplie mécaniquement le nombre de combinaisons distinctes, donc gonfle la traîne
   ET fragmente les parts nommées. (« Side » au singulier interroge aussi, la référence produit
   affichant « Sides ».)

Le point 2 n'est pas un défaut de ce graphique — c'est le graphique qui le **révèle**, parce qu'il
est le premier à croiser les catégories entre elles. Aucun autre écran ne le ferait apparaître : les
donuts existants agrègent par catégorie prise isolément, où un doublon passe pour deux lignes
plausibles. Correction à faire côté données (fusion des catégories en doublon), pas côté code —
voir la note de suivi ci-dessous.

## À faire / à surveiller

- **Fusionner les catégories en doublon** du référentiel (`Soft`/`Softs`, vérifier `Side`/`Sides` et
  le reste). Non fait ici : c'est une migration de données métier, pas une modification de code, et
  elle change l'affichage de tous les écrans qui lisent `ProductCategory`.
- **Top-N** figé à 19 + « Autres » (calé sur la capture de référence). À 35 % dans le bucket, la
  question « faut-il l'augmenter, ou rendre « Autres » dépliable ? » devient concrète — reliquat
  ouvert de la question #42.

## Vérification

**Tests automatisés** — 7 côté backend (`spaces.service.spec.ts`) : prédicats obligatoires
`status='V'` / `deletedAt IS NULL`, groupement par `t.id` (anti-double-comptage), tri SQL des
combinaisons, absence de filtre sur la catégorie, et un panier à 2 lignes → **une** ligne à 2
catégories avec `transactionCount: 1`. 19 côté frontend
([`tests/unit/transactionBaskets.spec.js`](../../tests/unit/transactionBaskets.spec.js)) : égalité
de combinaison (dont le piège « Pichet Biere 1,5l » qui interdit `', '` comme séparateur —
d'où U+001F), top-N + « Autres » non drillable, conservation du total, comptage des non résolus.

**Reste à faire avant merge — vérification SQL en lecture seule sur données réelles**, à passer
AVANT toute validation visuelle :

1. `SUM(transactionCount)` de l'endpoint **doit** égaler `COUNT(DISTINCT t.id)` sur la même fenêtre
   avec `status='V' AND deletedAt IS NULL`. Sinon le regroupement double-compte et **tous** les
   pourcentages sont faux.
2. Compter les lignes où `null = ANY(categoryCombo)` → taille du bucket non résolu. Recouper le
   premier saut (produit non mappé) contre `GET /mappings/product-menu/stats` ; le delta est le
   second saut (`MenuItem.categoryId IS NULL`) — ce serait **la première mesure de cette couverture
   dans ce codebase**. Si le bucket domine, escalader avant de livrer. À rapprocher de la question
   #14 (le bucket « Non rattachés » pèse déjà 29,8 % des transactions côté shop-level).
3. Sanity : les combinaisons singleton doivent dominer, un équivalent « Bières » vers 40 %.
4. `EXPLAIN ANALYZE` sur le plus gros event — confirmer l'usage des index.

**Vérification en interface** (non faite : pas de `pnpm dev` dans cette session) — somme à 100 %
« Autres » inclus ; clic à gauche → le donut de droite se restreint et le sous-titre nomme la
combinaison ; « Autres » non cliquable ; filtres PdV et curseur horaire suivis ; sur `/live`,
laisser 60 s et vérifier que les nombres bougent ; en Predict, events sans panier comptés et
affichés ; dark mode ; export PNG (le composant est dans `#analyse-capture-root`).

## Références

- [`modules/02_ANALYSE.md`](../modules/02_ANALYSE.md) — endpoint et composable.
- [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #41 (remboursements) — **encore ouverte,
  bloquante pour le merge** ; #42 (« contient » vs « uniquement ») — **tranchée le 2026-07-29** par
  l'owner en faveur de « contient », reste seulement le top-N à confirmer.
- [BUG-244-01](244_01_timeline_analyse_filtres_non_appliques.md) — livré dans le même lot de travail.

---

JLH
