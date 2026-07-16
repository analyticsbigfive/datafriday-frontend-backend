# BUG-039 — Market Prices : recherche sans debounce (recalcul à chaque frappe)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (perf)
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue:41,431-451`

## Symptôme

Aucun bug fonctionnel — la recherche fonctionne. Mais chaque frappe dans le champ de recherche
recalcule immédiatement le computed `filteredItems` (filtrage + re-pagination Vuetify) sur
l'ensemble des articles chargés, ce qui peut créer un jank de rendu perceptible une fois que
[[40_market_prices_cap_silencieux_200_lignes_mirror]] sera corrigé et que la liste chargée en
mémoire s'agrandira (jusqu'à plusieurs centaines de lignes).

## Cause racine

`searchQuery` (`v-model`, ligne 41) est directement consommé par le computed `filteredItems`
(lignes 431-451) sans aucun debounce ni `watch` différé. Le filtrage étant 100% côté client
(aucun appel réseau déclenché par la recherche), ce n'est pas un problème de charge serveur, mais
un recalcul synchrone à chaque caractère tapé.

## Correction

Ajout d'un debounce léger (150 ms) : `searchQuery` continue d'alimenter le champ `input` (frappe
réactive immédiate pour l'UX du champ lui-même), mais `filteredItems` consomme désormais une
valeur `debouncedSearchQuery` mise à jour via un `watch` avec `setTimeout`/`clearTimeout`, nettoyé
dans `beforeUnmount`.

## Risque de régression / à surveiller

- Vérifier que la recherche reste perçue comme instantanée (150 ms est sous le seuil de perception
  humaine pour une saisie).
- Vérifier qu'aucun timer résiduel ne fuit après un changement rapide de page (nettoyage dans
  `beforeUnmount`).

## Références

- [[36_market_prices_vide_avant_affichage_loading_non_cable]] — même page, même analyse.
