# BUG-140 — `team.api.js getTeams()` : avale TOUTES les erreurs, pas seulement le 404 attendu

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/api/endpoints/team.api.js:17-29` (avant correction)

## Symptôme

Le commentaire d'en-tête (`:4-8`, déjà signalé obsolète = BUG-013 backend miroir/BUG-13 frontend)
ne justifie que le cas 404 (endpoint pas encore déployé). Mais le `catch` retournait `[]` pour
n'importe quelle erreur — 500, timeout réseau, 403 — avec seulement un `console.warn` pour les cas
non-404. Un vrai échec backend (ex. `/teams` répond 500) se présentait à l'utilisateur exactement
comme "aucune équipe existante", sans distinction.

## Cause racine

`catch` trop large, hérité de l'époque où l'endpoint backend n'existait pas encore et où un large
filet de sécurité avait du sens — jamais resserré après le déploiement de `TeamsController`.

## Correction

Seul le 404 dégrade en `[]` ; toute autre erreur est re-levée. Vérifié sans risque : les deux
appelants réels (`EventFormDrawer.loadTeams()`, `EventPredictView.vue:3411`) encapsulent déjà
chacun leur propre `try/catch`/`.catch(() => [])` autour de `getTeams()` — aucun des deux ne
plantera, ils continueront de dégrader en liste vide, mais l'erreur réelle sera désormais visible
en log/monitoring plutôt que masquée à la source.

## Risque de régression / à surveiller

Vérifier que `/events` et Event Predict continuent de charger normalement même si `/teams` échoue
(dégradation gracieuse toujours assurée côté appelants) — mais qu'un vrai 500 backend soit
maintenant traçable.

## Références

- `docs/bugs/13_team_api_commentaire_obsolete.md`
