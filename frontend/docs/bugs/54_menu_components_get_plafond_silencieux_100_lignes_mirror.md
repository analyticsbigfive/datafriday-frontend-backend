# BUG-054 — `GET /menu-components` plafonné à 100 lignes sans pagination réelle côté front (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : les deux (cause racine : décalage front/backend, même schéma que BUG-040/BUG-052)
- **Découvert le** : 2026-07-16
- **Fichiers** : `backend/src/features/menu-components/menu-components.controller.ts:65-80`,
  `backend/src/features/menu-components/menu-components.service.ts:346-378`,
  `frontend/src/store/modules/menuComponents.js:34-63`

## Symptôme

Sur `/components`, si un tenant a plus de 100 composants (`MenuComponent`), ceux au-delà du 100e sont
silencieusement absents : pas d'erreur, pas d'indicateur de liste tronquée. Pire, le tiroir "Add
Component" du formulaire de création (`ComponentPickerDrawer.vue`, qui lit le même store) rend
également impossible la sélection de ces composants comme sous-composants d'un autre.

## Cause racine

Même schéma exact que [[40_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur]] et
[[52_suppliers_get_plafond_silencieux_100_lignes_mirror]] : `MenuComponentsService.findAll(tenantId,
page = 1, limit = 100)` pagine réellement et retourne `{ data, meta: { total, page, limit,
totalPages } }`, mais le contrôleur (`menu-components.controller.ts:68-71`, avant correctif)
n'exposait aucun paramètre `page`/`limit` en query (`findAll(@CurrentUser() user, @CurrentTenant()
tenantId)`) — impossible de demander une page suivante depuis le front. Côté front, `getMenuComponents()`
(`menu.api.js`) supportait déjà `{ page, limit }` (contrairement à BUG-040/052 où le client front
lui-même ne les envoyait pas), mais le store `menuComponents.js` (`fetchComponents`) ne les utilisait
pas et ne récupérait qu'un seul appel réseau — une seule page, capée à 100 par la valeur par défaut du
service.

## Correction

- `menu-components.controller.ts` : `findAll()` accepte désormais `@Query('page')`/`@Query('limit')`
  et les transmet au service (même pattern que `suppliers.controller.ts`).
- `menuComponents.js` (store) : `fetchComponents` boucle désormais sur toutes les pages retournées par
  le backend (`meta.total` / taille de page reçue) jusqu'à récupération complète, puis agrège en un
  seul `SET_ROWS` (même boucle que `suppliers.js:fetchSuppliers` / `marketPrices.js:fetchRows`).

## Risque de régression / à surveiller

- Vérifier qu'un tenant avec > 100 composants voit bien la totalité de la liste après le fix, y
  compris dans le picker "Add Component" du formulaire.
- Vérifier que le nombre de requêtes réseau reste raisonnable (une requête par tranche de 100
  composants, pas de boucle infinie) — condition d'arrêt basée sur `meta.total` ET sur la taille de
  page reçue, identique à BUG-040/052.
- `src/api/endpoints/component.api.js` (client dupliqué, utilisé uniquement par
  `useSpaceData.js`) expose sa propre `getMenuComponents()` sans paramètres `page`/`limit` et
  n'est **pas couvert** par ce correctif — ce chemin reste plafonné à 100 composants. Non traité ici
  car hors périmètre de la page `/components` (voir [[64_component_api_client_duplique_non_couvert_par_pagination]]).

## Références

- [[40_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur]] — même analyse, domaine voisin.
- [[52_suppliers_get_plafond_silencieux_100_lignes_mirror]] — même analyse, domaine voisin.
- `docs/modules/04_MENU_CATALOGUE.md` §"MenuComponent — la sous-recette (composant)"
