# BUG-012 — usePredictiveTimeline.js : fonctions de persistance mortes, écrivent vers un Edge Function legacy

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟢 Mineur (sans conséquence, try/catch silencieux)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `usePredictiveTimeline.js:288-304,1090-1098` (exportées ligne 1125)

## Symptôme

Aucun — `EventPredictView.vue` appelle `timeline.loadPredictiveTimeline` directement partout
(lignes 4552, 4962), jamais `persistSelection`/`updatePredictionEvents`.

## Cause racine

`persistSelection`/`updatePredictionEvents` écrivent vers un Edge Function Supabase legacy,
jamais appelées par le code vivant — `EventPredictVersion.selectedPredictionEventIds` est le
mécanisme réel de sauvegarde de la sélection manuelle.

## Correction

2026-07-18 : `persistSelection` et `updatePredictionEvents` supprimées de
`usePredictiveTimeline.js`, ainsi que la constante `API_BASE` (Edge Function legacy
`make-server-eb31619c`) et l'import `projectId`/`publicAnonKey` de `utils/supabase/info` —
tous devenus sans usage dans ce fichier. Aucun appelant externe (grep exhaustif).

## Risque de régression / à surveiller

Ne pas prendre ces fonctions comme le mécanisme réel de sauvegarde de la sélection manuelle.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #7
