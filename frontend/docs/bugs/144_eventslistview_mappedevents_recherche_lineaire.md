# BUG-144 — `EventsListView.vue mappedEvents` : recherche linéaire O(n×m) non mémoïsée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (performance)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/views/EventsListView.vue:338-340` (avant correction)

## Symptôme

Le computed `mappedEvents` exécutait `this.spaces.find(s => s.id === e.spaceId)` pour chaque event
dans son `.map()` — recherche linéaire dans `spaces` répétée pour chaque event, recalculée à chaque
changement de `events`/`spaces` (donc à chaque création/édition/suppression, ou expiration de
cache). Coût négligeable aux volumes actuels du produit, mais non mémoïsé et non nécessaire.

## Cause racine

Pattern `.find()` en boucle au lieu d'un index construit une fois.

## Correction

Ajout d'un computed `spacesById` (un `Map` construit une fois par changement de `spaces`),
consommé via `.get()` en O(1) dans `mappedEvents` au lieu de `.find()` en O(m).

## Risque de régression / à surveiller

Aucun changement de comportement — uniquement la complexité algorithmique. Vérifier que
`spaceName`/`location` s'affichent toujours correctement dans le tableau `/events`.

## Références

- Aucune.
