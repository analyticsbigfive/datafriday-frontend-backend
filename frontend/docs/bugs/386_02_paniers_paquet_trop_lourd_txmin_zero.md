# BUG-386-02 — Analyse : TX/MIN figé à 0,00/min (paquet paniers de 42 Mo, échec lu comme « aucun ticket »)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business (remonté client, Stade Jean Bouin)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-09-22
- **Fichiers** : `src/api/endpoints/space.api.js` (taille de paquet), `src/composables/useTransactionBaskets.js`,
  `src/composables/useMetricsCalculator.js`, `src/utils/shopPerformanceCompute.js:255`,
  `src/components/space-workspace/analyse/views/AnalyseView.vue`,
  `src/components/space-workspace/analyse/charts/ShopPerformanceByTransactionRate.vue`

## Symptôme

Analyse, espace Stade Jean Bouin, un seul event sélectionné (PFC - Strasbourg, 19/09/2026) :

- carte **TX/MIN à « 0.00/min »**, alors que REVENUE (55 196 €), PER CAP (3,56 €) et MARGIN (77,5 %)
  sont justes ;
- panneau « Shop Performance by Transaction Rate » : chaque PdV affiche **0.00 txn/min** et
  **Operating Minutes 0**, à côté de « Total Transactions : 509 » et d'un CA bien réel.

Valeur attendue, recalculée sur les données de PRODUCTION avec la formule de la carte (Σ des taux
par PdV) : **29,92/min** pour cet event seul (2 306 lignes, 18 PdV, 5 672 tickets). Les données
serveur sont saines : 58 events sur 58 ont leurs lignes dans `SpaceBasketMinuteAgg`, aucune ligne
hors périmètre PdV, aucune fenêtre d'event invalide, requête de lecture à ~1 s.

Le 0 « reste » : ni un changement de sélection ni la réouverture du panneau ne le font bouger
(seul un rechargement complet de la page pouvait le lever).

## Cause racine

Deux défauts qui se composent.

**1. Le paquet paniers est hors de portée de l'API.** `transaction-baskets` est resté au grain
(minute × PdV × combinaison) : le grain summary de BUG-364-01 n'a porté que `event-timeline`
(« paniers summary différés, TX/MIN/peak exigent la minute »). Mesuré en prod le 2026-09-22 sur
Jean Bouin : **2,0 Mo de JSON pour UN event** (4 782 lignes), **42 Mo pour un paquet de 30 events**
(102 659 lignes). Or `BATCH_CHUNK_SIZE` est passé de 15 à 30 le 2026-09-21 (commit `aa9276bd`),
calibré sur des réponses « de quelques centaines de ko » : vrai pour l'event-timeline summary, faux
d'un facteur 100 pour les paniers. Avec 2 paquets en vol, l'API (instance 512 Mo) devait sérialiser
jusqu'à 84 Mo simultanés, et le paquet échouait.

**2. Un échec de paquet s'écrivait comme un résultat.** `useTransactionBaskets` marquait les events
non livrés en écrivant `[]` dans son cache (« tentés → pas de refetch en boucle »). Conséquences en
chaîne :

- `sourceState` retombait sur `'empty'`, c'est-à-dire « chargé, aucun panier », état TERMINAL ;
- la carte TX/MIN publiait donc `sumShopTransactionRates([])` = **0,00/min** comme une valeur exacte
  (BUG-358-01 a fait des paniers sa source unique) ;
- le panneau PdV affichait 0,00 txn/min / 0 minutes (valeurs par défaut de `makeShopEntry`,
  conservées par la branche `if (!shopMap) return shop` de `computeRatesFromTimeline`) ;
- aucun rattrapage possible : la clé étant dans le cache, `load()` ne reciblait plus l'event pour
  le reste de la session.

