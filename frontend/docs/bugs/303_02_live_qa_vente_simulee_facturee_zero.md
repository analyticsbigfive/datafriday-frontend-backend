# BUG-303-02 — Live/QA : vente simulée facturée à 0€ (mapping Weezevent dupliqué)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Live events / Stock (module QA simulation)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur : CA à 0€ malgré des quantités/coûts non nuls sur un event live de test)
- **Fichiers** : `backend/src/features/logistics/logistics.service.ts` (`simulateSale`, `getSimulableShops`), `backend/src/shared/pricing/menu-item-pricing.service.ts`

## Symptôme

Écran Live : CA à 0€ partout (KPI, Performance des articles, Performance des événements) alors que
le COÛT affichait un montant non nul et que des quantités réelles (130+ unités) étaient bien
comptées. Reproduit uniquement sur des ventes simulées via le widget QA (`LiveSaleSimulatorWidget`),
pas sur des ventes Weezevent réelles.

## Cause racine

Le menu item concerné (« Tsing Tao 25cl 25/26 ») avait **deux** lignes `ProductMapping` vers deux
produits Weezevent différents (le schéma autorise plusieurs mappings par `menuItemId`,
`@@unique([salesProductId])` seulement) : l'un avec `basePrice=4€` (sain), l'autre — un doublon créé
par un re-sync ultérieur — avec `basePrice=null`. `simulateSale()`
(`logistics.service.ts:1905`) résolvait le mapping via `new Map(productMappings.map((m) =>
[m.menuItemId, m]))` : sans `orderBy`, l'ordre Prisma n'est pas garanti, donc le `Map` retenait tantôt
le bon mapping, tantôt le doublon cassé. Quand c'est ce dernier qui gagnait, `unitPrice` valait 0,
écrit en dur dans `SalesTransactionItem` — d'où le CA à zéro (les quantités et le coût, calculés
autrement, restaient corrects).

## Correction

`simulateSale()` et `getSimulableShops()` ne lisent plus le prix depuis `SalesProduct.basePrice` (le
produit Weezevent mappé) — ils utilisent le **prix catalogue DataFriday de l'espace courant** :
`SpaceMenuItem.priceTtc` (override par espace) → sinon `MenuItem.basePrice`, TVA en repli sur
`MenuItemPricingService.getTenantDefaultVatRate()`. Le mapping Weezevent reste utilisé uniquement
pour attribuer `productId`/`productName` (reporting), plus jamais pour le prix. Nettoyage
complémentaire : suppression en base du mapping dupliqué au prix incomplet.

## Risque de régression / à surveiller

Ventes réelles (webhook Weezevent) non concernées — elles portent leur propre prix dans le payload,
indépendant de cette résolution. Si un futur re-sync Weezevent recrée un produit dupliqué sans prix,
`simulateSale` reste immunisé (ne dépend plus de `SalesProduct.basePrice`) ; seul l'attribut
`productId` du reporting pourrait encore flipper entre les deux mappings — impact mineur, pas sur le
CA. Tests : `logistics.service.spec.ts` (2 tests `getSimulableShops`, dont un override
`SpaceMenuItem`).

## Références

- `docs/modules/11_LIVE.md` (module Live).
