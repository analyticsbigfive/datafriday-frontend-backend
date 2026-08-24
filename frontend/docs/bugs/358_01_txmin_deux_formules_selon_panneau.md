# BUG-358-01 — Carte TX/MIN : deux formules selon l'état du panneau Shop Performance

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/composables/useMetricsCalculator.js`, `src/components/analyse/AnalyseView.vue`,
  `src/utils/shopPerformanceCompute.js`, `src/composables/useTransactionBaskets.js`,
  `src/components/analyse/panels/FinancialMetricsGrid.vue`

## Symptôme

Sur Le Mans FC (« Tout l'historique », 22 events), la carte KPI « TX/MIN » affiche **11,76/min**,
puis saute à **26,94/min** dès qu'on clique dessus (ouverture du panneau « Shop Performance by
Transaction Rate »), et retombe à 11,76 à la fermeture. Même carte, même libellé, deux valeurs —
l'utilisateur lit un bug ou un rafraîchissement de données, alors que c'est un changement de
formule silencieux.

## Cause racine

Deux moteurs derrière la même carte (`displayTransactionRate`) :

1. **Panneau fermé** : `displayTransactions / operatingMinutes`, avec
   `operatingMinutes = Σ (event.durationMinutes || 180)` sur les events filtrés
   (`AnalyseView.vue`) — un taux global dilué sur des durées **nominales** (le repli 180 min
   s'applique à quasi tous les events). 46 554 ÷ (22 × 180) = 11,76.
2. **Panneau ouvert + enrichi** : override `shopPerformance.totalTransactionRate` = **Σ des
   `transactionRate` par shop**, chacun = tickets ÷ minutes **réellement actives** du PdV
   (`computeRatesFromTimeline`). Σ(1,04 + 0,91 + 1,15 + …) = 26,94.

Aggravants découverts au diagnostic :
- garde `if (o != null && o > 0)` dans `useMetricsCalculator` : un override valant exactement 0
  (panneau ouvert, batch paniers KO) retombait **silencieusement** sur la formule 1 ;
- `useTransactionBaskets.sourceState` publiait `'ready'` dès le **premier** record en cache alors
  que d'autres events étaient encore en vol → les KPI dérivés des paniers pouvaient afficher une
  somme partielle destinée à bouger (valeur provisoire interdite par BUG-350-01).

## Correction

Décision JLH 2026-08-24 : la carte affiche **toujours la somme des taux moyens par PdV** (l'ex-
formule du panneau), panneau ouvert ou fermé. Le clic continue d'ouvrir le panneau, sans changer
le chiffre.

- `sumShopTransactionRates(basketRecords)` (nouvelle fonction pure,
  `src/utils/shopPerformanceCompute.js`) : Σ_shops (Σ txn / Σ_events span actif), sémantique
  identique à `computeRatesFromTimeline` — parité verrouillée par un test d'égalité
  (`tests/unit/shopPerformanceCompute.spec.js`).
- `AnalyseView.vue` : `perShopTransactionRateSum` computed sur `filteredBaskets` (réactif à tous
  les filtres, plage horaire comprise) ; `null` en predict ou tant que la source paniers n'est pas
  terminale.
- `useMetricsCalculator.js` : `overrideTransactionRate` supprimé (et son piège `o > 0`), remplacé
  par `perShopTransactionRate` (`!= null` suffit, 0 est terminal). Le repli
  `transactions / operatingMinutes` ne subsiste que pour Predict et n'est jamais visible en
  Analyse (squelette pendant `null`).
- `useTransactionBaskets.js` : `sourceState` réordonné — `'ready'` seulement quand **tous** les
  events scopés ont été tentés (tests ajoutés dans `analyseKpiSourceGating.spec.js`).
- `FinancialMetricsGrid.vue` : plus de fallback « Cliquer » ; sous-texte = nouvelle clé i18n
  `anKpiTxRateScope` (fr « Σ des taux moyens par PdV » / en « Sum of per-outlet avg rates ») pour
  que la formule soit dite à l'écran.
- `useShopPerformance.js` : `totalTransactionRate` (code mort après la bascule) supprimé.

## Risque de régression / à surveiller

- **Divergences légitimes carte ↔ panneau** (documentées, pas corrigées) : la carte applique les
  filtres PdV/article de la page (le panneau liste tous les shops) ; la carte est plafonnée à
  100 events (`BASKET_EVENT_CAP`, bandeau troncature existant), l'enrich du panneau non.
- **Minuit** : le span `last-first+1` sur HH:MM se casse si un event franchit minuit — limitation
  déjà présente dans `computeRatesFromTimeline`, conservée ici pour la parité.
- La bande KPI entière reste en squelette jusqu'au chargement complet des paniers (effet voulu du
  réordonnancement de `sourceState`) — vérifier qu'aucun périmètre ne reste en squelette éternel
  (un batch KO marque les events comme tentés → état terminal).
- Predict : vérifier qu'aucun 0 fugace n'apparaît en basculant la toolbox.
- Tests : 45/45 verts sur `shopPerformanceCompute.spec.js` + `analyseKpiSourceGating.spec.js`.

## Références

- [BUG-354-01](354_01_transactions_comptent_des_lignes.md) — paniers = source des transactions
  (préalable qui rend la dérivation possible sans timeline).
- [BUG-350-01](350_01_ca_variable_home_analyse_bascule_source.md) — règle « aucune valeur
  provisoire nulle part ».
- [BUG-287-01](287_01_analyse_txn_min_pdv_ignore_plage_horaire.md) — sémantique fenêtrage des rates.
- [BUG-014](14_triple_formule_ca_moyen_event.md) — même famille : formules multiples pour une
  même métrique.

JLH
