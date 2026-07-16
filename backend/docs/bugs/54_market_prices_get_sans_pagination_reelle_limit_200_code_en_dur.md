# BUG-054 — `GET /market-prices` sans pagination réelle : perte silencieuse au-delà de 200 lignes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/features/market-prices/market-prices.controller.ts:89-95`, `src/features/market-prices/market-prices.service.ts:93-116`

## Symptôme

Sur la page frontend `/market-prices`, un tenant ayant plus de 200 `MarketPrice` en base ne voit
jamais les lignes au-delà des 200 premières (triées par `itemName` croissant) : pas d'erreur, pas
de bandeau "liste tronquée", elles sont simplement absentes de la liste, de la recherche, des
filtres et de l'export CSV côté front.

## Cause racine

`MarketPricesService.findAll(tenantId, page = 1, limit = 200)` (`market-prices.service.ts:93-116`)
est déjà correctement paginé côté service (utilise `skip`/`take` Prisma et renvoie
`{ data, meta: { total, page, limit, totalPages } }`, exactement comme `findAllWithIngredients` et
`findAllWithPackagings` dans le même fichier). Le bug est dans le **controller** :
`MarketPricesController.findAll()` (`market-prices.controller.ts:89-95`) n'expose aucun
`@Query('page')`/`@Query('limit')` — contrairement à `findAllWithIngredients` (lignes 157-185) et
`findAllWithPackagings` (lignes 97-155) qui, eux, acceptent déjà ces query params et les
documentent via `@ApiQuery`. Résultat : `findAll()` appelle systématiquement
`this.marketPricesService.findAll(tenantId)` sans arguments, donc toujours avec les valeurs par
défaut `page=1, limit=200` — impossible pour un client (frontend ou autre) de demander une page
suivante, quelle que soit la taille réelle du jeu de données.

Côté frontend, `getMarketPrices()` (`datafriday-web/src/api/endpoints/menu.api.js:272-274`)
n'envoyait de toute façon aucun paramètre — voir la fiche miroir
`datafriday-web/docs/bugs/40_market_prices_cap_silencieux_200_lignes_mirror.md`.

## Correction

- `market-prices.controller.ts` : `findAll()` accepte désormais `@Query('page') page?: string` et
  `@Query('limit') limit?: string` (avec `@ApiQuery` correspondants, même pattern que
  `findAllWithIngredients`/`findAllWithPackagings`), transmis à
  `this.marketPricesService.findAll(tenantId, page ? +page : undefined, limit ? +limit : undefined)`.
  Le service n'a nécessité aucune modification (déjà prêt à recevoir `page`/`limit`).
- Côté frontend, le store `marketPrices` (module Vuex de la page `/market-prices`) boucle
  désormais sur toutes les pages jusqu'à récupération complète — voir la fiche miroir.

## Risque de régression / à surveiller

- Les autres appelants de `GET /market-prices` sans query params (ex: `SpaceLogisticView.vue`,
  `store/modules/inventory.js`, `useInventoryApi.js`, qui passent par le fichier séparé
  `market.price.api.js`) conservent exactement le même comportement par défaut
  (`page=1, limit=200`) qu'avant ce fix — aucune régression introduite pour ces consommateurs,
  mais ils resteront eux aussi plafonnés à 200 lignes tant qu'ils ne demandent pas explicitement
  les pages suivantes. À réévaluer si un de ces écrans est utilisé par un tenant à forte
  volumétrie.
- Vérifier que l'ordre des routes Nest reste correct : `with-packagings`/`with-ingredients` restent
  déclarées avant `:id` pour ne pas être capturées par la route paramétrée.
- Tester avec un tenant de test ayant > 200 `MarketPrice` (ou en abaissant temporairement `limit`)
  que la pagination `page=2` renvoie bien les lignes suivantes et non un doublon de la page 1.

## Références

- Fiche miroir frontend : `datafriday-web/docs/bugs/40_market_prices_cap_silencieux_200_lignes_mirror.md`.
- Pattern de référence déjà en place dans le même fichier : `findAllWithIngredients` (lignes
  118-186), `findAllWithPackagings` (lignes 188-247), et dans
  `src/features/ingredients/ingredients.controller.ts:28-41`.
