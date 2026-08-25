# BUG-147-01 — Fenêtre d'attribution : la slide dit « minuit → heure de fin », pas « portes ±2 h » — règle unifiée lecteur/writer + frontière au voisin

- **Statut** : 🟡 Corrigé côté code (2026-08-25) — non testé en conditions réelles ; même train de
  livraison que 146-01 (SQL + ré-agrégation, cf. `INSTRUCTIONS_BACKEND_2026-08-25.md`).
- **Sévérité** : 🟠 Majeur (fenêtres d'attribution fausses → CA et timeline EventPredict faux,
  silencieusement)
- **Domaine** : Analyse & agrégation / Event Predict
- **Découvert le** : 2026-08-25 — signalement JLH « EventPredict : les dates et heures des
  événements sont incorrectes » (PFC-Nice 30/08/2026, portes 13:30 / show 15:00 : timeline
  prédictive bornée 12:53–18:42 au lieu de couvrir la fenêtre de la spec), recoupé avec la slide
  « Transactions prises en compte par Event » refournie comme référence.
- **Fichiers** : `backend/src/shared/utils/event-window.util.ts`
  (`resolveEventTransactionWindow`, nouveau), `backend/src/features/spaces/spaces.service.ts`
  (`resolveEventSalesScope`), `backend/src/features/aggregation/aggregation.service.ts`
  (`resolveEventWindow`, `executeProcessEvents`)
- **Fiches liées** : 146-01 (volet horaire invalidé par cette fiche ; volet tag conteneur
  conservé), 145-01 (double comptage chiffré), frontend 339-02 (règle d'origine minuit→fin +
  voisinage), frontend 360-02 (suppression de portes±buffer côté writer, règle Ulrich), frontend
  351-01 (minutes datées de la timeline). Question Bertrand : Q65 (amendée).

## En clair

La slide de Bertrand montre, pour chaque match, une bande « Transactions prises en compte » qui
démarre à **00h00 du jour du match** et s'arrête à son **heure de fin** (même après minuit) ; quand
un match en suit un autre, la bande du second démarre **à l'heure de fin du premier**. Les boîtes
« Ouverture des portes 19h00 » sur la slide sont des repères visuels, pas le début de la bande —
c'est l'erreur de lecture de la fiche 146-01, qui en avait déduit « portes → fin » puis implémenté
« portes −2h → fin +2h » côté Analyse. Conséquence visible : les ventes entre minuit et
« portes −2h » n'étaient jamais rattachées aux matchs, donc absentes des données passées
d'EventPredict — d'où une timeline prédictive tronquée. On remet la règle de la slide, une seule
fois, dans un utilitaire partagé par l'agrégation (writer) et l'Analyse (lecteur), pour que les
deux ne divergent plus jamais (les trois CA différents de la fiche 145-01 venaient exactement de
cette divergence).

## La règle (référence : slide « Transactions prises en compte par Event »)

Fenêtre de transactions d'un event :
1. **Début** : minuit LOCAL (fuseau du Space) du jour de début (`eventStartDate ?? eventDate`).
   Jamais l'heure d'ouverture des portes (BUG-360-02 : ventes hospitalité dès 13h58 pour des
   portes à 19h00).
2. **Fin** : heure de fin déclarée (`eventEndTime`, posée sur le jour de fin — minuit franchi
   autorisé : PFC-RC Lens 14/02, fin 02h00 → borne le 15/02 à 02h00). Repli si aucune fin
   déclarée : journée calendaire locale pleine (minuit suivant le jour de fin — règle Ulrich
   25/08, pas d'heuristique).
3. **Frontière** : si un voisin finit (fin DÉCLARÉE) le jour où l'event commence, la fenêtre
   démarre à cette fin (slide : SFP-Toulouse démarre le 15/02 à 02h00, pas à minuit). Un voisin
   sans fin déclarée ne borne pas ; un voisin finissant après l'event non plus (sinon deux events
   le même jour se videraient mutuellement).

