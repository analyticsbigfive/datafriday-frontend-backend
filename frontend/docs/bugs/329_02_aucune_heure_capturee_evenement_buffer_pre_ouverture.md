# BUG-329-02 — `executeProcessEvents` ignore `sessions[0].doorsOpening`/`eventEndTime` : la fenêtre d'agrégation reste calendaire alors qu'un mécanisme d'heure réelle + buffer existe déjà (Staffing)

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/event-aggregation-window-precision`)
  — implémenté dans `AggregationService.resolveEventWindow()`, voir Correction.
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation / RH & staffing
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-14 — signalé par KOUAME Ulrich : "je sais que les premières [ventes]
  peuvent commencer 1 ou 2h avant l'heure d'ouverture, tu dois pouvoir prendre en compte toutes mes
  demandes car c'est des cas réels" ; correction du diagnostic après sa relance explicite ("tu es
  sûr que sur les events qu'on crée sur DataFriday il y a pas opendoor ou un truc de ce genre ?").
- **Fichiers** :
  - `backend/src/features/staffing/staffing.service.ts:60-178` (`combineDayAndLocalTime`,
    `parseEventSessions`, `getEventContext` — le mécanisme qui EXISTE déjà et qu'il faut réutiliser)
  - `backend/src/features/staffing/staffing-calculator.service.ts:40-41`
    (`DEFAULT_OFFSET_OPEN_MINUTES = -120`, `DEFAULT_OFFSET_CLOSE_MINUTES = 120`)
  - `backend/src/features/aggregation/aggregation.service.ts:248-252` (`executeProcessEvents` — ne
    lit ni `sessions`, ni `eventEndTime`, ni aucun offset)
  - `frontend/src/utils/eventSessions.js` (miroir frontend de `parseEventSessions`)
  - `backend/prisma/schema.prisma` — `Event.sessions` (String, JSON sérialisé), `Space.timezone`
    (`String? @default("Europe/Paris")`)

## Symptôme

Voir BUG-328-02. `executeProcessEvents` construit sa fenêtre uniquement à partir de
`event.eventDate`/`event.eventEndDate` (minuit UTC, sans heure) — aucune vente antérieure à minuit
du jour de l'event, même 5 minutes avant, aucune heure d'ouverture réelle prise en compte.

## Cause racine — correction du diagnostic initial

**Il existe bien un "doors opening" réel sur l'`Event` DataFriday**, et un mécanisme complet, déjà
en production, pour le combiner à une date et lui appliquer un buffer :

- `Event.sessions` (String, JSON sérialisé côté back — `events.service.ts:375,488`,
  `JSON.stringify(dto.sessions)`) porte un tableau `[{doorsOpening: "18:30", showTime: "20:00"},
  ...]`, saisi par l'utilisateur dans `CreateEventDialog.vue`/`EventFormDrawer.vue` (champs
  `type="time"` par session, déjà vus dans la version précédente de cette fiche — je les avais
  identifiés mais sous-estimé leur usage réel en aval).
- `StaffingService.getEventContext()` (`staffing.service.ts:142-178`) résout **déjà** un vrai
  instant UTC d'ouverture et de fermeture à partir de ça :
  ```ts
  const sessions = parseEventSessions(event.sessions);
  const doorsOpen = combineDayAndLocalTime(startDay, sessions[0]?.doorsOpening, timezone) ?? startDay;
  const doorsClose = combineDayAndLocalTime(endDay, event.eventEndTime ?? sessions[last]?.showTime, timezone)
    ?? new Date(doorsOpen.getTime() + DEFAULT_EVENT_DURATION_HOURS * 3_600_000);
  lineStart: new Date(doorsOpen.getTime() + DEFAULT_OFFSET_OPEN_MINUTES * 60_000),   // portes − 2h
  lineEnd:   new Date(doorsClose.getTime() + DEFAULT_OFFSET_CLOSE_MINUTES * 60_000), // fin + 2h
  ```
  `combineDayAndLocalTime(day, hhmm, timeZone)` combine le jour calendaire (minuit) avec un
  `HH:mm` **dans le fuseau du Space** (`Space.timezone`, défaut Europe/Paris) et corrige le
  décalage été/hiver via `Intl.DateTimeFormat` — implémentation déjà correcte et testée en
  production sur le module RH.
  `DEFAULT_OFFSET_OPEN_MINUTES = -120` / `DEFAULT_OFFSET_CLOSE_MINUTES = 120`
  (`staffing-calculator.service.ts:40-41`) : **un buffer de 2h avant l'ouverture et 2h après la fin
  existe déjà comme valeur par défaut assumée**, pour exactement le même besoin métier que celui
  exprimé ("les premières ventes commencent 1-2h avant l'ouverture") — appliqué au staffing, jamais
  à l'agrégation des ventes.
- Ce même champ `doorsOpening` est aussi consommé par `analyse.js`/`FilterPanel.vue` (filtre par
  horaire d'ouverture) et `usePredictiveTimeline.js`/`EventPredictView.vue` (alignement de
  timelines prédictives sur `showTime`) — c'est une donnée mûre, utilisée à plusieurs endroits du
  produit, pas un champ mort.

**Le vrai gap n'est donc pas "aucune heure n'existe"** (diagnostic initial erroné, corrigé ici) :
**c'est que `executeProcessEvents` ne réutilise pas ce mécanisme déjà écrit et déjà éprouvé.** Il
reste deux limites réelles à documenter :
1. `sessions[0].doorsOpening` est **optionnel** — si l'utilisateur ne l'a pas renseigné, il faut un
   repli. **Décision prise suite à la relance d'Ulrich (2026-08-14)** : plutôt qu'un repli sur le
   jour calendaire brut, dériver la fenêtre des transactions réellement observées — voir "Repli
   sans `doorsOpening`" ci-dessous.
2. `combineDayAndLocalTime`/`parseEventSessions` sont dupliqués (au moins) entre
   `staffing.service.ts` (backend) et `eventSessions.js`/`EventPredictView.vue` (frontend) sans
   module partagé unique — à factoriser plutôt qu'ajouter une 3ᵉ copie dans
   `aggregation.service.ts`.

## Repli sans `doorsOpening` — dérivé des transactions réelles (décision 2026-08-14)

Proposition d'Ulrich, retenue : ne pas retomber sur le jour calendaire brut, mais dériver la
fenêtre de l'activité réellement observée, en deux passes :

1. **Scan large** (volontairement généreux, ex. `eventDate − 1 jour` à `eventEndDate (ou eventDate)
   + 1 jour`) sur les transactions déjà filtrées par location/intégration de cet event — juste pour
   ne rater aucune transaction en bordure (ex. ventes qui débordent après minuit, exactement le cas
   "transactions qui dépassent 23h59" cité).
2. **Resserrement** : dans ce scan large, calculer `MIN(transactionDate)` et `MAX(transactionDate)`
   des transactions réellement rattachées, puis fixer la fenêtre définitive à `[MIN − buffer, MAX +
   buffer[` (buffer 1-2h, même ordre de grandeur que le buffer `doorsOpening`) au lieu de garder tout
   le scan large. Chaque event obtient ainsi une fenêtre adaptée à son propre rythme de vente réel,
   sans dépendre d'une saisie manuelle.

**Limite qui subsiste, à ne pas perdre de vue** : cette méthode répond à "quelle marge avant/après",
pas à "à qui appartient cette transaction si deux events sont proches dans le temps". Si les ventes
tardives d'un event et les ventes précoces du suivant se chevauchent réellement, le `MIN`/`MAX` de
chacun peut encore capter la même transaction des deux côtés. C'est pour ça que ce repli reste
secondaire par rapport à BUG-330-02 (`eventId` exact, sans ambiguïté possible) — il ne s'applique
qu'aux transactions qui n'ont pas cette clé, avec un arbitrage à définir en cas de conflit résiduel
(assigner à l'event le plus proche, ou signaler le conflit plutôt que de compter deux fois — voir
BUG-328-02).

## Correction

Corrigée en code le 2026-08-14 (branche `fix/event-aggregation-window-precision`) :

1. `combineDayAndLocalTime`/`parseEventSessions`/`DEFAULT_EVENT_DURATION_HOURS` extraits vers
   `backend/src/shared/utils/event-window.util.ts`. `staffing.service.ts` importe désormais ce
   module au lieu de sa propre copie (comportement inchangé, duplication supprimée).
2. `AggregationService.resolveEventWindow()` (nouvelle méthode privée,
   `aggregation.service.ts`), appelée par `executeProcessEvents` pour chaque event, dans l'ordre :
   lien exact (`weezeventEventId`, voir BUG-330-02) → `doorsOpen ± DEFAULT_OFFSET_OPEN/CLOSE_MINUTES`
   (mêmes constantes que `StaffingService`, importées de `staffing-calculator.service.ts`) → repli
   dérivé des transactions non liées observées (`MIN`/`MAX` sur un scan large ± 90 min) → repli
   historique (jour calendaire) si aucune transaction non liée trouvée.
3. Buffer du repli dérivé fixé à 90 minutes (même ordre de grandeur que le buffer `doorsOpening`
   ±120 min) — **valeur choisie, pas encore validée par Bertrand**, à ajuster si besoin.
4. Tests ajoutés dans `aggregation.service.spec.ts` (describe dédié "résolution de fenêtre
   transaction → event") : mode exact, mode `doorsOpening`, mode dérivé des transactions, repli
   historique, et garde `t."eventId" IS NULL` sur tous les modes de repli.

## Risque de régression / à surveiller

- Tout changement de fenêtre par défaut recalcule les chiffres déjà affichés pour les events
  existants — resync à prévoir, tester avant déploiement.
- Le buffer 90 min du repli dérivé est une valeur d'implémentation, pas une décision produit
  validée — si Bertrand tranche pour une autre valeur, un seul changement (la constante
  `DERIVED_WINDOW_BUFFER_MS` dans `resolveEventWindow`) suffit.
- Non testé en environnement réel — vérifier sur un tenant avec des events réellement chevauchants
  avant de considérer BUG-328-02 clos en pratique.

## Références

- [BUG-328-02](328_02_aggregation_chevauchement_fenetres_events_double_comptage.md) — symptôme que
  ce fix atténue.
- [BUG-330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md) — fix
  complémentaire qui couvre les cas restants (pas de `doorsOpening`, chevauchement légitime).
- `staffing.service.ts:60-178` — implémentation de référence à réutiliser, pas à réinventer.
