# BUG-84 — Inventaire : N+1 `GET /space-menu/shop/:shopId` alors qu'un batch existe (payload trop maigre)

- **Statut** : 🟢 Corrigé (en code, non déployé)
- **Sévérité** : 🟠 Majeur/perf (rendu initial Space Inventory)
- **Domaine** : Stock (Inventory) / Menu
- **Repo(s) concerné(s)** : les deux (canonique ici ; miroir `datafriday-web/docs/bugs/162_inventaire_adopte_batch_shop_items.md`)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:1060-` ; front `src/composables/useInventoryData.js:225-251` (avant fix)

## Symptôme

Le chargement de Space Inventory faisait **1 requête par shop** (`shopMenuItems/fetchForShop`, concurrence 6) + une passe de retry (concurrence 3) — jusqu'à ~2×N requêtes par affichage, N = nombre de shops de la config. L'endpoint batch `GET /space-menu/:spaceId/:configId/shop-items` (1 appel pour tous les shops, déjà utilisé par la page Analyse) existait mais ne portait pas les champs dont l'inventaire a besoin (`basePrice`, `picture`).

C'est la moitié « shopMenuItems / fetchForShop » du N+1 décrit dans BUG-010.

## Cause racine

Payload batch conçu pour l'usage Analyse (id/nom/catégorie uniquement) ; l'inventaire est resté sur l'endpoint unitaire complet.

## Correction

2026-07-18 :
- Backend : `getConfigShopMenuItemsLight` renvoie aussi `basePrice` (Number) et `picture` — additif, les consommateurs existants (page Analyse) ignorent les champs en plus.
- Front (`useInventoryData.js`) : batch d'abord (1 requête) ; un shop absent de la réponse = « 0 item » (l'union des shops est connue avant) ; le fan-out per-shop + retry n'est conservé qu'en **fallback** (échec batch / backend déployé antérieur).

## Risque de régression / à surveiller

Le batch ne renvoie que les items `enabled` (le filtre front `enabled === true` devient no-op sur ce chemin — équivalent). Décimal `basePrice` sérialisé en Number. Onglet réseau attendu en staging : 1 requête shop-items au lieu de N.

## Références

- BUG-010 (N+1 predict/toolbox — l'autre moitié, event-timeline, corrigée côté front fiche 157)
- Miroir front : fiche 162
