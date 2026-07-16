# BUG-037 — Market Prices : pagination client bloquée à 10 lignes (défaut Vuetify non configuré)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/components/MarketPriceTable.vue:4-12`

## Symptôme

La liste `/market-prices` n'affiche que 10 articles à la fois, avec une pagination "1-10 sur N"
peu visible en bas du tableau, obligeant à cliquer plusieurs fois pour voir tous les articles même
quand une recherche/filtre ne renvoie que quelques dizaines de résultats.

## Cause racine

`MarketPriceTable.vue:4-12` utilise un `v-data-table` Vuetify sans jamais préciser `items-per-page`.
Le composable de pagination de Vuetify (`node_modules/vuetify/lib/components/VDataTable/composables/paginate.js:9-12`)
applique alors sa valeur par défaut, qui est `10`. Toute la pagination est côté client : les
données sont déjà toutes en mémoire (chargées en un seul fetch, cf. [[40_market_prices_cap_silencieux_200_lignes_mirror]]),
Vuetify se contente de les découper visuellement par page de 10 sans requête réseau supplémentaire.

## Correction

Ajout de `:items-per-page="25"` et `:items-per-page-options` (25/50/100/Tout) sur le `v-data-table`
de `MarketPriceTable.vue`, pour un affichage par défaut plus généreux et un contrôle explicite pour
l'utilisateur.

## Risque de régression / à surveiller

- Vérifier que le sélecteur de taille de page reste utilisable et lisible dans le pied de tableau.
- Vérifier les performances de rendu avec l'option "Tout" sélectionnée si un tenant a beaucoup
  d'articles (plusieurs centaines), une fois [[40_market_prices_cap_silencieux_200_lignes_mirror]]
  corrigé et donc tous les articles réellement chargés en mémoire.

## Références

- [[36_market_prices_vide_avant_affichage_loading_non_cable]] — même composant.
