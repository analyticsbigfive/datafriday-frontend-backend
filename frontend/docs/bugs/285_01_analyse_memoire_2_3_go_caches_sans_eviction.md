# BUG-285-01 — Page Analyse : 2-3 Go de RAM Chrome — caches sans éviction, copies multiples, keep-alive illimité + volet fluidité (skeletons au clic segment)

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-03, non buildé/testé — mesure mémoire réelle à faire par JLH)
- **Sévérité** : 🔴 Bloquant sur machines modestes (2-3 Go de RAM pour un onglet, ne redescend jamais)
- **Domaine** : Analyse & agrégation / Performance mémoire / Transverse (keep-alive)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-03 (signalement utilisateur, mesure Chrome) — JLH
- **Fichiers** : `src/api/endpoints/space.api.js`, `src/store/modules/analyse.js`,
  `src/composables/{useAnalyseTimeline,useTransactionBaskets,useAnalyseItemRecords,useFilters}.js`,
  `src/views/DashboardView.vue`, `src/components/analyse/…` (voir correctifs)

## Symptôme

Onglet Chrome à 2-3 Go de RAM après une session Analyse normale ; la mémoire monte à chaque
event/espace/outil visité et **ne redescend jamais**.

## Cause racine (audit du 2026-08-03, 2 explorations croisées)

Le dataset minute×shop×article (~350-450 octets/ligne × dizaines de milliers de lignes par
event, cap 50 events + 100 en comparaison) existait en **5-6 copies simultanées** (brut API,
préprocessé ×2 instances, réconcilié ×2, timeline ×3 dont un re-préprocessing idempotent), servi
par **3 couches de caches sans aucune éviction** :

1. `_eventTimelineCache`/`_basketCache` (`space.api.js`) — JSON brut de chaque event de chaque
   espace jamais visité, à vie. **Croissance sans borne = contributeur n°1.**
2. Accumulateurs Vuex par clé jamais purgés au changement d'espace (`timelineCacheByEventId`,
   `predictionCacheByEventConfigKey`, `spaceShopsRows`, `spaceMenuByConfig`, `shopMenusByShop`,
   `activePredictionVersionByEventId`).
3. Caches par eventId des composables (`useAnalyseItemRecords` ×2, `useTransactionBaskets`) —
   survivent au changement d'espace in-page (vue non remontée, key = route.name).

Multiplicateurs : réactivité profonde restante sur 3 chemins jumeaux du fix BUG-284
(`useAnalyseTimeline`, `useTransactionBaskets`, setters store non gelés — un Proxy Vue retenu
par ligne) ; `<keep-alive>` **sans `max`** (33 routes — chaque outil visité reste monté à vie
avec ses charts) ; re-préprocessing idempotent dans `EventTimelineChart` (copie complète + pic
2× pour un résultat identique).

Hors de cause (vérifié) : images base64 (BUG-227 corrigé, ~1 Mo résiduel), destruction
Chart.js (propre), `console.log` (comptes seulement).

## Correction (2026-08-03, décisions JLH : LRU 30 + purge espace ; keep-alive max 6 ; skeletons validés sur maquette)

**Mémoire :**
- **M1** `space.api.js` : LRU 30 entrées sur `_eventTimelineCache` et `_basketCache` (re-set au
  hit, éviction du plus ancien) + `clearSpaceSessionCachesExcept(spaceId)` exporté. `bypassCache`
  (Live) inchangé.
- **M2** gels/réactivité superficielle : `useAnalyseTimeline.eventTimelineData` → `shallowRef` +
  lignes gelées ; `useTransactionBaskets.cache` → `shallowRef` + gel ; setters store
  `SET_TIMELINE_FOR_EVENT`/`SET_PREDICT_SCENARIO_ITEM_RECORDS` gèlent (motif `SET_SHOP_GRANULAR`
  — tableau gelé = Vue saute le Proxy).
- **M3** `EventTimelineChart` : ré-agrégation sautée quand l'entrée est déjà agrégée
  (discriminant : champs dérivés `avgBasket`/`totalRevenue`, absents du brut API — robuste aux
  `.filter()` amont). Les chemins EventPredict à données brutes continuent d'agréger.
