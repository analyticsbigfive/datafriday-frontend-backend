# BUG-363-01 — Analyse : écran figé ~110 s sur les gros espaces → chargement progressif + perfs Lighthouse

- **Statut** : corrigé (2026-08-24) — à recetter sur Jean Bouin
- **Modules** : analyse (space.api, useAnalyseItemRecords, useTransactionBaskets,
  AnalyseView), WorkspaceAppHeader, DonutChartCard
- **Fiches liées** : backend 143-01 (cache Redis des endpoints batch — l'autre moitié du
  chantier), 361-01 (concurrence des paquets, inchangée à 2), 350-01/358-01 (zéro valeur
  provisoire — contrat renforcé ici)

## En clair

Sur un espace à 77 matchs (Jean Bouin), la page restait figée ~110 secondes sans aucun
feedback, puis tout apparaissait d'un coup. Désormais : les matchs les plus récents — ceux
qu'on regarde — arrivent en premier, la page se remplit au fur et à mesure, et un bandeau
« Chargement des évènements : x/77 » montre la progression. Les indicateurs globaux (CA,
transactions…) gardent leur squelette jusqu'à ce que TOUT soit chargé : on n'affiche jamais
un total partiel qui bougerait sous les yeux (règle « zéro valeur provisoire »).

## Symptôme

- Jean Bouin : 5-6 paquets `event-timeline` séquencés (concurrence 2, BUG-361-01), 7-27 s
  chacun côté backend → rien à l'écran avant la fin du LOT ENTIER (~110 s).
- Lighthouse 24/08 (`frontend/lighthouse/localhost_2026-08-24_21-07-42.{html,json}`) :
  perf 0.32, LCP 8,9 s, TBT 4 470 ms ; reflow forcé 753 ms (WorkspaceAppHeader), animation
  skeleton non composité (21 éléments), CLS 0.102, preflights CORS répétés,
  bootstrap.min.css 99,5 % inutilisé.

## Cause racine

`getSpaceEventTimelineBatch`/`getSpaceTransactionBasketsBatch` créaient UNE promesse pour
tout le lot : les composables ne patchaient leur cache qu'à la résolution finale. L'ordre
des events suivait `filteredEvents` (pas les plus récents d'abord).

## Correctif

- `space.api.js` : `_fetchBatchChunked` notifie chaque paquet terminé (`onChunk`) ; les
  deux fonctions batch créent une promesse DÉDIÉE par event, résolue dès que SON paquet
  atterrit, et acceptent une option `onEvent(eventId, rows)`. Échec du batch → rejet des
  promesses restantes (sémantique d'erreur inchangée pour les awaiters concurrents).
- `useAnalyseItemRecords` / `useTransactionBaskets` : eventIds triés par date décroissante
  avant l'appel ; patch du cache PAR EVENT via `onEvent` (set `processed` contre les
  doublons ; en échec, seuls les events non livrés sont marqués `[]`).
- **Contrat renforcé** : `useAnalyseItemRecords.sourceState` ne publie plus 'ready' dès le
  premier record — uniquement quand TOUS les events scopés sont tentés (même règle que les
  paniers, décision JLH 24/08). Sinon le remplissage progressif ferait publier aux KPI des
  sommes partielles (interdit BUG-350-01).
- `useAnalyseUnmapped` : **volontairement laissé en patch de fin de lot** — son bandeau
  agrège directement le cache sans gating 'ready', un patch progressif y afficherait des
  montants non mappés provisoires.
- Indicateur : `loadProgress {loaded,total}` exposé par `useAnalyseItemRecords`, bandeau
  « Chargement des évènements : x/N » dans AnalyseView (clé i18n
  `anEventsLoadingProgress`), visible tant que `sourceState === 'loading'`.

### Volet Lighthouse

- `WorkspaceAppHeader.vue` : la lecture `scrollTop` au montage (753 ms de reflow forcé)
  passe en `requestAnimationFrame` ; `.v-main` mis en cache ; événements scroll coalescés
  par frame.
- `DonutChartCard.vue` : shimmer `background-position` (non compositable, 21 éléments
  repeints en continu) → voile en pseudo-élément animé en `transform: translateX`
  (composité GPU) ; rangées du skeleton de légende calées sur les 28px des `v-list-item`
  réels → CLS résorbé.
- CORS `Access-Control-Max-Age: 86400` côté backend (fiche 143-01).
- `bootstrap.min.css` (264 KB, 99,5 % inutilisé) : import global `main.js`, classes
  utilisées dans 20+ fichiers (menu-fb, integration, logistic…) — retrait NON envisageable
  sans refonte ; question posée à Bertrand (purge/scoping), voir QUESTIONS_A_BERTRAND.
- Non actionnable en dev : minification, cache-TTL assets, source maps (artefacts du build
  dev ; la prod build + Cloudflare les gère).

## Recette

1. Jean Bouin, cache vide : le panneau Events Performance se remplit au fil de l'eau, les
   matchs récents d'abord ; bandeau x/77 qui progresse.
2. KPI globaux : squelette jusqu'au bout, puis valeurs définitives — JAMAIS une somme qui
   bouge.
3. Live : re-poll 15 s intact (refresh bypassCache inchangé).
4. `pnpm test:unit` — spaceApiTimelineBatch, analyseKpiSourceGating verts.

JLH
