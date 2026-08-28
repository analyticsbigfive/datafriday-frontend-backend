# BUG-366-01 — EventPredict : la timeline de prédiction perd `minuteLocal` → inputs « 00:00 / 23:59 » sans date, après-minuit trié en tête de courbe

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Event Predict / Timeline
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-25
- **Fichiers** : `src/composables/usePredictiveTimeline.js`, `src/utils/timelineBucketing.js:576`

## Symptôme

Sur Event Predict (mode prédiction, ex. Nantes-Nancy 07/09/2026 21:00) :

- les deux inputs de plage horaire de la timeline affichent « 00:00 » et « 23:59 » nus, alors que
  la même timeline côté Analyse affiche « 22/08 13:58 » (date + heure) ;
- l'axe X démarre par le morceau d'après-minuit (00:00 → 01:03) puis saute à 21:09 → 23:45 : la
  queue de soirée est triée **en tête** de courbe au lieu de la fin.

Le chart est pourtant le même composant partagé (`EventTimelineChart.vue`) — il sait déjà rendre
`DD/MM HH:MM` (`labelAtPct`, BUG-351-01) quand les records portent une minute datée.

## Cause racine

Le mécanisme daté de BUG-351-01 (`minuteLocal` = `YYYY-MM-DDTHH:MM`, clé de bucket ET de tri) ne
survivait pas au pipeline de prédiction. Le backend envoie bien `minuteLocal` sur
`GET /spaces/:id/event-timeline` (`spaces.service.ts:1643,1687`), mais
`src/composables/usePredictiveTimeline.js` le perdait en 4 endroits :

1. `mapRestTimelineRow` — la normalisation des lignes REST omettait `minuteLocal`. Effet
   secondaire grave : `minutesSinceShow(r.minuteLocal ?? r.minute, …)` recevait toujours une heure
   murale nue → une vente à 00:30 pour un coup d'envoi 21:00 se lisait **−1230 min** au lieu de
   +210 (la correction datée de `timelineBucketing.js:159` ne s'appliquait jamais aux lignes REST).
2. Branche locale-granulaire de `fetchEventTimeline` — objet construit sans `minuteLocal`.
3. Court-circuit direct-prédictif (mock pré-calibré) — idem.
4. Agrégation finale : clé `${minute}_${shopId}_${identifier}` (heure murale nue → deux ventes à
   la même heure murale sur des jours différents fusionnaient silencieusement) et littéraux
   `agg`/`predicted` sans `minuteLocal`.

Sans clé datée, `EventTimelineChart` retombe sur les labels `HH:MM`, triés lexicographiquement →
« 00:00 » en tête, et `labelAtPct` ne peut pas préfixer la date.

Compagnon : `computeWindowRatios` (`timelineBucketing.js:576`) évaluait la fenêtre sur `r.minute`
seul (contrairement à `buildTimelineFilter:536`) — une fenêtre datée franchissant minuit
(21:00 → 01:00 J+1) aurait vidé la part après-minuit des KPI fenêtrés.

## Correction

2026-08-25, branche `fix/event-predict-deeplink-event-passe` :

- Nouveau helper exporté `datedKeyForEvent(eventDate, absMinutes)` à côté de `relativeDatedKey` :
  même arithmétique de jours (J−1/J0/J+1) mais ancrée sur la **vraie date de l'event prédit**
  (parsée par `parseEventDate` de `dateFr`, Y/M/D locaux) — le chart affiche la date telle quelle,
  une base synthétique 2000-01-01 aurait montré « 01/01 21:00 ». Repli sur `relativeDatedKey` si
  la date est imparsable. `relativeDatedKey` reste intact (la moyenne Analyse en dépend,
  `analyseTimelineAverage.js:107`).
- Propagation `minuteLocal: r.minuteLocal ?? null` aux 3 mappings (sites 1-3).
- Réalignement : `minuteLocal: datedKeyForEvent(event.eventDate, recMinutes + timeOffset)`.
- Agrégation : clé `${record.minuteLocal || record.minute}_…` + `minuteLocal` conservé dans `agg`
  et dans la sortie `predicted`.
- `computeWindowRatios` : `isMinuteInRange(r.minuteLocal ?? r.minute, range)`.

Aucun changement de `EventTimelineChart.vue` ni du backend.

## Risque de régression / à surveiller

- Tests ajoutés : `tests/unit/timelineAlignment.spec.js` (describe `datedKeyForEvent` : ancrage,
  minuit, DD/MM/YYYY, rollover fin de mois, repli), `tests/unit/predictiveTimelinePreprocess.spec.js`
  (fenêtre datée franchissant minuit dans `computeWindowRatios` ; `preprocessTimelineRecords`
  préserve `minuteLocal`, trie l'après-minuit en fin, garde les buckets même-heure/jours-différents
  distincts).
- Vérif manuelle : EventPredict → inputs « 07/09 … » datés ; slider à cheval sur minuit → KPI ne
  s'effondrent pas ; Analyse strictement inchangée.
- Plages sauvegardées à l'ancien format `HH:MM` : continuent de fonctionner (repli heure murale
  d'`isMinuteInRange`). Les nouvelles bornes embarquent la date réelle de l'event.
- Éclatement attendu de buckets autrefois fusionnés à tort (par jour) : totaux Σ-préservés.

## Références

- BUG-351-01 (mécanisme des minutes datées, côté Analyse) — ce bug est sa complétion côté
  pipeline de prédiction.
- BUG-140-01 (`api-datafriday-staging`, `backend/docs/bugs/140_01_…`) : le décalage « match 14h,
  courbe à 16h » observé au même moment sur Analyse (Nantes-Rodez 22/08) est un problème de
  DONNÉES (+2h stockées), pas de ce pipeline — fix code déjà mergé (`cf661ed`), reste le ré-import
  CSV + ré-agrégation manuels par Jean-Luc.

JLH
