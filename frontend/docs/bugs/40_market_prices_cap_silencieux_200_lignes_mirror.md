# BUG-040 — `GET /market-prices` plafonné à 200 lignes sans pagination réelle (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux (cause racine backend)
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/store/modules/marketPrices.js:34-52`, `src/api/endpoints/menu.api.js:272-274`

## Symptôme

Sur `/market-prices`, si un tenant a plus de 200 lignes de Market Price, les lignes au-delà de 200
sont silencieusement absentes de l'écran : pas d'erreur, pas d'indicateur "liste tronquée", elles
n'apparaissent simplement jamais dans le tableau ni dans les filtres/recherche/export CSV.

## Cause racine

Fiche miroir — le diagnostic complet est côté backend :
`api-datafriday-staging/docs/bugs/54_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur.md`.

Résumé côté frontend : `menu.api.js:272-274` (`getMarketPrices()`) n'envoyait aucun paramètre
`page`/`limit`, et le store `marketPrices.js:35-52` (`fetchRows`) ne récupérait qu'un seul appel
réseau, donc une seule page de résultats — capée à 200 par la valeur par défaut du service backend.

## Correction

- `menu.api.js` : `getMarketPrices()` accepte désormais `{ page, limit }` optionnels et construit
  la query string (même pattern que `getMarketPricesWithIngredients`).
- `marketPrices.js` (store) : `fetchRows` boucle désormais sur toutes les pages retournées par le
  backend (`meta.total`/`meta.limit`) jusqu'à récupération complète, puis agrège en un seul
  `SET_ROWS`. Le backend doit accepter `page`/`limit` en query params pour que cette boucle
  converge (cf. fiche backend).

## Risque de régression / à surveiller

- Vérifier qu'un tenant avec > 200 Market Prices voit bien la totalité de ses lignes après le fix
  (compter côté DB vs. compter les lignes affichées après filtre "All Types"/"All Categories").
- Vérifier que le nombre de requêtes réseau reste raisonnable (une requête par tranche de 200
  lignes, pas de boucle infinie) — condition d'arrêt basée sur `meta.total` ET sur la taille de
  page reçue.
- Les autres consommateurs de `getMarketPrices()` de `market.price.api.js` (fichier séparé, utilisé
  par `SpaceLogisticView.vue`, `store/modules/inventory.js`, `composables/useInventoryApi.js`) ne
  sont **pas** concernés par ce fix — ils continuent d'appeler l'endpoint sans paramètres, avec le
  même comportement par défaut (page 1, limite 200) qu'avant ce correctif, donc pas de régression
  introduite sur ces pages. Un futur ticket pourrait leur appliquer le même correctif s'ils sont
  eux aussi affectés par des tenants à forte volumétrie.

## Références

- Fiche complète (cause racine) : `api-datafriday-staging/docs/bugs/54_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur.md`.
- [[36_market_prices_vide_avant_affichage_loading_non_cable]], [[37_market_prices_pagination_bloquee_a_10_items_per_page]] — même page, même analyse.
