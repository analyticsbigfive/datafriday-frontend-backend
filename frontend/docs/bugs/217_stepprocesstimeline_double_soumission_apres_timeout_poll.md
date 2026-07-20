# BUG-217 — Fenêtre de double-soumission après timeout du polling par événement

- **Statut** : 🔴 Ouvert
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

Rien à ce jour. Ne réactiver le bouton qu'en cas de résultat confirmé (terminal ou timeout
explicitement affiché comme tel à l'utilisateur, avec possibilité de vérifier l'état réel avant de
permettre un nouveau clic).

## Risque de régression / à surveiller

Corréler avec BUG-216 (badge qui ne montre pas l'échec, aggravant le risque de re-clic) et BUG-206
(même classe de problème : polling sans timeout franc, côté sync).

## Références

- BUG-216, BUG-206, BUG-218.
