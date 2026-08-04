# BUG-295-01 — Réarmement : quantités fractionnées (0,7 kg) au lieu d'unités d'inventaire complètes

- **Statut** : 🟡 Corrigé non déployé (2026-08-04)
- **Sévérité** : 🔴 Critique (priorité absolue client — quantités inutilisables sur le terrain)
- **Domaine** : Stock (Réarmement / SpaceRestockView)
- **Repo(s) concerné(s)** : `datafriday-web` (100 % front)
- **Découvert le** : 2026-08-04 (signalement client)
- **Fichiers** :
  - `frontend/src/views/SpaceRestockView.vue:1862-1890` (`liveRestockRows` — cause racine)
  - `frontend/src/views/SpaceRestockView.vue:1302-1309` (`roundForUnit` — l'arrondi à 0,1 qui produisait le 0,7)
  - `frontend/src/utils/stockPlanning.js:455-507` (`computePackagingForQuantity` — formule colis + résolution étendue au MarketPrice niché, cause C2)
  - `frontend/src/utils/stockPlanning.js:517-526` (**nouveau** `coveredQuantityForPackaging`)
  - `backend/src/features/ingredients/ingredients.service.ts:24-29` (shape payload /ingredients — lecture seule, non modifié)
  - `frontend/tests/unit/restockPackagingRounding.spec.js` (**nouveau**)

## En clair

L'écran Réarmement calcule « à déposer = besoin − restant compté » et arrondissait ce chiffre à
0,1 près : d'où « 0,7 kg ». Or on ne dépose pas 0,7 kg d'un produit conditionné en paquets de
500 g — on dépose des paquets entiers. Le code savait déjà décrire le conditionnement (carte
« Inventory Information » : type de colis, unités par colis) et savait déjà arrondir au colis
supérieur, mais il appliquait cet arrondi au **besoin cible** (pour l'affichage « N colis »), pas
au manque réel, et la quantité suggérée restait fractionnée. Désormais : 0,7 kg de manque en
paquets de 0,5 kg → l'outil suggère **2 paquets, soit 1 kg**. Un article sans information de
conditionnement garde l'ancien arrondi (on ne peut pas inventer une taille de colis).

## Symptôme

| # | Constat |
|---|---|
| S1 | Colonne « À déposer » : quantités fractionnées (0,7 kg) impossibles à préparer physiquement |
| S2 | En mode colis, le `packedCount` affiché portait sur la **cible** du PDV, pas sur ce qu'il fallait réellement apporter (stock restant ignoré dans le compte de colis) |

## Cause racine

### C2 — Le conditionnement ne se résolvait JAMAIS pour un ingrédient (découvert au retest)

Premier lot livré, l'utilisateur ne voyait **aucun changement** sur « Éléments à stocker » ni
« Réarmement ». Cause : `computePackagingForQuantity` ne lisait que des champs **à plat** sur la
fiche catalogue (`packagingType || inventoryPackagingName || inventoryPackagingType ||
inventoryPackagingId`, `packagingUnitNumber ?? inventoryQuantityPackaged ??
inventoryNumberOfUnits`). Or :

| Fiche catalogue | Champs conditionnement réels | Résolution avant fix |
|---|---|---|
| Ingrédient (`/ingredients`, `ingredients.service.ts:24-29`) | **rien à plat** — tout niché dans `marketPrice.{inventoryPackaging, packedUnits, numberOfUnits…}` | ❌ toujours `null` |
| Composant (`MenuComponent`) | `inventoryPackaging` (libellé à plat), `packedUnits` | ❌ sauf `inventoryPackagingId` renseigné |
| Menu item (carte « Inventory Information ») | `inventoryPackagingType` + `inventoryNumberOfUnits` | ✅ |

Donc mode colis inaccessible et suggestion fractionnée sur tous les articles au poids/volume —
exactement le cas client (ingrédient kg en paquets de 500 g). L'inventaire, lui, résolvait déjà
correctement via sa propre chaîne (`inventoryUtils.js:507` `resolveQtyPackaged` :
`inventoryQuantityPackaged` sinon **`packedUnits`** — le drawer Market Price « Inventory
Information » persiste la qté/paquet dans `packedUnits`, jamais dans `inventoryQuantityPackaged`).

Fix : chaîne de candidats étendue dans `computePackagingForQuantity` — libellé
`src.inventoryPackaging` à plat, puis MarketPrice niché (`mp.inventoryPackaging` /
`mp.purchasePackaging` ; `src.packedUnits` / `mp.packedUnits` pour la qté/paquet, aligné sur
`resolveQtyPackaged`), `purchaseUnitConversion` niché en repli. Les priorités existantes sont
inchangées (aucun champ déjà résolu ne change de source — pas de régression BUG-239).

## Cause racine (lot 1)

`liveRestockRows` (`SpaceRestockView.vue`, avant correction) :

```js
const packaging = this.packagingForItem(row, targetQuantity)   // colis sur la CIBLE
const restockQuantity = Math.max(
  0,
  roundForUnit(targetQuantity - remainingQuantity, row.unit),  // gap arrondi à 0,1
)
```

Deux défauts indissociables :

1. `restockQuantity` (la suggestion) n'était jamais alignée sur le conditionnement — `roundForUnit`
   arrondit à l'entier pour `pcs`, à 0,1 près pour tout le reste (kg, L…) → 0,7 kg.
2. `packaging.packedCount` était calculé sur `targetQuantity` (le besoin brut du PDV), pas sur le
   manque. Avec du stock restant, le nombre de colis affiché était surestimé — et incohérent avec
   la quantité loose affichée à côté (`formatRestockQuantity`, `:4002`).

La formule d'arrondi au colis existait déjà et était correcte
(`computePackagingForQuantity`, `stockPlanning.js:481` : `ceil((qty / packagingUnitNumber) ×
purchaseUnitConversion)`) — elle était simplement appliquée à la mauvaise quantité, et sa
couverture (combien les colis entiers représentent dans l'unité de la ligne) n'était calculée
nulle part.

## Correction

1. **`stockPlanning.js` — `coveredQuantityForPackaging(packaging)` (nouveau, pur)** : quantité
   couverte par les colis entiers, reconvertie dans l'unité de la ligne —
   `packedCount × packagingUnitNumber ÷ purchaseUnitConversion` (l'inverse exact de la formule
   `packedCount`). Accepte le packaging vivant (conversion portée par `source`) et le packaging
   figé des plans (`freezePackaging`, conversion à plat).
2. **`liveRestockRows`** :
   - le comptage restant continue d'utiliser un packaging de référence calculé sur la cible
     (seule la taille de colis compte, elle ne dépend pas de la quantité) ;
   - `packaging` (celui de la ligne, affiché) est recalculé sur le **manque**
     (`rawGap = max(0, cible − restant)`) ;
   - `restockQuantity = coveredQuantityForPackaging(packaging)` quand le conditionnement existe
     (colis entiers : 0,7 kg → 1 kg), sinon `roundForUnit(rawGap)` (comportement historique).

Chaîne aval inchangée par construction :

- `formatRestockQuantity` (`:4002`) affiche désormais « 2 Paquet (1 kg) » — les deux moitiés
  sont enfin cohérentes ;
- la feuille de course (étape 3) somme `restockQuantity` (`:2024`) puis recalcule son propre
  packaging sur la quantité nette (`:2031`, `nettedShopping :2191`) — elle reçoit maintenant des
  multiples de colis par PDV ;
- les corrections manuelles « À déposer » (`lineOverrides`) restent souveraines : une valeur
  saisie n'est jamais réarrondie (choix assumé — l'utilisateur peut vouloir déposer un fond de
  paquet déjà ouvert) ;
- les plans figés (ADR-0005) rejouent leurs valeurs photographiées, sans recalcul — les plans
  sauvegardés avant le fix conservent donc leurs quantités fractionnées (document figé).

## Risque de régression / à surveiller

- **Sur-provisionnement volontaire** : chaque PDV est arrondi au colis supérieur AVANT
  l'agrégation feuille de course. 3 PDV à 0,7 kg = 6 paquets (3 kg) et non 5 paquets (ceil de
  2,1 kg). C'est le comportement métier demandé (on dépose des colis entiers PAR point de
  vente), pas un bug d'agrégation.
