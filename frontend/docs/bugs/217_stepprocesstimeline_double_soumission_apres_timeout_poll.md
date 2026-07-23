# BUG-217 — Fenêtre de double-soumission après timeout du polling par événement

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:849-926` (bloc
  `finally` :921-924), `:272` (garde du bouton)

## Symptôme

`processingEventId` est remis à `null` dans le `finally` **sans condition**, que `reachedTerminal`
ait ou non fini par valoir `true`. Si le polling (~120 tentatives × 1s, ~2 min) expire, le bouton
"Traiter" (`:disabled="processingEventId === item.id"`) se réactive même si le job côté backend
tourne peut-être encore. Un utilisateur qui re-clique sur le même événement peut déclencher
`processEvents([eventId])` une seconde fois pendant que la première invocation est encore en vol
côté serveur.

## Cause racine

Le verrou UI local est lié à la durée de vie de la boucle de polling, pas à un état terminal
backend confirmé.

## Correction

`handleProcessSingle` distingue maintenant explicitement un état terminal confirmé
(`reachedTerminal`, hissé hors du `try` pour rester visible du `finally`) d'un simple timeout/erreur
réseau (`stalled`) :
- `finally` ne remet `processingEventId = null` (ré-active le bouton) que si `reachedTerminal` est
  vrai — succès, échec ou skip réel, ou une vraie erreur (validation/permission, pas un timeout).
- En cas de timeout de polling ou d'erreur réseau (`stalled = true`), l'id est ajouté à un nouveau
  tableau `stalledEventIds` : le bouton reste désactivé et affiche un état dédié ("Toujours en
  cours…", nouvelles clés `intgTimelineStillProcessingBtn`/`intgTimelineStillProcessingTooltip`)
  au lieu de se ré-activer silencieusement.
- Un nouveau watcher sur `events` (peuplé par `loadTimeline`) lève le verrou (`stalledEventIds` +
  `processingEventId`) dès qu'un event stalled ressort avec un `aggregationStatus` différent de
  `pending`, c'est-à-dire dès qu'un état terminal réel est confirmé côté backend.

## Risque de régression / à surveiller

Corréler avec BUG-216 (badge qui ne montre pas l'échec, aggravant le risque de re-clic) et BUG-206
(même classe de problème : polling sans timeout franc, côté sync).

## Références

- BUG-216, BUG-206, BUG-218.
