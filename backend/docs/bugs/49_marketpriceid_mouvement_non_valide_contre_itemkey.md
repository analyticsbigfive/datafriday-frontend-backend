# BUG-049 — `createMovement` accepte un `marketPriceId` sans le valider contre `itemKey`

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
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

Non corrigée dans cette passe. Le risque via le parcours UI normal a été éliminé côté front
(`datafriday-web` BUG-032 : le dropdown ne propose plus que les Market Prices dont `itemName`
correspond réellement à la denrée). Reste ouvert : un appel API direct au endpoint pourrait encore
envoyer un `marketPriceId` incohérent avec `itemKey`.

Piste de correction possible (non arbitrée) : dans `createMovement`, si `dto.marketPriceId` est
fourni, vérifier que `marketPrice.itemName` correspond à `dto.itemKey` (ou qu'il existe un lien
`Ingredient.marketPriceId` résolvant vers ce nom) avant de l'utiliser pour dériver `unitsPerPack` —
sinon rejeter en 400 ou ignorer silencieusement le `marketPriceId` fourni (à trancher avec le
owner du domaine, Ulrich).

## Risque de régression / à surveiller

- Les `StockLevel.unitsPerPack` déjà corrompus par un mouvement passé ne sont pas corrigés par ce
  diagnostic seul.
- Si ce ticket est repris : vérifier qu'un ingrédient légitimement lié à plusieurs Market Prices
  (multi-fournisseur, même `itemName`) reste accepté par la validation ajoutée.

## Références

- Fiche complète (symptômes, fix front appliqué) :
  `datafriday-web/docs/bugs/32_logistic_marketprice_selecteur_non_scope_et_total_colle.md`.
- BUG-048 (même fichier, même famille de code `itemRefsForMenuItem`/référentiel Logistic).
