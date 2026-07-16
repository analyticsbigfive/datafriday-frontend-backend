# BUG-038 — Market Prices : hook `activated()` mort (aucun `<keep-alive>` autour du router-view)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (cosmétique / dette)
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue:229-232`, `src/App.vue:1-5`, `src/router/index.js:222-226`

## Symptôme

Aucun symptôme utilisateur visible actuellement — code mort silencieux. Un dev qui lit
`MarketPriceListView.vue` peut croire que `activated()` force un refresh des types/catégories
Market Price à chaque retour sur la page ; ce n'est jamais le cas.

## Cause racine

La route `/market-prices` déclare `meta: { keepAlive: true }` (`router/index.js:224`), et le
composant définit un hook Vue `activated()` qui dispatch `marketPriceTypes/fetchMarketPriceTypes`
et `marketPriceCategories/fetchMarketPriceCategories` en `forceRefresh: true`. Mais `App.vue:1-5`
monte `<router-view/>` directement, jamais enveloppé dans un `<keep-alive>` — ce qui est nécessaire
pour que Vue déclenche `activated()`/`deactivated()`. Sans `<keep-alive>`, chaque navigation vers
`/market-prices` démonte et remonte le composant : c'est `mounted()` qui s'exécute (pas
`activated()`), et le hook `activated()` ne se déclenche donc jamais.

Ce `meta.keepAlive: true` est un pattern répété sur des dizaines de routes du fichier
`router/index.js` (pas spécifique à Market Prices) — corriger l'architecture globale (envelopper
réellement `router-view` dans `<keep-alive>`) est hors du périmètre de cette page et changerait le
comportement de montage de tout le reste de l'application ; ce point n'est donc traité ici que
pour l'instance locale à Market Prices.

## Correction

Suppression du hook `activated()` mort dans `MarketPriceListView.vue` : il ne s'exécutait jamais,
et `mounted()` recharge de toute façon types/catégories à chaque navigation réelle vers la page
(gouverné par le cache TTL 15 min standard du store, cf. `docs/AUDIT_VUEX_STORE.md`). Le flag
`meta.keepAlive: true` de la route est laissé en l'état (pattern partagé avec le reste du router,
ne pas modifier isolément).

## Risque de régression / à surveiller

- Vérifier que les types/catégories Market Price restent à jour après une modification faite sur
  une autre page puis un retour sur `/market-prices` (cache TTL 15 min — un retour rapide peut
  encore montrer une valeur légèrement périmée, comportement inchangé par rapport à avant ce fix).
- Si `<keep-alive>` est un jour ajouté globalement autour de `router-view` (changement architectural
  plus large, hors périmètre ici), réévaluer si un hook `activated()` doit être réintroduit sur
  cette page.

## Références

- [[36_market_prices_vide_avant_affichage_loading_non_cable]] — même page, même analyse.
