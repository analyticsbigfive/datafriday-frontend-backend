# BUG-147 — `events.js` : TTL de cache 5 min, contre 15 min pour les 3 stores de taxonomie

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/store/modules/events.js:3` (`TTL = 5 * 60 * 1000`) vs `eventTypes.js`/
  `eventCategories.js`/`eventSubcategories.js:3` (`TTL = 15 * 60 * 1000`, la convention documentée
  dans `CLAUDE.md`)

## Symptôme

Le store `events` a un TTL de cache de 5 minutes, alors que la convention établie dans le reste du
repo (documentée dans `CLAUDE.md`, appliquée par les 3 stores de taxonomie voisins de ce même
domaine) est 15 minutes.

## Cause racine

Non tranché — peut être un choix volontaire (les events changent plus souvent que leur taxonomie,
donc un cache plus court a du sens) ou un simple oubli de copier la constante standard.

## Correction

**Décision (2026-07-18)** : alignement sur 15 min, la convention établie — aucun consommateur
identifié n'a besoin d'une fraîcheur plus courte, et l'écart n'avait pas de justification métier
documentée. `TTL` dans `src/store/modules/events.js` passe de `5 * 60 * 1000` à `15 * 60 * 1000`.

## Risque de régression / à surveiller

- Vérifié lors de l'audit initial : aucun écran ne dépend d'une fraîcheur "quasi temps réel" de la
  liste d'events.
- Suite de tests Événements (99 tests) toujours verte après ce changement.

## Références

- `CLAUDE.md` (convention 15 min TTL)
