# BUG-323-01 — Analyse : shop-details appelé deux fois en série (~36 s avant les graphes)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux (volet backend : `backend/docs/bugs/130_01_shop_details_rpc_costmap_scan_transactions_index_manquant.md`)
- **Découvert le** : 2026-08-18
- **Fichiers** : `src/composables/useSpaceData.js:106-137` (phase 1) et `:219-247` (vague 2a), `src/components/analyse/AnalyseView.vue:676,681` (gates), `src/store/modules/analyse.js:1960-1994` (onEnrichment)

## Symptôme

Sur `spaces/cmsufah9p0c08gpkz2wsg5pzo` (Stade Jean Bouin), la page Analyse restait ~36 s en
skeletons ; seul le donut « Combinaisons de produits » (TransactionCategoryMixChart) se
remplissait tôt. Network : `shop-details?page=1&limit=20&granular=0` en 17,4 s **puis**
`shop-details?page=1&limit=200&granular=1` en 18,4 s — même RPC, jamais en parallèle.

## Cause racine

1. La phase 1 de `fetchSpaceData` attendait `getSpaceShopDetails` (granular=0) dans son
   `Promise.all` (`useSpaceData.js:118`), et la vague 2a — qui porte `getSpaceShopGranular`
   (granular=1) — ne démarrait **qu'après** la phase 1 : deux exécutions sérialisées de la
   même RPC lente (`get_space_shop_details`). Or la réponse granular=1 est un **surensemble
   strict** de granular=0 (mêmes `shops`/`menuItemCostMap`/`events`/`meta`, + `shopGranularData`) :
   le 1er appel était entièrement redondant.
2. `chartsLoading` (`AnalyseView.vue:681`) ne retombe que quand les SIX promesses de la
   vague 2a sont réglées → tous les graphes attendaient l'appel le plus lent. Seul
   TransactionCategoryMixChart a son propre gate (`basketsLoading`), d'où son affichage précoce.
3. La lenteur de la RPC elle-même est le volet backend (index manquant + scan costMap,
   fiche backend 130-01).

## Correction

Branche `fix/analyse-page-load-perf` (2026-08-18) :

- `useSpaceData.js` : UN SEUL appel `getSpaceShopGranular` lancé à **t=0** (avant la phase 1),
  consommé par la vague 2a. Phase 1 réduite à space + configurations + events → premier
  rendu ~1-2 s. `menuItemCostMap` et la détection `missing-weezevent-table` remontent
  désormais par l'enrichissement (nouvelle clé `weezeventSetupIncomplete`, commit dans
  `analyse.js` onEnrichment).
- `fetchLiveShopSnapshot` : l'appel granular=0 par tick de 15 s supprimé (même redondance).
- Compatible dans les deux sens de déploiement : shape de réponse inchangée, granular=0
  toujours servi par le backend.

Effet mesuré côté RPC (avec le volet backend) : 14,7 s → 0,65 s par appel ; côté page,
un seul appel au lieu de deux sérialisés.

## Risque de régression / à surveiller

- Marge/coûts : la costMap transite désormais par la vague 2a (`chartsPayload.menuItemCostMap`,
  RPC prioritaire sur le fallback menu items) — vérifier colonnes coût/marge d'Analyse et
  EventPredict.
- L'état « Weezevent setup incomplet » s'affiche après le chargement de fond au lieu de
  bloquer la phase 1 (arbitrage assumé, cas rare).
- Live : un seul appel par tick — vérifier le rafraîchissement 15 s.
- EventPredictView appelle `getSpaceShopGranular(limit:500)` : chemin intouché.

## Addendum 2026-08-18 — « Stade Jean Bouin » toujours vide APRÈS le fix perf : cause DONNÉES

Après le fix, la page charge en ~1-2 s mais tout affiche 0 (CA 0 €, 0 PdV). **Pré-existant et
distinct du volet perf** (la mesure baseline avant le refactor donnait déjà 0 ligne granulaire —
la lenteur masquait simplement le vide). Chaîne vérifiée en base datafriday-dev :

- `SpaceRevenueMinuteAgg` : 0 ligne pour `spaceId = cmsufah9p0c08gpkz2wsg5pzo`.
- Les 112 locations Weezevent mappées aux shops de cet espace ont bien 84 832 lignes d'agrégats
  (~2,77 M€)… sous les spaceIds de deux espaces **supprimés** (`cms80amew00x35mw2…`,
  `cms80zfzx000nkgsm…` — absents de `Space` ; 91 993 lignes orphelines au total).
- L'espace a été recréé le 2026-08-15 (mappings refaits), mais **l'agrégation n'a jamais été
  relancée** → le filtre `srma."spaceId" = p_space_id` de la RPC ne matche rien. Les 185k
  transactions et 3 events existent ; le donut « combinaisons » marchait car
  `transaction-baskets` lit les transactions brutes.

Résolution : relancer l'agrégation via le wizard d'intégration, Step 4 « Process timeline »
(`POST /aggregation/process-events`). Décision 2026-08-18 : les 91 993 lignes orphelines sont
**conservées** (inoffensives pour la RPC, filtre spaceId) — purge éventuelle plus tard.
Cause structurelle (SRMA non purgé/re-rattaché à la suppression/recréation d'un espace) : à
tracer côté backend si récurrent.

## Références

- Volet backend : `api` `docs/bugs/130_01_shop_details_rpc_costmap_scan_transactions_index_manquant.md`
- BUG-324-01 (découvert en même temps, `//health` 404)
- BUG-226 (vagues 2a/2b), BUG-174 (cache-first loadSpace), BUG-227 (payload shop-items)
