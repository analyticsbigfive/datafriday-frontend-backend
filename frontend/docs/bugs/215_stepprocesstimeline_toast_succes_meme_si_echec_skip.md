# BUG-215 — Toast "Agrégation terminée" affiché en succès même quand le job a échoué ou a été sauté

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:859`
  (`TERMINAL = ['completed', 'failed', 'skipped']`), `:883-890`

## Symptôme

Après polling de `getJobProgress`, le code vérifie seulement si un état **terminal** a été atteint
(`reachedTerminal`), jamais la valeur réelle de `progress.status`. Les lignes 883-890 affichent
ensuite inconditionnellement `intgTimelineAggDone` ("Agrégation terminée") en **vert/succès**, même
si le statut terminal réel du job était `failed` ou `skipped`. Un échec ou un skip backend
s'affiche donc à l'identique d'un vrai succès.

## Cause racine

`reachedTerminal` est un booléen, et la branche qui fixe texte/couleur du snackbar n'inspecte
jamais `this.currentEventProgress.status` (qui contient pourtant la vraie valeur terminale à ce
moment) avant de choisir le message "succès".

## Correction

Dans `handleProcessSingle`, la branche `reachedTerminal` inspecte désormais
`this.currentEventProgress.status` avant de choisir le message/couleur du snackbar :
`completed` → succès (vert, `intgTimelineAggDone`), `failed` → erreur (rouge,
nouvelle clé `intgTimelineAggFailed`), `skipped` → avertissement (ambre, nouvelle clé
`intgTimelineAggSkipped`). Le cas "timeout de polling, pas d'état terminal atteint" reste
distinct (`intgTimelineAggSlow`, voir aussi BUG-217). Nouvelles clés i18n ajoutées en EN/FR.

## Risque de régression / à surveiller

Corréler avec BUG-216 (le badge de statut par ligne a le même problème — ne distingue pas
échec/skip de non-traité) : les deux découlent du même défaut de traitement de `status`.
Corréler aussi avec BUG-221 (le chemin de traitement en masse, mort, gère correctement cette
distinction — voir la note "le meilleur code est le code mort").

## Références

- BUG-216, BUG-221.
