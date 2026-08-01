# BUG-259 — Events Catégorie/Sous-catégorie : `item-value="id"` non fiable (id non normalisé) pour la suppression groupée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (sélection groupée potentiellement inopérante sur certains items)
- **Domaine** : Événements (taxonomies)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-01 (lors de l'ajout de la suppression groupée)
- **Fichiers** :
  - `src/components/events/views/EventsCategorieListView.vue` (`categories()`)
  - `src/components/events/views/EventsSubcategorieListView.vue` (`subcategories()`)

## Symptôme

Sur les listes **Catégories** et **Sous-catégories** d'événements, la nouvelle **suppression
groupée** (cases à cocher, `item-value="id"`) pouvait ne rien cocher / cocher `undefined` pour les
items dont l'API/le store ne renvoie que `_id` (et pas `id`) — la sélection contenait alors
`undefined` et `confirmBulkDelete` aurait appelé `deleteEventCategory(undefined)`.

## Cause racine

Les computeds `categories()` / `subcategories()` alimentant `:items` du `v-data-table` renvoyaient
le getter store **brut, sans normaliser `id`** :
```js
categories() { return this.$store.getters['eventCategories/eventCategories'] }
```
alors que le reste du composant normalise déjà (`eventTypes` → `id: t?.id || t?._id`) et que le
delete **unitaire** utilise le repli `category?.id || category?._id` (`:287`). La colonne de
sélection `item-value="id"` lit donc un champ potentiellement absent.

## Correction

Normalisation de `id` dans les deux computeds (commit associé), en miroir des autres :
```js
return this.$store.getters['eventCategories/eventCategories']
  .map((c) => ({ ...c, id: c?.id || c?._id }))
  .filter((c) => !!c.id)
```
`item-value="id"` est désormais fiable ; le delete unitaire n'est pas affecté.

## Risque de régression / à surveiller

- **Limitation connue (non-bug)** des tables **server-paginées** (Product/MarketPrice types &
  catégories, Component types, FlatReferential) : la sélection groupée porte sur la **page courante**
  uniquement (comportement Vuetify standard), pas sur l'ensemble des pages. À documenter côté UX si
  un besoin « tout sélectionner cross-page » émerge.
- Vérifier au build que la case « tout sélectionner » et la boucle de suppression opèrent bien sur
  ces deux vues.

## Références

- Module : [`modules/07_EVENEMENTS.md`](../modules/07_EVENEMENTS.md)
- Feature associée : suppression groupée réutilisable (`components/common/BulkDeleteDialog.vue`).
