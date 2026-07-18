# BUG-162 — (miroir) Space Inventory : adoption du batch shop-items (fin du N+1 par shop)

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟠 Majeur/perf (rendu initial Space Inventory)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : les deux — **fiche canonique : `api-datafriday-staging/docs/bugs/84_shop_items_batch_incomplet_n1_inventaire.md`**
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/composables/useInventoryData.js` (`loadContext`, section « Menus pour TOUS les shops »)

## Symptôme / Cause racine

Voir fiche canonique backend 84 : 1 requête `shopMenuItems/fetchForShop` par shop (+ passe de retry) là où le batch `getConfigShopMenuItemsLight` (déjà utilisé par la page Analyse) pouvait tout servir en 1 appel — une fois enrichi de `basePrice`/`picture`.

## Correction

2026-07-18 : batch d'abord (1 requête pour l'union des shops) ; shop absent de la réponse = « 0 item » (l'union est connue avant l'appel) ; le fan-out per-shop + retry conservé en **fallback** (échec batch ou backend déployé antérieur à l'enrichissement). Les items batch n'ont pas de champ `enabled` → la garde `hasEnabledField` existante les laisse passer tels quels (le batch ne renvoie QUE les items activés — équivalent).

## Risque de régression / à surveiller

Vérifier en staging l'affichage des prix (basePrice décimal → Number) et des images d'items sur les cartes inventaire, et l'onglet réseau (1 requête shop-items).

## Références

- `api-datafriday-staging/docs/bugs/84_shop_items_batch_incomplet_n1_inventaire.md` (canonique), backend BUG-010
