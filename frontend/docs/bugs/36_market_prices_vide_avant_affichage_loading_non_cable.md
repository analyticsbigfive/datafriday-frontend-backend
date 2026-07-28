# BUG-036 — Market Prices : tableau vide ("No data") avant l'affichage réel des lignes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue:70,159,472-482`, `src/components/menu-fb/views/market-prices/components/MarketPriceTable.vue:4-12`

## Symptôme

À l'arrivée sur `/market-prices`, l'utilisateur voit un court instant un tableau annonçant
"No data available" avant que les lignes n'apparaissent, même quand le tenant a des centaines de
prix. L'indicateur de chargement existant (une barre `v-progress-linear` de 3px au-dessus du
tableau) est peu visible et ne suffit pas à faire comprendre qu'un chargement est en cours.

## Cause racine

Deux causes combinées :

1. `MarketPriceListView.vue:159` initialise `marketPricesLoading: false` dans `data()`. Au tout
   premier rendu (avant que `mounted()` n'ait eu le temps de lancer `loadMarketPrices()`, qui passe
   ce flag à `true`), le composant est peint avec `loading=false` et `items=[]`.
2. `MarketPriceTable.vue:4-12` ne reçoit jamais de prop `loading` — le `v-data-table` Vuetify sous-
   jacent a un prop natif `loading` qui suspend l'affichage de "No data available" tant que le
   chargement est en cours, mais il n'était jamais câblé. Résultat : dès que `items` est vide (au
   premier rendu, et pendant tout le chargement réel), Vuetify affiche son message "No data"
   par défaut, qu'il y ait ou non un chargement en cours.

## Correction

- `marketPricesLoading` initialisé à `true` dans `data()` (au lieu de `false`) pour couvrir le tout
  premier rendu, avant que `mounted()` ne s'exécute.
- Ajout d'une prop `loading` sur `MarketPriceTable.vue`, câblée sur le `v-data-table` interne
  (`:loading="loading"`), et passée depuis `MarketPriceListView.vue`
  (`:loading="marketPricesLoading"`).

## Risque de régression / à surveiller

- Vérifier qu'au chargement initial (cache invalide) le tableau affiche bien l'indicateur natif
  Vuetify sans flash de "No data available".
- Vérifier que lorsque le cache est valide (retour sur la page dans les 15 minutes), le flag
  repasse rapidement à `false` sans loader persistant inutile.
- Vérifier qu'un tenant sans aucun Market Price affiche bien "No data" une fois le chargement
  terminé (pas de régression sur le cas légitimement vide).

## Références

- [[37_market_prices_pagination_bloquee_a_10_items_per_page]] — même composant, trouvé dans la
  même analyse.
- [[40_market_prices_cap_silencieux_200_lignes_mirror]] — bug voisin sur la même page (données
  manquantes au-delà de 200 lignes).
