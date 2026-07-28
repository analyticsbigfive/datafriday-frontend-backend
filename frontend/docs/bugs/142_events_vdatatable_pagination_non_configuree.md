# BUG-142 — Les 4 `v-data-table` du domaine Événements : pagination non configurée (défaut Vuetify = 10)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `EventsListView.vue`, `EventsTypeListView.vue`, `EventsCategorieListView.vue`,
  `EventsSubcategorieListView.vue` (les 4 `v-data-table` du domaine)

## Symptôme

Aucun des 4 tableaux du domaine ne fixait `items-per-page` — Vuetify retombe sur son défaut de 10
lignes par page. Sur un tenant avec plusieurs dizaines d'events/catégories, l'utilisateur ne voit
que les 10 premiers sans indication claire qu'il faut paginer, contrairement à d'autres écrans du
produit qui exposent un choix de taille de page.

## Cause racine

Prop `items-per-page` jamais posée sur ces 4 tableaux.

## Correction

`:items-per-page="25"` + `:items-per-page-options="[10, 25, 50, 100]"` ajoutés sur les 4
`v-data-table`.

## Risque de régression / à surveiller

Aucun — changement purement cosmétique de la pagination client, les données sous-jacentes ne
changent pas (voir séparément BUG-139 pour la troncature côté fetch réseau, différente de celle-ci
qui est purement l'affichage côté Vuetify).

## Références

- [[139_events_store_pas_de_pagination_cap_50]] (troncature réseau, bug distinct)
