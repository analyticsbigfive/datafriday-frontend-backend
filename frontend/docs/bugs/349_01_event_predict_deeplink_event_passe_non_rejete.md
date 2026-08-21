# BUG-349-01 — Event Predict : deep-link `?event=` vers un évènement passé non rejeté

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse / Event Predict
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-21
- **Fichiers** : `src/components/EventPredictView.vue:4122,7003,3625`, `src/components/analyse/AnalyseView.vue:1700`

## Symptôme

Ouvrir Event Predict avec un identifiant d'évènement dans l'URL
(`/spaces/<id>?toolbox=event-predict&event=<id-passé>` ou `/spaces/<id>/predict?event=...`)
sélectionne cet évènement même s'il est déjà passé (cas observé : évènement du 14 juin affiché le
21 août), alors que l'écran sert à préparer des évènements à venir et que les sélecteurs manuels
(dropdown, calendrier) ne proposent que des futurs. Reproduction : cliquer sur la barre d'un
évènement passé dans AnalyseView en mode Predict, ou recharger/partager une URL contenant
`?event=` d'un évènement passé.

## Cause racine

La sélection automatique par défaut est saine (`futureEvents[0]`, filtre
`!isEventUnderway && date >= aujourd'hui`, tri croissant — `EventPredictView.vue:1835-1848`,
`:4160`), sans fallback vers le passé. Mais trois points d'entrée acceptaient un event id **sans
aucune validation de date** :

1. `loadAll()` — `deepLinkTarget = routeEventId || pendingId` (`EventPredictView.vue:4122-4126`),
   appliqué tel quel à `:4160-4164`.
2. `applyDeepLinkFromRoute()` (`:7003`) — ré-applique `?event=` après le mount, seul test :
   présence dans `this.events`.
3. Watcher `'$store.state.analyse.pendingPredictEventId'` (`:3625`) — id poussé par
   `AnalyseView.onChartBarClick` (`AnalyseView.vue:1700-1726`), qui envoyait volontairement passé
   OU futur.

## Correction

Décision JLH (2026-08-21) : un deep-link vers un évènement passé (ou en cours) est **rejeté**,
fallback sur le prochain évènement futur (ou état vide si aucun), toast warning explicatif.

- Helper `isTargetableEventId(id)` = membership dans `futureEvents` — même prédicat que
  `futureEventOptions`, donc invariant : un deep-link est valide ssi l'évènement serait
  sélectionnable à la main dans le dropdown.
- Garde aux 3 points d'entrée : `loadAll` (fallback `futureEvents[0]` + toast warning ; si aucun
  futur, état vide + nettoyage de l'URL via `syncEventQueryToUrl(null)`),
  `applyDeepLinkFromRoute` (rejet silencieux, bloc `?version=` skippé aussi — une version d'un
  event rejeté produirait un toast « Version introuvable » trompeur), watcher
  `pendingPredictEventId` (sélection courante conservée + toast, pending remis à null).
- `AnalyseView.vue:1704-1706` : commentaire mis à jour (le « Event Predict gère les deux » n'est
  plus vrai), aucun changement de code côté AnalyseView / SpaceInventoryView.

Branche `fix/event-predict-deeplink-event-passe`.

## Risque de régression / à surveiller

1. **Régression fonctionnelle assumée** (validée JLH) : clic sur une barre d'évènement passé dans
   AnalyseView (mode Predict) et propagation `?event=` du switcher toolbox de
   `SpaceInventoryView` (`:1703-1707`, `:2725-2732`) n'ouvrent plus la « timeline passée » —
   atterrissage sur le prochain futur.
2. La branche `isPastSelectedEvent → loadPastTimeline` (`EventPredictView.vue:4188-4190`,
   `:3663-3671`) devient inatteignable depuis l'UI ; code conservé (hors périmètre).
3. Divergence non consolidée : `isFutureSelectedEvent` (`:2170`) n'appelle pas `isEventUnderway`,
   contrairement à `futureEvents`/`eventOptions.isPast` — trois définitions de « passé »
   coexistent encore dans le fichier.
4. Évènements à date non parsable : désormais rejetés comme cibles de deep-link (cohérent avec le
   dropdown qui les excluait déjà).
5. Liens de prédiction partagée en mode demo vers un event mock passé : rejetés aussi.
6. À noter (non corrigé ici) : le computed `today()` (`:1830`) n'a aucune dépendance réactive —
   figé au premier rendu ; onglet ouvert après minuit → hier compte comme aujourd'hui.

## Références

- `docs/bugs/186_predict_snapshot_brouillon_date_perimee_calendrier.md` — autre bug de date sur le
  même écran (snapshot écrasant `eventDate`), fix `omitEventIdentity` toujours en place.

Signé : JLH
