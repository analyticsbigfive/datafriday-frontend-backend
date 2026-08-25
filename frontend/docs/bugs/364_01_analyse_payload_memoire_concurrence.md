# BUG-364-01 — Analyse Jean Bouin : ~164 Mo téléchargés au montage, 1,9 Go de mémoire navigateur

- **Statut** : partiellement corrigé (2026-08-25, non testé) — livrés : file FIFO globale (2 max),
  chunk unmapped 30→15, fix régression 363-01 (mémoïsation reconcile par event), barre de
  progression déterminée, useShopPerformance branché sur les caches partagés (plus de re-fetch),
  purge des caches au démontage, préprocess allégé (`lean`, −9 clés mortes/ligne), bande KPI ←
  `Event.revenue` (BUG-146-01) ; **étape 5 (25/08 après-midi)** : timeline de montage en
  grain SUMMARY (event × shop × produit, sans minute — le plus gros poste, ~105 des
  164 Mo), curseur horaire rebranché sur les lignes minute de la courbe ouverte,
  dégraissage (`minute`/`minuteLocal`/doublon `revenue` supprimés des lignes summary).
  Reste (5.2, différé volontairement) : paniers de montage sans minute — ils portent
  TX/MIN, peak 15 min et first60 du panneau Shop Performance, qui exigent le grain
  minute ; à découpler après recette (~1/3 du volume restant).
- **Modules** : Analyse (chargement de montage, caches composables), api (space.api.js)
- **Fiches liées** : backend 144-01 (le versant serveur : OOM Render), backend 143-01 (cache
  Redis), 363-01 (chargement progressif — ce chantier le prolonge et corrige une de ses
  régressions), 361-01 (concurrence par endpoint)

## En clair

Pour afficher des totaux par match, par buvette et par article, la page Analyse télécharge
le détail **minute par minute** de 77 matchs (~164 Mo de données décompressées) et le garde
en mémoire en cinq exemplaires — l'onglet du navigateur monte à 1,9 Go. Or personne ne
regarde ce détail au chargement : il ne sert qu'à la courbe horaire d'UN match, qui a déjà
son propre chargement au clic. Le remède : télécharger des totaux (quelques Ko par match),
supprimer les copies en mémoire, et limiter à 2 requêtes lourdes à la fois pour tous les
chargeurs de la page.

## Symptôme (mesures 24/08 — HAR + Performance monitor)

- ~164 Mo de JSON décompressé au montage (105,6 Mo timeline + 58,4 Mo paniers, 54 events
  capturés) ; ~1,96 Mo/event timeline + ~1,08 Mo/event paniers.
- Onglet navigateur : 1,9 Go.
- Jusqu'à 8 requêtes batch simultanées (4 chargeurs `watch { immediate: true }` × pool de 2
  par endpoint, `space.api.js:225`) — le versant serveur est la fiche backend 144-01.

## Cause racine

1. **Grain transporté trop fin** : les consommateurs du chemin de montage ne lisent jamais
   `minute`/`minuteLocal` (11 consommateurs timeline recensés — granularités finales :
   global / par event / event×shop / par article / shop×article ; paniers : seul
   `sumShopTransactionRates` lit la minute, pour un min/max par shop).
2. **Cinq points de rétention simultanés** : cache HTTP LRU 30 (`space.api.js:133`), cache
   préprocessé non borné ×2 (`useAnalyseItemRecords.js:58`, `AnalyseView.vue:1121`), copies
   réconciliées, et `useShopPerformance.js:96-99` qui **re-télécharge et re-stocke** les deux
   endpoints. `clearCache()` seulement au changement d'espace (`AnalyseView.vue:2128-2131`),
   jamais au démontage (`:2095` ne réinitialise que les filtres Live).
3. **Préprocess qui gonfle** : `aggregateTimeline(groupBy:'shopProduct')` ne fusionne rien
   (même grain que le backend) et fait passer chaque ligne de 15 à 36 clés dont ~21
   mortes/alias (`timelineBucketing.js:390-440`).
4. **Régression du chantier 363-01** : `applyEvent` réassigne le cache par event → à chaque
   paquet reçu, `itemRecords` re-mappe TOUT l'accumulé (≈3,5×n allocations au lieu de n).

## Correctif (planifié — plan `dynamic-squishing-moon`, 25/08)

- **Étape 2 (garde-fous)** : file FIFO globale concurrence 2 pour TOUS les batchs
  (`space.api.js`), chunk `analyse-unmapped` 30 → 15 (`:637`) ; correction de la régression
  363-01 (réconciliation différée à complétude ou `itemRecords` incrémental) ; bandeau avec
  vraie `v-progress-linear` déterminée x/N (pas de spinner — progression réelle connue,
  règle « zéro valeur provisoire »).
- **Étape 3 (mémoire)** : `useShopPerformance` branché sur les caches des composables
  existants (plus de re-fetch) ; purge des caches à `onBeforeUnmount` + éviction des events
  hors périmètre ; projection du préprocess aux ~15 clés réellement consommées sur le chemin
  Analyse (fonction partagée avec Predict/Stockup — projection conditionnelle, pas de
  suppression sèche).
- **Étape 5 (livrée le 25/08 pour la timeline)** : `GET :id/event-timeline?granularity=summary`
  (grain event × shop × produit, dédup inter-writers conservée par minute en CTE interne,
  clause tag conteneur BUG-146-01 identique, cache Redis suffixé `:sum`) ; `space.api.js`
  et `useAnalyseItemRecords` consomment le summary (caches session distincts par
  granularité) ; `aggregateTimeline` accepte les lignes sans clé temporelle (un bucket
  par event × shop × produit) et lit `revenueHt` en repli. La courbe horaire garde son
  fetch minute séparé ; **curseur** : courbe ouverte + plage active → `itemLevelRecords`
  et la source timeline du panneau basculent sur `reconciledTimelineData` (lignes minute
  de la courbe, bornes datées = même périmètre qu'avant) ; courbe fermée → plage inerte
  (`skipMinute`). Paniers : INCHANGÉS au grain minute (voir Statut — 5.2 différé).
- Le CA par event basculera sur `Event.revenue` (décision Bertrand 25/08, fiche backend
  146-01) — cohérence Events Library par construction.

## Recette

1. Jean Bouin : DevTools Network → ≤ 2 requêtes batch en vol, payloads de montage divisés
   (~2 Mo/event → ~10-20 Ko/event).
2. Performance monitor : mémoire onglet très en dessous de 1,9 Go ; quitter la page libère.
3. Peinture progressive intacte (paquet par paquet), barre de progression x/N visible.
4. Courbe horaire ouverte : curseur filtre KPIs/donuts comme avant.

JLH