Pourquoi le reste de l'écran semblait juste : depuis BUG-146-01, quand le périmètre est « des
events entiers » (cas d'un event filtré, sans filtre PdV/article/horaire), CA et transactions sont
lus sur le rollup `Event.revenue`/`Event.transactionCount`, et la marge sur l'item-level
(`event-timeline`, summary, ~10 à 20 ko par event, donc livré). Seule la carte TX/MIN dépend des
paniers, d'où un écran qui ne signale rien ailleurs.

## Correction

Correctif du 2026-09-22, non commité à ce stade (à poser sur une branche `fix/analyse-txmin-paniers-paquet`).

1. **Paquet dédié aux paniers** : `BASKET_CHUNK_SIZE = 6` (~12 Mo par requête) au lieu du
   `BATCH_CHUNK_SIZE = 30` commun, tant que l'endpoint n'expose pas de grain summary. La mesure
   (2 Mo/event, 42 Mo/30 events) est inscrite en commentaire au-dessus de la constante.
2. **Un échec reste un échec** : `useTransactionBaskets` n'écrit plus `[]` pour un event non livré.
   Il tient un ensemble `failedIds` et un compteur `attempts` (plafond `MAX_ATTEMPTS = 2`) :
   l'event est retenté au prochain changement de périmètre, sans boucle possible.
3. **Quatrième état `'error'`** dans `sourceState` : ni `'loading'` (pas de squelette éternel), ni
   `'empty'` (pas de faux zéro).
4. **Plus de valeur publiée sans source** :
   - `perShopTransactionRateSum` et `transactionRecords` valent `null` sur `'error'` ;
   - `useMetricsCalculator` reçoit `transactionRateUnavailable` : sur échec, `displayTransactionRate`
     renvoie `null` (« — ») au lieu de retomber sur le repli `transactions / minutes nominales`,
     l'ancienne formule retirée par BUG-358-01 ;
   - `computeRatesFromTimeline` renvoie `transactionRate`/`operatingMinutes`/`peak`/`first60` à
     `null` (et non 0) pour un PdV absent de la source paniers ; le panneau et l'export rendent
     « — » / cellule vide.

## Risque de régression / à surveiller

- Tests ajoutés : `tests/unit/analyseKpiSourceGating.spec.js` (état `'error'`, rattrapage au
  changement de périmètre, plafond de tentatives, TX/MIN sans repli sur échec) et
  `tests/unit/shopPerformanceCompute.spec.js` (cadence inconnue vs cadence nulle). L'ancienne
  assertion « batch KO → `'empty'` » est remplacée par « → `'error'` ».
- À retester à la main après déploiement : un event seul sur Jean Bouin doit afficher ~29,9/min, et
  le panneau PdV des cadences non nulles. En coupant le réseau sur `transaction-baskets`, la carte
  doit afficher « — », jamais 0,00/min.
- **Reste ouvert (chantier suivant)** : le grain summary des paniers. 6 events par paquet reste un
  palliatif (12 Mo par requête, 4 paquets pour 24 events). Le calcul du taux n'a besoin, par
  (event × PdV), que des tickets et des bornes première/dernière minute ; le donut de répartition
  n'a pas besoin de la minute du tout. Un `granularity=summary` sur `GET :id/transaction-baskets`
  diviserait la charge par ~10 (1 819 lignes au lieu de 4 782 pour l'event mesuré, sans l'axe
  minute). Le pic 15 min et la 1re heure du panneau PdV exigeraient alors un chargement plein grain
  à la demande.
- Surveiller aussi `analyse-unmapped`, encore en lecture brute, qui partage la file globale.

## Références

- [BUG-358-01](358_01_txmin_deux_formules_selon_panneau.md) — formule unique de la carte TX/MIN
  (Σ des taux par PdV depuis les paniers).
- [BUG-354-01](354_01_transactions_comptent_des_lignes.md) — les paniers deviennent la source des
  transactions et du txn/min.
- [BUG-364-01](364_01_analyse_payload_memoire_concurrence.md) — grain summary de l'event-timeline,
  paniers explicitement différés.
- [BUG-350-01](350_01_ca_variable_home_analyse_bascule_source.md) — règle « aucune valeur provisoire
  nulle part », dont ce bug est une violation par un autre chemin.
- Commit `aa9276bd` (2026-09-21) — passage du paquet de 15 à 30.
