# BUG-073 — Export CSV MenuItem : rafale de requêtes `getMenuItemById` non throttlées

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue:775-786`

## Symptôme

L'export CSV lance un `Promise.all` avec une requête HTTP par article unique du catalogue filtré,
sans limite de concurrence. Sur un catalogue de plusieurs centaines d'articles, cela ouvre autant
de requêtes simultanées contre un backend déjà documenté comme lent (`menu-item.api.js:37-40`).

## Cause racine

```js
await Promise.all(
  [...new Set(source.map(item => item.menuItemId))]
    .map(id => getMenuItemById(id).then(d => { detailById[id] = d }).catch(() => null))
)
```

## Correction

Remplacé par un traitement par lots via `asyncPool` (déjà présent dans le repo, testé par
`tests/unit/asyncPool.spec.js`) avec une concurrence bornée, plutôt qu'un `Promise.all` sans
limite.

## Risque de régression / à surveiller

Vérifier que le temps total d'export reste acceptable sur un catalogue volumineux malgré la
concurrence bornée — ajuster la taille du pool si l'export devient perceptiblement plus lent.

## Références

- Aucune.
