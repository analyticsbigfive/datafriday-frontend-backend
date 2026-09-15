# BUG-383-02 : Pre/Post-event Inventory : articles d'une seule configuration, et propositions non comptées poussées vers Logistic

- **Statut** : 🟡 Corrigé non déployé (branche `fix/inventory-products-all-configs`, 2026-09-15)
- **Sévérité** : 🔴 Bloquant/impact business (inventaires quasi vides sur 56 events de Jean Bouin ; stock Logistic écrasé par des valeurs non recomptées)
- **Domaine** : Inventaire pre/post-event / Logistic
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-09-12 (remontée Bertrand), règles validées par Bertrand le 2026-09-15
- **Fichiers** : `src/features/space-menus/space-menus.service.ts` (`getConfigShopMenuItemsLight`), `src/features/space-menus/space-menus.controller.ts`, `src/features/guest-pin-access/guest-pin-access.service.ts` (`getEnabledMenuItemIds`), `src/features/inventory/inventory.service.ts` (`pushCountToLogistic`), `datafriday-web/src/composables/useInventoryData.js`, `datafriday-web/src/api/endpoints/menu.api.js`

## Symptôme

"Dans Pre et Post Inventaire, les produits à compter ne semblent pas agréger toutes les configurations, seulement ceux du space menu de la configuration de l'event."

Mesuré en base sur Jean Bouin (7 configurations) : 39 events liés à "Plan Max (SFP+PFC)" qui n'a **1** article assigné, 12 à "SFP - PM" (1 article), 5 à "PFC - PM (Sans alcool)" (7 articles). Pour ces matchs, l'inventaire proposait 1 à 7 produits. 75 articles n'existaient que dans d'autres configurations du même espace.

## Cause racine

1. Un event est lié à une seule configuration (`Event.configurationId`) et la liste à compter était strictement `MenuAssignment.configId = cette configuration` (front `useInventoryData` → `getConfigShopMenuItemsLight`, invité PIN → `getEnabledMenuItemIds`). Ce n'est pas un filtre oublié mais le modèle appliqué partout ; il est correct pour l'Analyse et Space Menu, pas pour compter un stock physique partagé entre configurations.
2. Constat annexe pendant la vérification : en post-event, `getBySpaceAndEvent(..., 'post-event')` renvoie les comptages pre-event comme **propositions** (`isCounted=false`, `carriedFromPreEvent`), et `pushCountToLogistic` les poussait toutes vers `LogisticsService.reset` comme si elles avaient été recomptées. Contraire à la règle "on ne met à jour que ce qui a été compté".

## Règles validées par Bertrand (2026-09-15)

- On n'inventorie que les PdV ouverts pour l'event (sa configuration), pre et post.
- Les articles par PdV sont l'union de toutes les configurations de l'espace : mélanger foot et rugby n'est pas un problème, en post-event on compte des choses réutilisables pour un autre type d'event.
- Mise à jour Logistic : uniquement ce qui a été compté ; le non-compté garde la valeur présente dans Logistic, jamais remis à 0.

## Correction

- `getConfigShopMenuItemsLight(spaceId, configId, tenantId, { itemsScope })` : `itemsScope: 'space'` garde les PdV de la configuration mais lit `MenuAssignment` avec `config: { spaceId }` (toutes les configurations de l'espace), dédup par article. Query `?itemsScope=space` sur `GET /space-menu/:spaceId/:configId/shop-items`. Défaut inchangé (`config`) pour l'Analyse et Space Menu.
- `useInventoryData.loadContext` appelle le batch avec `itemsScope: 'space'`. Le fallback per-shop (`shopMenuItems/fetchForShop`, échec du batch uniquement) reste scopé configuration : dégradé, pas faux.
- Invité PIN : `getEnabledMenuItemIds` applique la même union (configs du même espace, jamais un autre espace).
- `pushCountToLogistic` ne construit des lignes que pour `isCounted === true` ; aucune ligne validée = pas de reset (`no-counts`). `LogisticsService.reset` préservait déjà les niveaux non couverts (consommation dérivée matérialisée, pas de remise à 0), la règle Bertrand est donc respectée de bout en bout.
- Tests : `space-menus.shop-items-light.spec.ts`, `guest-pin-access.catalog.spec.ts`, `inventory.service.spec.ts` (2 cas push).

## Risque de régression / à surveiller

- Un PdV assigné à des articles dans une configuration d'un autre club voit ces articles apparaître à compter : voulu (Bertrand). Si un client veut cloisonner, ce sera par espace, pas par configuration.
- Le staff qui saisit des quantités sans cocher "compté" : ces lignes ne sont plus poussées vers Logistic. Le dialogue de confirmation "Update Logistic" liste déjà les articles non comptés ; c'est cohérent avec `isCountComplete`.
- Données : les 39 events "Plan Max" restent liés à une configuration presque vide ; les PdV proposés sont ceux de cette configuration (1 PdV). Il faut relier ces events à la bonne configuration (action données, pas code).

## Références

- BUG-237 (propositions pre → post), BUG-239, chantier 381 (flux pre-event), `datafriday-web/docs/modules/10_POST_EVENT_INVENTORY.md` §4.6.
