# BUG-147 — `events.js` : TTL de cache 5 min, contre 15 min pour les 3 stores de taxonomie

- **Statut** : ⚪ Diagnostiqué
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

Aucune à ce jour — décision à prendre : documenter ce choix comme délibéré (avec la justification
métier), ou aligner sur 15 min comme les 3 autres stores du même domaine.

## Risque de régression / à surveiller

Si alignement à 15 min : vérifier que les écrans qui dépendent d'une fraîcheur "quasi temps réel"
de la liste d'events (s'il y en a) ne sont pas impactés — aucun consommateur de ce type identifié
lors de cet audit.

## Références

- `CLAUDE.md` (convention 15 min TTL)
