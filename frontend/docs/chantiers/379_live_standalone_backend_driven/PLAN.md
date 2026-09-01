# Plan — Live autonome, sorti d'Analyse, calculs déplacés côté backend

Décision utilisateur (2026-09-01) : Live ne doit plus partager de code avec Analyse. Reconstruction
isolée, composants dédiés, avec le calcul final déplacé côté backend plutôt que recalculé côté
frontend à chaque poll. Analyse (`AnalyseView.vue`, 2733 lignes) n'est **pas touché** par ce chantier.

Inventaire fait avant tout code : lecture complète de `frontend/docs/modules/11_LIVE.md` (862 lignes,
conception + historique complet depuis 2026-07-20) et `backend/docs/api/LIVE_API_GUIDE.md` (contrepartie
backend). Ce qui suit part de cet état réel, pas d'une supposition.

## Ce qui existe déjà et peut être réutilisé tel quel

Le backend Live n'est **pas** à reconstruire — v1+v2 sont livrés et fonctionnent :

| Endpoint | Ce qu'il fait déjà côté backend |
|---|---|
| `GET /spaces/:id/live-status` | Détection "event live" (vente réelle < 30 min dans la fenêtre event), logique déjà backend, légère |
| `GET /spaces/:id/event-timeline` | Timeline temps réel, lit `WeezeventTransaction` en direct (pas de cache), déjà backend |
| `GET /spaces/:id/shop-details` | KPIs par shop (Revenue, POS Performance), `SpaceRevenueMinuteAgg` + RPC `get_space_shop_details`, caché 60s côté Redis |
| `GET /spaces/:id/transaction-baskets` | Répartition par catégories/paniers — endpoint DÉDIÉ, pas une dérivation frontend malgré ce qu'on pensait |
| `GET /spaces/:id/live/inventory` | Stock live, combine `StockLevel` (mouvements Logistic) + consommation ventes dérivée en temps réel (`deriveSalesRaw`/`explodeSalesToConsumption`) |

Composant frontend déjà largement découplé : `LiveInventoryPanel.vue` — "pur affichage + polling"
depuis le 2026-08-05 (§15 de 11_LIVE.md), plus aucune prop `eventId`/`eventName` ni logique
d'init. Probablement réutilisable presque tel quel dans le nouveau Live.

## Ce qui est encore calculé côté frontend (à déplacer backend)

1. **% Margin** — `menuItemCostMap` (coût catalogue) combiné au CA de `shop-details` côté client
   (`AnalyseView.vue`, `liveShopDetailsPoll`/`refreshLiveShopSnapshot`). À déplacer dans la réponse
   de `shop-details` ou un nouvel endpoint dédié Live.
2. **"Restant" inventaire** — `level − consumption`, calcul trivial mais fait côté front
   (`store/modules/logistics.js:88-99`, `api/endpoints/logistics.api.js:12-15`). L'endpoint renvoie
   les composants bruts par choix (pas de formule dupliquée avec Restock) — à trancher si Live doit
   vraiment avoir sa propre formule pré-calculée ou si la doc actuelle (Live-only downstream) permet
   de la donner sans risque de divergence avec Restock.
3. À vérifier en creusant le code (pas confirmé par la doc) : agrégation des KPIs globaux (Per Cap,
   Avg Spend/Tx) — `avgSpendPerTx`/`perCapita` sont déjà calculés backend depuis BUG-307-02
   (`aggregation.service.ts`), donc probablement déjà bon ; à re-vérifier lors de l'implémentation,
   pas supposé ici.

## Cause des bugs historiques du Live actuel — tous liés au partage avec Analyse

Onze bugs distincts documentés dans `11_LIVE.md` (§14, §16, §17, §18) viennent tous du même
mécanisme : `AnalyseView.vue` est UN SEUL composant avec un flag `isLive` posé un peu partout,
et chaque nouvelle fonctionnalité d'Analyse a dû être re-vérifiée/masquée pour ne pas fuiter en Live
(panneau de filtres, bandeau rouge, chips, bouton Rapport J+1, bootstrap catalogue relancé à
chaque tick...). Un Live 100% séparé élimine cette classe de bug entière par construction — il n'a
jamais accès aux widgets Analyse-only, donc rien à masquer.

