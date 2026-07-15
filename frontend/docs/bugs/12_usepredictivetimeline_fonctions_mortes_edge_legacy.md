# BUG-012 — usePredictiveTimeline.js : fonctions de persistance mortes, écrivent vers un Edge Function legacy

- **Statut** : 🔴 Ouvert
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

Aucune à ce jour — code mort à supprimer ou à ne pas prendre comme référence.

## Risque de régression / à surveiller

Ne pas prendre ces fonctions comme le mécanisme réel de sauvegarde de la sélection manuelle.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #7
