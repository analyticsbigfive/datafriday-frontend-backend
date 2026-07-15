# BUG-013 — PredictVersionsService.update() jamais appelée (code mort d'API)

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Mineur (code mort, sans conséquence fonctionnelle actuelle)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `predict-versions.service.ts:58-79`, `predict-versions.controller.ts`

## Symptôme

Aucun symptôme utilisateur — c'est du code mort. La méthode `update()` (avec son DTO
`UpdatePredictVersionDto`, remplacement complet) existe mais aucune route ne l'invoque.

## Cause racine

Toute mise à jour de version de prédiction passe en réalité par `PATCH /predict-versions/:id`
(`patch()`, whitelist de champs) — `update()` a été laissée derrière lors de ce choix.

## Correction

Aucune. À supprimer, ou à documenter comme volontairement conservée si un futur besoin de
remplacement complet est prévu.

## Risque de régression / à surveiller

Ne pas prendre `update()`/`UpdatePredictVersionDto` comme référence si vous ajoutez une route de
remplacement complet — vérifier d'abord si `patch()` suffit.

## Références

- `datafriday-web/docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #6