## Todo, par ordre

### 1. 🔴 Backend — déplacer le calcul final là où c'est encore frontend

- [ ] `shop-details` (ou nouvel endpoint) : ajouter `marginPercent` déjà calculé (revenue − coût
      catalogue), au lieu que le front combine `menuItemCostMap` + revenue.
- [ ] `live/inventory` : décider si on ajoute un champ `remaining` pré-calculé (packed×upp+loose−consumed)
      en plus des composants bruts déjà exposés, ou si le calcul trivial reste front — trancher avec
      l'utilisateur avant de coder (pas une évidence, cf. doc §3.2 "pas de nouvelle formule à
      maintenir en double" avec Restock).
- [ ] Vérifier si un seul endpoint agrégé (`GET /spaces/:id/live/summary` : KPIs + timeline + baskets
      en un appel) réduit le nombre de round-trips par tick, ou si garder les endpoints séparés
      (`event-timeline`, `shop-details`, `transaction-baskets`, `live/inventory`) reste plus simple —
      décision à prendre avant d'écrire le frontend, impacte directement son architecture de polling.

### 2. 🟠 Frontend — nouveaux composants, zéro import d'AnalyseView.vue

- [ ] Nouveau composant orchestrateur (ex. `components/live/LiveView.vue`), branché sur la route
      `space-live` existante (remplace `AnalyseView.vue` comme cible).
- [ ] Sous-composants dédiés : `LiveHeader.vue` (badge/titre/édition event), `LiveKpiRow.vue`,
      `LiveTimelineChart.vue`, `LiveCategoryBreakdown.vue`, `LiveShopList.vue`.
- [ ] `LiveInventoryPanel.vue` : évaluer réutilisation quasi telle quelle (déjà découplé) vs
      déplacement dans le nouveau dossier `components/live/` pour cohérence de périmètre.
- [ ] Polling propre à Live (pas de réutilisation de `livePoll()`/`applyLiveScope()` d'Analyse) —
      logique simple, un seul composant à comprendre, pas de flag `isLive` à propager.
- [ ] Filtres Live : seulement PDV/Zones/Type PDV/Menu items (les seuls pertinents, cf. 11_LIVE.md
      §16) — pas de composant `FilterPanel.vue` partagé à retoucher, juste ce dont Live a besoin.

### 3. 🟡 Bascule

- [ ] Router : `space-live` pointe vers le nouveau composant au lieu d'`AnalyseView.vue`.
- [ ] Test de bout en bout avec le simulateur de vente (`LiveSaleSimulatorWidget`, run auto BullMQ)
      avant toute bascule en production — voir séquence de test ci-dessous.
- [ ] Une fois validé : décider si le code de masquage Live dans `AnalyseView.vue`/`FilterPanel.vue`
      (§16-18 de 11_LIVE.md) est nettoyé (dette qui n'a plus de raison d'exister) ou laissé tel quel
      par prudence — à trancher avec l'utilisateur, pas une évidence vu "monorepo dangereux".

## Séquence de test proposée (avant tout code)

Avant d'écrire le premier composant, valider que la chaîne actuelle (backend inchangé) fonctionne
réellement en direct : lancer un run de simulation (`simulateSale`/`LiveSaleSimulatorWidget`, déjà
en place, écrit dans la même table que Weezevent réel, déclenche la même agrégation) sur un espace
de test, observer `live-status`/`event-timeline`/`shop-details`/`transaction-baskets`/`live/inventory`
répondre correctement en conditions réelles. Ça confirme ou infirme les hypothèses de cet inventaire
avant d'investir dans la reconstruction.

## Références

- `frontend/docs/modules/11_LIVE.md` — conception complète + historique de tous les bugs liés au
  partage avec Analyse (§14, §16-18).
- `backend/docs/api/LIVE_API_GUIDE.md` — contrat des endpoints backend existants.
- `backend/src/features/logistics/logistics.service.ts` (`simulateSale`, `simulation-run.processor.ts`)
  — outil de simulation déjà en place pour tester ce chantier en conditions réelles.
