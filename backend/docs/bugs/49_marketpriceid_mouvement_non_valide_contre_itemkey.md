# BUG-049 — `createMovement` accepte un `marketPriceId` sans le valider contre `itemKey`

- **Statut** : 🟢 Corrigé (2026-07-24)
- **Sévérité** : 🟠 Majeur (peut corrompre `StockLevel.unitsPerPack`, donc le Total affiché)
- **Domaine** : Stock (Logistic)
- **Repo(s) concerné(s)** : les deux — fiche complète et fix côté front :
  `datafriday-web/docs/bugs/32_logistic_marketprice_selecteur_non_scope_et_total_colle.md`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/features/logistics/logistics.service.ts:182` (`applyLevelDelta`),
  `:261-269` (`createMovement`)

## Symptôme

Voir BUG-032 côté front pour le contexte complet. Ici, le point backend précis : `POST
/logistics/movements` accepte n'importe quel `marketPriceId` appartenant au tenant, sans vérifier
qu'il correspond réellement à la denrée (`itemKey`) du mouvement.

## Cause racine

`createMovement` (`logistics.service.ts:261-269`) résout `unitsPerPack` depuis
`marketPrice.packedUnits` dès que `dto.marketPriceId` est fourni, sans jointure/contrainte sur
`itemKey`. `applyLevelDelta` (`:182`) applique ensuite ce `unitsPerPack` au `StockLevel` de la
ligne (élément × denrée) — écrasant la valeur précédente pour tous les mouvements suivants. Un
appelant (UI ou API directe) qui envoie un `marketPriceId` sans rapport avec la denrée corrompt
silencieusement le pack size utilisé pour le calcul du Total côté front.

## Correction

**Correction appliquée (2026-07-24)** — `createMovement` (`logistics.service.ts:294-311`) charge
désormais `itemName` en plus de `packedUnits` sur le `MarketPrice` résolu, et compare
`mp.itemName` (trim + lowercase) à `dto.itemKey` — même normalisation que
`resolveUnitsPerPackForItemKey` (comparaison insensible casse/espaces). Sur mismatch (ou
`itemName` vide), rejet en `BadRequestException` (400), cohérent avec le pattern
`NotFoundException` déjà en place juste au-dessus pour un `marketPriceId` inexistant. Le risque via
le parcours UI normal restait déjà éliminé côté front (BUG-032) ; ce correctif ferme le trou côté
appel API direct.

Test : `backend/src/features/logistics/logistics.service.spec.ts` (describe "createMovement —
BUG-049").

## Risque de régression / à surveiller

- Les `StockLevel.unitsPerPack` déjà corrompus par un mouvement passé ne sont pas corrigés par ce
  diagnostic seul.
- Si ce ticket est repris : vérifier qu'un ingrédient légitimement lié à plusieurs Market Prices
  (multi-fournisseur, même `itemName`) reste accepté par la validation ajoutée.

## Références

- Fiche complète (symptômes, fix front appliqué) :
  `datafriday-web/docs/bugs/32_logistic_marketprice_selecteur_non_scope_et_total_colle.md`.
- BUG-048 (même fichier, même famille de code `itemRefsForMenuItem`/référentiel Logistic).
