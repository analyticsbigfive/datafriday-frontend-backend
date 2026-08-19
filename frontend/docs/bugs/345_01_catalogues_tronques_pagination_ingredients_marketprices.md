# BUG-345-01 — Catalogues tronqués à la page 1 : ingrédients (100) et market prices (200) — conditionnements introuvables en fin d'alphabet

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (silencieux, dépend de la taille du catalogue)
- **Domaine** : Réarmement / Liste de courses / catalogues
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul — la pagination backend est saine)
- **Découvert le** : 2026-08-19 (recette JLH post-344-01 : « Tsingtao - fut 30L », « X1 » et
  d'autres en « Packaging not resolved » malgré des fiches remplies)
- **Fichiers** : `src/utils/paginateAll.js` (nouveau), `src/composables/useSpaceData.js`,
  `src/store/modules/inventory.js`, `src/api/endpoints/ingredient.api.js`,
  `src/api/endpoints/market.price.api.js`, `tests/unit/paginateAll.spec.js`

## Symptôme

Après les fixes 342/344, plusieurs articles restent en « Packaging not resolved » — et le motif
est alphabétique : « Tsingtao », « X1 »… la fin de l'alphabet, jamais le début.

## Cause racine

Les endpoints catalogue sont paginés côté backend avec un plafond par page et un tri
`name asc` :

- `GET /ingredients` → défaut **page 1, limit 100** (`ingredients.controller.ts:40`) ;
- `GET /market-prices` → défaut **page 1, limit 200**.

Or les deux appels frontend qui alimentent les pools de résolution du Réarmement ne passaient
AUCUN paramètre et ne lisaient pas `meta.total` :

- `useSpaceData` (vague 2b) : `getIngredients()` → pool `ingredients` = les 100 premiers noms ;
- `inventory/loadMarketPrices` : `getMarketPrices()` → pool `marketPrices` = les 200 premiers.

Tout article au-delà de la coupure n'existe dans AUCUN pool → `findStockReference` ne résout
rien → pas de conditionnement, pas de référence d'achat, pas de fournisseur. Les composants
avaient déjà eu exactement ce bug (BUG-054/105) et leur boucle paginée (`fetchAllMenuComponents`)
existait dans le même fichier.

## Correction

- Nouvel util [`fetchAllPaginated`](../../src/utils/paginateAll.js) — même stratégie que
  `fetchAllMenuComponents` : page 1 séquentielle pour lire `meta.total`, pages restantes en
  parallèle borné (`runWithConcurrency`, 4), ordre préservé, tolère les réponses tableau nu
  (une page, pas de boucle infinie). 4 tests unitaires.
- `useSpaceData` : ingrédients chargés via la boucle (limit 100).
- `inventory/loadMarketPrices` : market prices chargés via la boucle (limit 200) — le cache
  disque (SWR) et le single-flight existants sont conservés tels quels.
- `ingredient.api.getIngredients` / `market.price.api.getMarketPrices` acceptent désormais
  `{ page, limit }` (rétrocompatible : sans argument, comportement identique à avant).

## Effet de bord VOULU sur `store/modules/marketPrices.js` (écran Market Price List)

Ce store bouclait déjà en passant `{ page, limit }` — mais l'ancienne signature
`getMarketPrices()` **ignorait ses arguments** : pour un tenant à plus de 200 prix, chaque
itération refetchait la PAGE 1 et la concaténait, jusqu'à `rows.length >= total`. La liste
contenait donc des **doublons** (et jamais les lignes au-delà de 200). En honorant les params,
ce fix répare aussi ce bug latent — non détecté jusqu'ici, aucune ligne de code de ce module
modifiée. À vérifier en recette si l'écran Market Price List est volumineux.

## Limites / à surveiller

- **Autres appelants non touchés** (toujours page 1 seule, comportement d'avant) :
  `StorageInventorySection.vue:313` (Builder), `SpaceLogisticView.vue:1007`,
  `useInventoryApi.js`, `RecipeImportDrawer.vue:174` (ingrédients). Même famille de bug latent —
  à traiter si un symptôme remonte, chantier séparé.
- Volume : un tenant à N articles fait désormais ceil(N/100) appels ingrédients (parallèle
  borné). Cache Redis backend 60 s par (page, limit) : inchangé.
- `fetchAllMenuComponents` (useSpaceData) garde sa boucle locale historique — non refactorée
  vers l'util (pas de test de non-régression sur ce chemin) ; dette notée ici.

## Références

- BUG-054 / BUG-105 (même bug sur les composants, même remède), BUG-344-01 (le symptôme qui a
  mené ici), BUG-342-01.

JLH