Le filtre « intégration du club » de 146-01 (tag conteneur, mode `container-range`,
`Event.weezeventEventId`) est **inchangé** — seule la composante horaire de la règle change.

## Implémentation (2026-08-25)

- `event-window.util.ts` : nouveau `resolveEventTransactionWindow(event, timeZone, neighbors)`
  (+ `declaredEndOf`, `startOfNextLocalDay`, type `EventDayFields` tolérant les ISO strings des
  caches Redis). Source unique de la règle.
- `spaces.service.ts` (`resolveEventSalesScope`) : suppression de la branche « portes ±2h »
  (146-01) ET de l'ancienne branche historique (`preciseEndOf` avec repli `showTime`) → appel du
  helper pour tout Event DataFriday. Repli WeezeventEvent (CUID passé directement) inchangé
  (jour calendaire +1). Gardes `windowStart >= windowEnd` et `MAX_EVENT_SPAN_DAYS` inchangées.
  `sessions` n'est plus lu (retiré du select/cache salesscope).
- `aggregation.service.ts` (`resolveEventWindow`) : appel du même helper pour les modes `range`
  et `container-range` (le mode `exact` ne bouge pas). Nouveauté : la **frontière au voisin
  existe désormais côté writer** — `executeProcessEvents` charge tous les events de l'espace
  (même en re-agrégation incrémentale, le voisin peut être hors batch) et les passe au calcul.
  Sans elle, le repli sans tag (CSV Digifood) re-créait le double comptage 145-01 sur les jours
  à double affiche.

### Décisions actées

- **Ancre minuit LOCAL** (pas UTC) : alignement sur le writer (fb2bb604, règle Ulrich) — les
  tests lecteur 339-02 sont passés de `T00:00:00Z` à `T23:00:00Z` (Paris, hiver).
- **Fin déclarée coupe aussi un event d'un seul jour** (la slide dit « heure de fin », sans
  condition multi-jours) — c'est ce qui permet à deux events le même jour de se partager la
  journée (test « après-midi / soir »). Divergence assumée avec la formulation Ulrich de 360-02
  (« seul le dernier jour d'un event multi-jours peut finir avant 23h59 ») : un event mono-jour
  avec `eventEndTime` saisi est maintenant coupé à cette heure. Les ventes entre l'heure de fin
  et minuit restent non rattachées — voulu par la slide, chiffre visible qui peut baisser.
- **`showTime` ne sert plus de repli de fin** côté lecteur (l'ancien `preciseEndOf` l'utilisait) :
  un event sans `eventEndTime` obtient la journée pleine, comme au writer.
- Les marges ±2h (constantes staffing) disparaissent de l'attribution — la question résiduelle de
  146-01 est tranchée par la slide. Elles restent en usage dans le staffing (horaires d'équipe),
  qui est un autre sujet.

## Recette

1. Tests unitaires : `npx jest src/features/aggregation src/features/spaces` — scénario slide
   (PFC 14/02 00:00 local → 15/02 02:00 ; SFP 15/02 02:00 → 16/02 03:00), double affiche même
   jour sans tag → fenêtres disjointes, voisin hors batch en incrémental, portes saisies →
   ignorées. 128/129 verts (l'échec `findAll › paginated spaces` est préexistant et sans
   rapport, cf. INSTRUCTIONS §fin).
2. Après ré-agrégation (JLH, INSTRUCTIONS_BACKEND_2026-08-25.md) : requête « zéro chevauchement
   de plages » = 0 ligne ; les chiffres de recette 146-01 sont à re-mesurer (ils avaient été
   établis sous portes −2h → fin +2h).
3. EventPredict : la timeline des events passés couvre minuit → fin (les ventes matinales
   apparaissent, l'axe s'étire à gauche — attendu). Purge Redis `spaces:evtimeline:*` au
   déploiement, sinon les réponses cachées (TTL long pour les events passés) servent l'ancienne
   fenêtre.

JLH
