# BUG-342-01 — Réarmement/liste de courses : total de packs, référence d'achat, conditionnement non résolu

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock & inventaire (Réarmement, liste de courses)
- **Repo(s) concerné(s)** : les deux (frontend + `api-datafriday-staging`, voir fiche miroir
  backend BUG-131-01)
- **Découvert le** : 2026-08-19 (réunion Bertrand)
- **Fichiers** : `src/views/SpaceRestockView.vue`, `src/utils/stockPlanning.js`,
  `src/i18n/translations.js`

## Symptôme

Réunion Bertrand 2026-08-19, page Réarmement / liste de courses :

1. Pas de **total de packs par article** tous PdV confondus (« sur la Blumberger il faudrait 50
   plus 27, il manque juste le total… 77 packs of four pieces », 7:24).
2. Pas de **référence d'achat** (colonne Supplier item du Market Price) sous l'article.
3. **Coca-Cola Sherry Can 33cl** : « 74 pièces » au lieu de colis, alors que la carte
   « Inventory Information » du menu item porte « pack de 24 » (10:00-14:14).
4. **Viande tranchée** : « 405 packs de 1 kg » au lieu de 9 — la conversion 0,02 kg/pièce du
   Market Price n'était pas appliquée (18:00-19:50). Même symptôme dans l'email fournisseur
   (14:46), qui passe par le même formatteur.

## Cause racine

1-2. Fonctionnalités absentes.

3. `computePackagingForQuantity` s'arrêtait à la référence de `findStockReference` : le menu item
   Coca contient un **ingrédient homonyme**, résolu en premier, sans champ de conditionnement
   exploitable → garde `!packagingType || !packagingUnitNumber || !packagingUnit` → null →
   affichage en unités de recette.

4. La conversion est lue sur `mp.purchaseUnitConversion` du MarketPrice **niché** de l'ingrédient
   — et le select backend `marketPriceSelectNoImage` (`ingredients.service.ts`) **omettait ce
   champ** : le repli frontend (`stockPlanning.js`) retombait sur 1. Cause backend, fiche miroir
   BUG-131-01.

## Correction

Branche `fix/inventaire-attendus-packs-rearmement` (2026-08-19) :

- **Total de packs par groupe** : `groupPackTotal(group)` = Σ par ligne de
  `packCountForQuantity(effectiveRestockQuantity(row), row.packaging)` — somme des arrondis PAR
  LIGNE (on dépose des colis entiers par PdV), jamais l'arrondi de la somme. Chip dans
  `sr-group-head-end`. `effectiveRestockQuantity` = override du plan chargé sinon
  `restockQuantity` ; au passage `depositPackCount` lit désormais la même valeur (le sous-titre
  « 3 Cartons » contredisait le champ édité d'un plan chargé).
- **Référence d'achat** : `marketPriceRefFor(group)` →
  `source.marketPrice?.supplierItem ?? source.supplierItem` de la référence résolue, sous le nom
  du groupe (clé `srMarketRef`). Rien si absente.
- **Continuation de porteur de conditionnement** (`stockPlanning.js`) : extraction sortie en
  `packagingFieldsFrom` ; si la référence principale n'a AUCUN conditionnement exploitable,
  `findStockReferenceCandidates` (toutes les correspondances par id, puis par nom — un homonyme
  par nom ne passe jamais devant une correspondance par id, règles BUG-299-01 intactes) fournit le
  premier porteur qui en a. `source` reste la référence principale (identité/fournisseur) ; la
  conversion EFFECTIVE est posée à plat sur l'objet packaging pour que
  `coveredQuantityForPackaging` inverse avec la même valeur.
- **Résiduel non résolu** : quantité brute + icône info et tooltip `srShoppingNoPackaging`
  nommant les champs catalogue manquants.
- Tests : `restockPackagingRounding.spec.js` (conversion nichée 405 → 9 packs ; continuation coca
  74 → 4 packs de 24 ; non-régression homonyme BUG-299-01),
  `restockDepositPacks.spec.js` (50+27 → 77 ; somme des arrondis ≠ arrondi de la somme).

## Risque de régression / à surveiller

- La continuation de porteur peut faire apparaître des colis sur des lignes qui affichaient des
  pièces — voulu, mais vérifier en recette qu'aucun article ne prend le conditionnement d'un
  homonyme aberrant (le cas ne se produit que si la référence pointée n'a AUCUN conditionnement).
- La correction 4 (conversion) exige le **redéploiement backend** de BUG-131-01 — la recette
  frontend seule ne montre rien pour la viande tranchée.
- Plans de réarmement figés (`restockPlanSnapshot.freezePackaging`) : la conversion à plat était
  déjà le contrat de `coveredQuantityForPackaging` — inchangé.

## Références

- Fiche miroir backend : `api-datafriday-staging` BUG-131-01 (select ingrédients).
- BUG-295-01 (arrondi colis entiers), BUG-299-01 (résolution deux passes id/nom).
- Bug de SAISIE de la conversion (0,015 ↔ 0,02, hors périmètre de cette branche) : le champ du
  drawer Market Price est un `NumberField` à 2 décimales
  (`MarketPriceEditDrawer.vue`) — 0,015 y est arrondi à 0,02 au blur. À traiter séparément.
- Réunion : https://fathom.video/share/32quEeoVBR3gAqzW8h9sJNiRSvHvareW

JLH
