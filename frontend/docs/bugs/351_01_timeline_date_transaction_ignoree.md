# BUG-351-01 — Timeline : la date de transaction est ignorée, les ventes d'après minuit remontent en tête de courbe

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (fausse la lecture des ventes ET le calage d'Event Predict)
- **Domaine** : Analyse & agrégation / Event Predict
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (backend + frontend)
- **Découvert le** : 2026-08-21 (PDF « Analyse - Inventaire - Timeline », page 3)
- **Fichiers** :
  - `backend/src/features/spaces/spaces.service.ts` (`getEventTimelineBatch`)
  - `frontend/src/utils/timelineBucketing.js`
  - `frontend/src/composables/usePredictiveTimeline.js`
  - `frontend/src/composables/analyseTimelineAverage.js`, `useAnalyseTimeline.js`
  - `frontend/src/components/analyse/charts/EventTimelineChart.vue`

## Symptôme

PDF du 2026-08-21, exemple **SFP-Toulouse du 15/02/2026** (espace Stade Jean Bouin) : l'ouverture
des portes est à 19h, mais la courbe **démarre à minuit**, se poursuit jusqu'à 1h du matin, puis
s'interrompt et reprend d'un bloc à 19h. Les transactions de minuit à 1h ont en réalité eu lieu
**dans la continuité de l'événement, le lendemain**.

Demande jointe : afficher **la date ET l'heure** de début et de fin de la fenêtre, pas seulement
l'heure (les deux sélecteurs affichaient `00:00` et `23:59`).

Précision de l'owner (JLH, même jour) sur le volet Event Predict : les événements de référence
doivent être repris **en heures relatives à leur propre heure de show**. Une transaction survenue
5 h après le coup d'envoi d'un match de référence doit peser 5 h après le coup d'envoi du match
prédit — coup d'envoi 21h ⇒ **le lendemain à 02:00**, et non à 02:00 le jour même.

## Cause racine

Quatre points perdent la date, ou la rembobinent. Aucun n'est un accident isolé : toute la chaîne
raisonne en « minutes depuis minuit ».

| Où | Ce qui se passe |
|---|---|
| `spaces.service.ts` (requête de `getEventTimelineBatch`) | `TO_CHAR(tz."minuteLocal", 'HH24:MI') AS minute` : la date est jetée à la sortie SQL, et `ORDER BY … minute ASC` trie donc « 00:30 » avant « 19:00 ». |
| `timelineBucketing.js` `parseMinuteToken` | rend des minutes depuis 00:00, plafonnées à une journée. |
| `timelineBucketing.js` `formatMinute` | normalise `% (24 * 60)` : tout ce qui dépasse 24 h revient au début. |
| `usePredictiveTimeline.js` `alignPastMinute` | `(((recMinutes + timeOffset) % 1440) + 1440) % 1440` — **exactement** le cas décrit par l'owner : +5 h après le coup d'envoi repasse en tête d'axe. |

L'alignement sur le coup d'envoi existait déjà et son intention était juste
(`eventOffsets = targetMinutes − parseTime(sessions[0].showTime)`) : c'est le modulo qui le cassait.
Même défaut dans `analyseTimelineAverage.js`, qui réutilise `alignPastMinute` pour la courbe moyenne.

## Correction

**Modèle retenu** : une seule grandeur circule, **les minutes écoulées depuis le coup d'envoi**.
Négative avant le coup d'envoi (préventes), supérieure à 1440 quand l'événement déborde de minuit.
La conversion en heure murale ne se fait qu'à **l'affichage** — le libellé reste donc « 02:00 »,
c'est l'**ordre** qui change.

- **Backend** : la requête expose `minuteLocal` (`YYYY-MM-DDTHH:MM`, heure murale locale de
  l'espace) **en plus** de `minute`, et trie sur `tz."minuteLocal"`. `minute` est conservée telle
  quelle : aucun consommateur existant n'est impacté.
- **Socle partagé** (`timelineBucketing.js`) : `parseDatedMinute`, `bucketDatedMinute` et
  `minutesSinceShow` sont ajoutées ; `aggregateTimeline` **clé et trie** sur la minute datée quand
  elle existe (deux ventes à 00h30 de deux jours différents ne fusionnent plus), et transporte
  `minuteLocal` jusqu'aux points de sortie. `isMinuteInRange` et `buildTimelineFilter` comparent des
  instants quand la fenêtre est datée. Les fonctions historiques gardent leur comportement exact
  sans date — c'est ce qui rend la bascule sûre pour Stockup, Inventaire et Predict.
- **Heuristique de jour** (`minutesSinceShow`) : quand le point est daté mais que le coup d'envoi
  n'est connu qu'à l'heure (« 21:00 »), un écart inférieur à **−6 h** est relu comme appartenant au
  lendemain. 02:00 pour un coup d'envoi à 21:00 → +5 h ; 18:00 pour le même coup d'envoi reste
  −3 h (prévente). Sans cette règle il aurait fallu propager un coup d'envoi daté dans toute la
  chaîne Analyse et Event Predict.
- **Event Predict** : `alignPastMinute` perd son modulo, et un nouvel export `relativeDatedKey`
  porte le jour (J−1 / J0 / J+1) sur une base de date synthétique — tous les événements de référence
  étant reprojetés sur la MÊME horloge cible, seul l'ordre relatif compte.
- **Analyse** : le graphe indexe ses points sur la clé datée et n'affiche que l'heure murale en
  étiquette d'axe ; les deux bornes de la fenêtre affichent **date + heure** (« 15/02 19:00 ») et
  sont émises au parent sous forme de clés datées.

## Risque de régression / à surveiller

- Un événement qui **ne franchit pas minuit** doit rendre exactement la même courbe qu'avant : le
  chemin sans date est inchangé, et les tests d'origine (`timelineAlignment.spec.js`) passent sans
  modification de leurs assertions.
- Deux tests portaient le mot « modulo 1440 » dans leur intitulé : ils vérifiaient le **libellé**,
  qui reste une heure murale. Renommés, avec trois cas ajoutés sur l'ordre chronologique.
- L'heuristique des −6 h : un événement dont les préventes ouvrent plus de 6 h avant le coup
  d'envoi verrait ces ventes basculer au lendemain. Non observé sur les espaces réels ; le cas
  disparaît dès que le coup d'envoi est transmis daté.
- **Fenêtre de lecture non touchée** : quelles transactions sont sélectionnées relève de
  `resolveEventSalesScope` (resserrée sur l'heure de fin réelle depuis BUG-339-02) et de la
  [Question #49](../QUESTIONS_A_BERTRAND.md), qui reste ouverte. Cette fiche corrige **le placement**
  des points, pas leur sélection.

## Vérification

- `frontend` : `npx jest tests/unit/timelineBucketing.spec.js tests/unit/timelineAlignment.spec.js`
  → 37 verts, dont les nouveaux cas (franchissement de minuit, prévente, fenêtre datée, non-fusion
  de deux jours).
- Recette écran : Analyse sur **SFP-Toulouse du 15/02/2026** — la courbe doit démarrer à 19:00 et
  finir vers 01:00 le 16/02, sans pic isolé à minuit en tête d'axe, et les bornes doivent afficher
  la date.
- Event Predict : match prédit à 21h, match de référence avec une vente à +5 h → le point tombe le
  lendemain à 02:00.

## Références

- PDF « Analyse - Inventaire - Timeline » (2026-08-21), page 3.
- [BUG-339-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) (fenêtre resserrée
  sur l'heure de fin réelle), [Question #49](../QUESTIONS_A_BERTRAND.md).

JLH
