# BUG-132 — Stores Événements : registre `inflight` absent (déviation du pattern établi)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/store/modules/events.js`, `eventTypes.js`, `eventCategories.js`,
  `eventSubcategories.js`

## Symptôme

Les 4 stores du domaine gardaient seulement `if (state.fetching) return` en tête de leur action
`fetchX` — un retour immédiat qui ne résout PAS sur la vraie requête en cours, contrairement au
pattern de référence établi ailleurs dans le repo (`menuItems.js`, `shopMenuItems.js` : variable
`inflight` module-scope, le second appelant `await`e la même Promise). Scénario reproductible :
`EventsListView.vue` (`loadTaxonomies()` au montage) et `EventFormDrawer.vue` (au `v-model`
ouverture) dispatchent les 3 mêmes actions `eventTypes/eventCategories/eventSubcategories`. Si le
drawer s'ouvre pendant que le premier fetch tourne encore, le second `dispatch` retourne
`undefined` immédiatement au lieu d'attendre la fin réelle — le `Promise.allSettled` du drawer se
résout avant que les listes soient effectivement peuplées.

## Cause racine

Pattern `inflight` du reste du repo non répliqué sur ce domaine lors de sa création.

## Correction

Les 4 modules adoptent le pattern `inflight` (variable module-scope hors du state Vuex réactif,
retournée telle quelle aux appelants concurrents, réinitialisée en `finally`).

## Risque de régression / à surveiller

Vérifier qu'un double-dispatch rapide (ouverture du drawer juste après le montage de la liste) ne
déclenche plus qu'un seul appel réseau, et que les deux appelants reçoivent bien la liste peuplée.

## Références

- `src/store/modules/menuItems.js` (pattern de référence)