- **`packagingForItem` est appelé deux fois par ligne** (référence cible + manque). Coût
  marginal (computed Vue caché, catalogue scanné linéairement comme avant) ; à revoir seulement
  si le profil montre un point chaud.
- **Stock-up (Event Predict)** : `EventPredictStockUpSection.vue:684-718` (`computePackaging`)
  garde sa propre logique d'affichage — écran de projection, pas de dépôt. Non touché ici ;
  l'unification des chemins est le chantier [BUG-292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md).
- **`recomputePackaging`** (`restockPlanSnapshot.js:67`) reste l'exact miroir de la formule
  vivante — aucune des deux n'a changé, l'identité photo/rejeu tient.

## Tests

- `frontend/tests/unit/restockPackagingRounding.spec.js` (**nouveau**, 8 cas) — dont le cas
  client : 0,7 kg en paquets de 0,5 kg → `packedCount` 2 et couverture **1 kg** ; multiple exact
  sans sur-arrondi ; `purchaseUnitConversion ≠ 1` (reconversion unité de ligne) ; packaging figé
  sans `source` ; absence de conditionnement → `null` (repli historique) ; **shape backend
  réelle** : ingrédient sans champ à plat, conditionnement dans le MarketPrice niché
  (`packedUnits` 0,5 + `inventoryPackaging`) ; composant à libellé `inventoryPackaging` à plat.

`pnpm test:unit` : **873 passés**. 4 échecs préexistants, identiques à ceux documentés dans
[BUG-290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md) — `apiOrMock.spec.js`,
`eventDetailsEditor.spec.js`, `spaceMenusInventory.spec.js`. Aucun n'importe un fichier touché ici.

## Références

- `frontend/docs/modules/06_STOCK_INVENTAIRE.md` — domaine Stock.
- [BUG-288-01](288_01_restock_composant_partage_lignes_dupliquees.md) — `Math.ceil` packaging appliqué N fois (identité catalogue).
- [BUG-239](239_pre_event_taille_de_paquet_divergente_serveur_front.md) — priorités de résolution de la taille de paquet.

---

JLH
