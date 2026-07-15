# BUG-013 — team.api.js : commentaire "backend n'expose pas encore /teams" obsolète

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Faible (comportement inoffensif, juste trompeur)
- **Domaine** : Prévision (Event Predict) / Événements — bug partagé entre les deux domaines
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `team.api.js:4-8` vs `events.controller.ts:172-215` (backend, `TeamsController` complet, GET/POST/PATCH/DELETE)

## Symptôme

Aucun comportement cassé — le fallback 404→`[]` ne se déclenche simplement jamais en pratique.

## Cause racine

Le commentaire dans `team.api.js` affirme que le backend n'expose pas encore `/teams`, ce qui est
faux : `TeamsController` est complet et fonctionnel côté `api-datafriday-staging`.

## Correction

Aucune à ce jour — mettre à jour/retirer le commentaire trompeur.

## Risque de régression / à surveiller

Le commentaire pourrait faire croire à tort que le catalogue d'équipes n'est pas fiable/complet à
un futur dev qui ne vérifie pas le code backend réel.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #8
- `docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #5