- **M4** `DashboardView` : `<keep-alive :max="6">` — le 7ᵉ outil démonte proprement le moins
  récent (vue-chartjs détruit ses instances au démontage).
- **M5** `analyse.js loadSpace` : au **changement** d'espace (pas au re-load du même), mutation
  `CLEAR_SPACE_KEYED_CACHES` (accumulateurs ci-dessus, entrée de l'espace courant conservée
  pour `spaceShopsRows`) + `clearSpaceSessionCachesExcept` ; `AnalyseView` purge aussi les
  caches composables (`clearCache()` exposé par les 2 composables) dans son watcher spaceId.
- **M6** instance comparaison : vérifiée **déjà gatée** (`comparisonMode` off → `[]`, zéro
  fetch) — rien à changer.
- **M7** supprimé : `transactionRateCache`/`shopPerformanceCache` (state déclaré, jamais
  lu/écrit). **Conservés sciemment** : la chaîne `loadTimelineForEvent`/
  `aggregatedTimelineByEvent` (aucun appelant app mais couverte par
  `tests/unit/analyseStore.spec.js` — gelée M2 + purgée M5, croissance nulle ; suppression =
  vague dédiée avec ses tests, cf. fiche 178) ; `picture` du getter shops (consommé par les
  vignettes de `MenuItemsByShopTable` — l'hypothèse « toujours nul » de l'audit était fausse).

**Fluidité (maquette validée : https://claude.ai/code/artifact/00007c53-758a-411c-95a7-748607e8cfdc, option « A+B ») :**
- **C1** `useFilters` : ref module `filtersRecomputing` — posée dès le clic (la fenêtre de
  coalescing 150 ms de BUG-284 laisse le navigateur PEINDRE le feedback avant le burst
  synchrone), relâchée 2 `requestAnimationFrame` après le dispatch, jamais entre deux flushs
  coalescés.
- **C2** `DonutChartCard` : part cliquée détachée immédiatement (`offset` optimiste, resynchro
  sur retour des props) — donut ET légende.
- **C3** `AnalyseSkeletonVeil.vue` (nouveau, voile semi-transparent + lignes shimmer, dark via
  `.dark`, `prefers-reduced-motion` respecté) monté sur : tous les donuts (via `DonutChartCard`,
  sauf celui qui vient d'être cliqué — il garde son surlignage), `MenuItemsByShopTable`,
  `MenuItemRevenueDistribution`, `SummaryPanel`.

## Risque de régression / à surveiller

- Revisiter un event au-delà des 30 récents ou un espace quitté = re-fetch (latence réseau au
  lieu d'instantané) — voulu.
- 7ᵉ outil visité : le moins récent perd son état d'écran (choix validé JLH).
- Gels : toute mutation future en place des lignes cachées échouera silencieusement hors strict
  mode — convention map/copie.
- M3 : vérifier à l'écran la timeline Analyse ET EventPredict (chemins prédits/mock passent
  toujours par l'agrégation).
- Voiles : vérifier qu'ils n'apparaissent que brièvement (clic segment, changement de config)
  et jamais en boucle ; `filtersRecomputing` doit retomber même si un dispatch jette.
- **Mesure JLH** (Chrome Task Manager) : charge initiale → clics segments → 3-4 outils →
  changement d'espace. Attendu : plus de croissance sans retour. Si insuffisant → vague
  fiche 179 (index partagés réduisant les copies réconciliées).

## Références

- [BUG-284](284_01_analyse_freeze_clics_segments_quick_wins.md) — volet CPU de la même page ;
  le coalescing 150 ms est ce qui permet aux voiles/surlignages de peindre avant le calcul.
- [BUG-178](178_double_cache_timeline.md) — triple cache timeline (couche store désormais
  gelée+purgée, suppression restante documentée là-bas). [BUG-179](179_getters_analyse_lourds.md)
  — chantier structurel suivant. [BUG-227](227_shop_items_photo_base64_dupliquee_par_pdv.md) —
  base64 hors de cause.
- Hors périmètre noté : `builderStore.js` (un store réactif par espace visité, domaine
  builder2) ; catalogue `menuItems` en double store (~1 Mo ×2) ; `restTimelineCache`
  (usePredictiveTimeline).
