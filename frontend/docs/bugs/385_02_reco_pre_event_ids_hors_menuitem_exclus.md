# BUG-385-02 — Réco pre-event : les lignes comptées sous un id MarketPrice/MenuComponent sont exclues et remplacées par la valeur Logistic

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Stock (Pre-event Inventory, réconciliation), attendus à l'écran
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-09-17 (retour Bertrand, AJA-Brest, PDV 6A)
- **Fichiers** : `backend/src/features/inventory/inventory.service.ts` (`createPreEventReconciliation`,
  `computeLogisticExpected`, `resolveInventoryUnitsPerPack`, `netMovementUnitsForEventWindow`)

## Symptôme

Sur le PDV 6A d'Auxerre, comptage fait sur mobile (PIN manager), réconciliation générée sur desktop
(compte admin) : la feuille pre-event montre pour « Coca-Cola CAN 33cl » une valeur qui n'est pas celle
comptée, « des erreurs partout sauf sur barre chocolatée », et beaucoup d'articles comptés sont
absents de la feuille. L'onglet de comptage (même écran) affiche pourtant les bonnes valeurs.

Chiffres base dev, 60 derniers jours : **1 760 des 2 510 lignes comptées (70 %) ne portent pas un id
MenuItem** (1 630 MarketPrice, 114 MenuComponent). Feuilles pre-event : « AJA vs Angers » 135 lignes
conservées pour **256 exclues**, PFC-Lyon 54 / 77, PFC-Strasbourg 103 / 26.

## Cause racine

L'inventaire compte « à 1 cran » (règle n°0 du module Stock) : pour un menu `readyForSale = No` ou un
combo, la ligne comptée porte l'id de l'**ingrédient (MarketPrice)** ou du composant
(`componentIngredientId`, `inventoryUtils.js:292`), jamais celui d'un MenuItem. Et la liste est
dédoublonnée par **nom** : si « Coca-Cola CAN 33cl » apparaît d'abord comme ingrédient d'un menu, il
est compté sous son id MarketPrice, même si un MenuItem homonyme existe. Mobile et desktop utilisent
la même fonction (`buildConsolidatedInventory`), les ids concordent entre eux.

Côté serveur, `createPreEventReconciliation` :
1. résolvait les noms **uniquement** via `menuItem.findMany` ;
2. excluait toute ligne dont l'id ne résout pas (« lignes orphelines », commit `7172ad7e`, 2026-07-24)
   → le comptage disparaissait de la feuille ;
3. joignait l'attendu Logistic (clé = nom) vers un id **MenuItem** par nom → la ligne « Coca-Cola CAN
   33cl » existait quand même sous l'id MenuItem, sans comptage sous cet id, donc marquée `(L)` avec la
   **valeur Logistic** à la place du compté (BUG-383-02).

Même famille : `getPreEventBaseline` / `getPostEventBaseline` clés par id MenuItem → aucun hint
« Attendu » à l'écran pour ces lignes, et en post-event aucun stock de départ (`expectedUnits`) ni
mouvements (`movementUnits`) pour elles. `resolveInventoryUnitsPerPack` ne partait que d'ids MenuItem
→ conditionnement 1 pour les autres, totaux en unités faux.

Le push Logistic (`pushCountToLogistic` → `resolveItemKeysByIds`), lui, résolvait déjà tous les
catalogues : le registre était juste, seule la feuille et les attendus étaient faux.

## Correction

Branche `fix/pre-event-flow-robust` (avec le fix du flux Doors Open / push incrémental).

- `catalogIdsByNormName` remplace `menuItemIdByNormName` : un nom Logistic est joint à **tous** ses ids
  (MenuItem, puis MarketPrice `itemName`, puis MenuComponent). `computeLogisticExpected` expose
  l'attendu sous chaque id et renvoie `aliasGroups` (élément × nom → ids).
- `createPreEventReconciliation` : identités des lignes via `resolveItemKeysByIds` (tous catalogues,
  même chemin que le push) ; pour un (élément × nom), les ids **comptés** sont conservés, sinon un seul
  id principal (pas de doublon « (L) ») ; `itemKind` archivé sur chaque ligne ; les vrais orphelins
  (id dans aucun catalogue) restent exclus.
- `resolveInventoryUnitsPerPack` : tous types d'id, ordre du front (intention MenuItem par id ou nom >
  MarketPrice par id ou nom > MenuComponent > 1).
- `netMovementUnitsForEventWindow` : mouvements exposés sous tous les ids du nom.
- Tests : `inventory.service.spec.ts`, bloc « identité article multi-catalogue » (Coca sous id
  MarketPrice avec MenuItem homonyme, Frites MarketPrice seul, composant sans registre, Bière Logistic
  seule sans doublon, hints sous tous les ids, ordre du conditionnement).

## Risque de régression / à surveiller

- Les feuilles pre-event déjà générées en prod restent fausses : régénérer (Save, ou « PDV complet »)
  après déploiement ; le push Logistic incrémental ne repoussera rien si les comptages n'ont pas bougé.
- Un article présent dans deux catalogues avec un conditionnement différent (MenuItem 6, MarketPrice 24)
  suit désormais la règle du front (intention MenuItem prime, y compris sur l'id MarketPrice).
- `unjoinedItemKeys` diminue mécaniquement (les noms MarketPrice/MenuComponent sont désormais joints).

## Références

- Chantier 381 (`docs/chantiers/381_pre_event_inventory_criteres_acceptation/PLAN.md`), BUG-235
  (exclusion des orphelines), BUG-239 (conditionnement), BUG-383-02 (lignes « (L) »), BUG-352-01.
