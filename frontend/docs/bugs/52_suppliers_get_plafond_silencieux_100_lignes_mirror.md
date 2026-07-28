# BUG-052 — `GET /suppliers` plafonné à 100 lignes sans pagination réelle côté front (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux (cause racine : décalage front/backend, même schéma que BUG-040)
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/store/modules/suppliers.js:43-60`, `src/api/endpoints/menu.api.js:378-380`

## Symptôme

Sur `/suppliers`, si un tenant a plus de 100 fournisseurs, ceux au-delà du 100e (dans l'ordre
alphabétique) sont silencieusement absents de l'écran : pas d'erreur, pas d'indicateur "liste
tronquée", ils n'apparaissent simplement jamais dans la grille/tableau ni dans la recherche.

## Cause racine

Même schéma exact que [[40_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur]] :
`backend/src/features/suppliers/suppliers.controller.ts` / `suppliers.service.ts` paginent
réellement (`GET /suppliers?page=&limit=`, défaut `page=1, limit=100`, retour `{ data, meta:
{ total, page, limit, totalPages } }`), mais côté front `menu.api.js:378-380`
(`getSuppliers()`) n'envoyait aucun paramètre `page`/`limit`, et le store
`store/modules/suppliers.js:43-60` (`fetchSuppliers`) ne récupérait qu'un seul appel réseau —
donc une seule page, capée à 100 par la valeur par défaut du service backend.

## Correction

- `menu.api.js` : `getSuppliers()` accepte désormais `{ page, limit }` optionnels et construit la
  query string (même pattern que `getMarketPrices`, réutilisé tel quel).
- `suppliers.js` (store) : `fetchSuppliers` boucle désormais sur toutes les pages retournées par
  le backend (`meta.total` / taille de page reçue) jusqu'à récupération complète, puis agrège en
  un seul `SET_SUPPLIERS` (même boucle que `marketPrices.js:fetchRows`).

## Risque de régression / à surveiller

- Vérifier qu'un tenant avec > 100 fournisseurs voit bien la totalité de la liste après le fix.
- Vérifier que le nombre de requêtes réseau reste raisonnable (une requête par tranche de 100
  fournisseurs, pas de boucle infinie) — condition d'arrêt basée sur `meta.total` ET sur la taille
  de page reçue, identique à BUG-040.

## Références

- [[40_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur]] — même analyse, même
  domaine, corrigé la veille (2026-07-16) ; ce bug est le même défaut non encore répliqué sur
  `/suppliers` au moment de la découverte.
- `docs/modules/04_MENU_CATALOGUE.md` §"Supplier / MarketPrice — les référentiels d'achat"
