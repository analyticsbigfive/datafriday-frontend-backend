# BUG-284-01 — Analyse : freeze momentané au clic sur un segment de graph/camembert et au changement de configuration — quick wins perf

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-03, non buildé/testé)
- **Sévérité** : 🟠 Majeur (page figée ~1-3 s à chaque interaction sur machines modestes)
- **Domaine** : Analyse & agrégation / Performance
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-03 (signalement utilisateur ; la branche `fix/frozenAnalysisOnOlderComputers` annonçait ce chantier sans qu'aucun commit ne l'ait entamé) — JLH
- **Fichiers** : `src/composables/{useFilters,useAnalyseItemRecords,useReconciliationContext}.js`,
  `src/components/analyse/AnalyseView.vue`, `src/components/analyse/charts/{GenericByEventChart,DonutChartCard,EventTimelineChart,EventRevenueByShopChart}.vue`

## Symptôme

Page `/spaces/:id` : cliquer un segment de camembert/barre ou changer la configuration fige la
page momentanément (thread principal bloqué). Plus marqué sur vieux CPU et au clic sur une
barre d'event (chaîne la plus lourde : `filteredEvents` change d'identité → re-réconciliation
des 2 instances item-level + destroy/recreate du canvas timeline).

## Cause racine (carte du 2026-08-03)

Un clic segment passait par `toggleArrayFilter` → `setFilterImmediate` (dispatch brut, le
`setFilter` débouncé 150 ms existant n'était branché nulle part sur ces clics) → **~20 passes
complètes synchrones** sur le tableau de records réparties dans 7+ composants qui ré-agrègent
chacun dans leur coin (diagnostic déjà posé par la fiche ⚪ 179) — pendant que tous les charts
Chart.js se ré-animent (défaut 1000 ms). Multiplicateurs :

1. Le cache item-level (`useAnalyseItemRecords.js`) était un `ref()` **profondément réactif,
   jamais gelé** — chaque lecture de propriété dans les agrégations traversait un Proxy Vue
   (surcoût dominant sur vieux CPU), alors que les tableaux shop-level du store sont déjà
   `Object.freeze` (`analyse.js:1639,1667`).
2. `useReconciliationContext()` créait un `computed` **neuf par site d'appel** (3 instances) —
   contexte et mémos (`matchMemo`/`categoryMatchMemo`) payés 3× à chaque invalidation du
   catalogue, contredisant son propre docblock « contexte UNIQUE ».
3. `itemTotals` (`AnalyseView.vue`) faisait 2 boucles complètes sur les records par appel (×3
   appels : courant / période précédente / N-1).

## Correction (quick wins — le structurel reste fiche 179)

1. **`useFilters.js`** : nouveau `toggleArrayFilter` coalescé exporté — read-modify-write sur
   l'état **en attente** (pas le store), timer par clé : des clics rapides sur la même clé se
   cumulent sans écrasement, un seul dispatch (donc une seule vague de recalculs) part après
   150 ms d'accalmie. `setFilterImmediate` sur une clé annule le toggle en attente de cette clé
   (sinon le dispatch différé écraserait un « tout effacer ») ; `resetFilters` purge tout.
   `AnalyseView.vue` délègue (fonction locale supprimée).
2. **Animations Chart.js 1000 → 200 ms** (choix JLH : réduire, pas couper) dans les 4 charts
   canvas réels : `GenericByEventChart`, `DonutChartCard` (couvre aussi
   TransactionCategoryMix/ShopDistribution qui délèguent), `EventTimelineChart`,
   `EventRevenueByShopChart`.
3. **`useAnalyseItemRecords.js`** : cache en `shallowRef` + `Object.freeze` des lignes et
   tableaux avant mise en cache (écritures déjà exclusivement par réassignation ; vérifié :
   `reconcileRecord` et les consommateurs ne mutent jamais les records — map → objets neufs).
4. **`useReconciliationContext.js`** : singleton de module dans un `effectScope(true)`
   **détaché** — un computed créé pendant un setup serait arrêté au démontage du composant et
   le singleton resterait figé après une navigation ; le scope détaché vit avec l'app, comme le
   store. Mémos amortis 1× au lieu de 3×. Le 4ᵉ contexte inline du getter store
   (`analyse.js:874-882`) reste hors périmètre.
5. **`itemTotals`** : `revByEvent` rempli dans la même passe que les totaux — mêmes
   accumulations dans le même ordre (résultat identique au bit près), 1 passe au lieu de 2 par
   appel.

**Pas de loader ajouté** (préférence JLH : amélioration réelle plutôt qu'indicateur).

**Complément 2026-08-03** : le volet MÉMOIRE de la même page (2-3 Go Chrome — caches sans
éviction, copies multiples, keep-alive illimité) et le volet RESSENTI (surlignage optimiste de
la part cliquée + voiles squelettes sur les blocs dépendants, maquette validée) sont traités
par [BUG-285](285_01_analyse_memoire_2_3_go_caches_sans_eviction.md). La fenêtre de coalescing
150 ms introduite ici est ce qui permet au feedback optimiste de PEINDRE avant le burst de
recalculs.

## Risque de régression / à surveiller

- Clic segment : le filtre s'applique désormais ~150 ms après le clic (coalescing) — vérifier le
  ressenti ; le cumul de clics rapides sur un même donut doit aboutir au même état final
  qu'avant (toggle sur l'état en attente, testé par relecture, pas en navigateur).
- Gel du cache : si un consommateur futur mute un record item-level, échec **silencieux** hors
  strict mode — convention : toujours passer par map/copie.
- Singleton contexte : survit aux navigations (scope détaché) — vérifier après un aller-retour
  Analyse → autre page → Analyse que les filtres/donuts réagissent toujours au catalogue.
- Animations 200 ms : purement visuel, bascule clair↔sombre comprise.
- Si le freeze persiste sur les machines cibles → déclencher la vague structurelle fiche 179
  (index `Map` partagés par eventId/menuItemId/shopId remplaçant les ~20 passes).

## Références

- [BUG-179](179_getters_analyse_lourds.md) — diagnostic structurel antérieur, reste ⚪ pour la
  vague index. [BUG-182](182_scoring_predict_client_3_8s.md) — précédent travail lourd client.
- `docs/PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md` — volumes (50 events × grain minute×shop×item).
