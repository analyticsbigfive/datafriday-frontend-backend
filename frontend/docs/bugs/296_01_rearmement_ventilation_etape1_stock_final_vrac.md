# BUG-296-01 — Réarmement : ventilation besoin/restant/manque invisible à l'étape 1, stock final et reste en vrac non calculés

> **Mise à jour 2026-08-04 (Lot 2, JLH)** : l'AFFICHAGE étape 1 introduit par cette fiche
> (Restant / Manque / Paquets / Quantité couverte / Reste en vrac / Stock final) a été remplacé
> par 4 colonnes — Prédit / Inventaire restant / Cible à atteindre / À commander (« À
> commander » = besoin net des shops − Storage, même netting que la feuille de course, cf.
> `stockOrderByItem` et `orderQuantitiesByItemKey`). Les clés i18n `srBreakdownGap` /
> `srBreakdownPacks` / `srBreakdownCovered` ont été supprimées. Les CALCULS de cette fiche
> (`computeRestockOutcome`, `aggregateRestockOutcomesByItem`, snapshot, colonnes étape 2)
> restent en place et inchangés.

- **Statut** : 🟡 Corrigé non déployé (2026-08-04)
- **Sévérité** : 🟠 Majeur (réunion du 2026-08-04 — test live Bertrand le 2026-08-05)
- **Domaine** : Stock (Réarmement / SpaceRestockView)
- **Repo(s) concerné(s)** : `datafriday-web` (100 % front — le snapshot `RestockPlan` est du Json libre, aucun changement Prisma/backend)
- **Découvert le** : 2026-08-04 (réunion de cadrage — flux Stockup en deux étapes)
- **Fichiers** :
  - `frontend/src/utils/stockPlanning.js` (**nouveaux** `computeRestockOutcome`, `aggregateRestockOutcomesByItem`)
  - `frontend/src/views/SpaceRestockView.vue` (`liveRestockRowsAll`/`liveRestockRows` scindés, `stockOutcomeByItem`, bloc ventilation étape 1, colonnes étape 2, watcher `objectiveSource`, `buildPlanPayload`)
  - `frontend/src/utils/restockPlanSnapshot.js` (`freezeStockLine` avec ventilation, `freezeRestockLine` + vrac/stock final, `applyPlanEdits` recalcul sur valeurs figées)
  - `frontend/src/i18n/translations.js` (7 clés `srBreakdown*` / `srCol*`, fr + en)
  - `frontend/tests/unit/restockOutcome.spec.js` (**nouveau**)
  - `frontend/tests/unit/restockPlanSnapshot.spec.js` (étendu)

## En clair

L'étape 1 du réarmement disait seulement « il faut X kg » par ingrédient, sans montrer d'où
venait le chiffre : ce qu'il reste en stock, ce qui manque vraiment et combien de paquets
déposer n'apparaissaient qu'à l'étape 2, éclatés par point de vente. On affiche maintenant
cette ventilation dès l'étape 1. Et on calcule deux chiffres qui n'existaient nulle part :
le **stock final prévu** après dépôt (restant + déposé − besoin) et le **reste en vrac**
créé par l'arrondi en paquets entiers (besoin 1,1 kg, 3 × 500 g déposés → 400 g de vrac).
Ces valeurs sont figées dans les plans sauvegardés ; les plans sauvegardés avant le
changement s'ouvrent sans erreur, avec un tiret à la place des valeurs absentes.

## Symptôme

| # | Constat |
|---|---|
| S1 | Étape 1 : besoin brut seul (« prédit → cible ») — la décomposition predict − inventaire restant = manque n'apparaissait qu'à l'étape 2 |
| S2 | Stock final prévu (restant + déposé − besoin) calculé nulle part, dans aucune vue ni aucun export |
| S3 | Reste en vrac (couvert − manque, sous-produit de l'arrondi 295-01) jamais calculé, affiché ni persisté dans les plans |

## Cause racine

Toute la décomposition vivait dans `liveRestockRows` (étape 2, grain shop × article), computed
qui **filtrait** les lignes à dépôt nul (`restockQuantity > 0`) et les articles exclus — donc
inutilisable tel quel pour une ventilation étape 1 exhaustive. Aucune formule surplus/stock
final n'existait : `restockQuantity` (couverture des colis entiers, BUG-295-01) était calculé
puis affiché, mais jamais confronté au manque ni au stock restant.

S'y ajoutait un trou d'ancrage : le watcher `objectiveSource` ne rechargeait pas l'inventaire
(`loadPreviousInventory`), alors que le `countsEventId` dépend du mode (forecast/référence) —
la ventilation aurait affiché l'inventaire de l'ancien ancrage après un changement de mode.

## Correction

1. **`stockPlanning.js`** — deux fonctions pures :
   - `computeRestockOutcome({ targetQuantity, remainingQuantity, restockQuantity })` →
     `{ gap, surplusLoose, finalStock }` : `gap = max(0, besoin − restant)`,
     `surplusLoose = max(0, déposé − gap)`, `finalStock = restant + déposé − besoin`.
     `restockQuantity` est la quantité DÉJÀ arrondie en colis entiers — aucun arrondi refait.
   - `aggregateRestockOutcomesByItem(rows)` : agrégat grain article depuis les lignes
     shop × article NON filtrées. L'arrondi par PDV se fait AVANT la somme (comportement
     métier acté 295-01) ; `packedCount` reste `null` sans conditionnement.
2. **`SpaceRestockView.vue`** :
   - `liveRestockRows` scindé : `liveRestockRowsAll` (toutes lignes, enrichies de
     `...computeRestockOutcome(row)`) + `liveRestockRows` (filtre d'affichage inchangé —
     les ~10 consommateurs aval ne voient aucune différence) ;
   - `stockOutcomeByItem` : plan chargé → valeurs figées des `stockLines` (bloc masqué si
     champs absents), sinon agrégat vivant ;
   - étape 1 : bloc `.sr-breakdown` sous « prédit → cible » (restant, manque, paquets
     suggérés, couvert, reste en vrac si > 0, stock final prévu vert/rouge) ; placeholder
     pendant `previousInventoryLoading` ;
   - étape 2 : colonnes « Reste en vrac » et « Stock final prévu » sur les 3 variantes de
     table (par PDV, non mappés, par article) — tiret sur les plans antérieurs ;
   - watcher `objectiveSource` : ajoute `loadPreviousInventory()`.
3. **`restockPlanSnapshot.js`** :
   - `freezeStockLine(row, inputs, outcome)` : fige la ventilation (whitelist stricte,
     `toNumber`) quand `buildPlanSnapshot` reçoit `stockOutcomes` (fourni par
     `buildPlanPayload` depuis `stockOutcomeByItem`) ; sans lui, ligne identique à avant ;
   - `freezeRestockLine` : + `surplusLoose`, `finalStock` ;
   - `applyPlanEdits` : sur correction « À déposer », recalcule surplus/stock final via
     `computeRestockOutcome` depuis les valeurs **figées** (target/remaining de la photo) —
     formule unique importée de `stockPlanning`, jamais dupliquée (parité ADR-0005).

## Risque de régression / à surveiller

- **Identité photo/rejeu (ADR-0005)** : branche sans override d'`applyPlanEdits` inchangée
  (clone tel quel) — le test d'identité `restockPlanSnapshot.spec.js` reste vert.
- **Plans sauvegardés avant le changement** : `stockLines` sans ventilation → bloc étape 1
  masqué ; `restockLines` sans vrac/stock final → tiret dans les colonnes. Aucun recalcul
  (document figé).
- **Taille du snapshot** : +9 champs numériques par `stockLine`, +2 par `restockLine` —
  marginal vs la garde 1 Mo (`estimateSnapshotBytes` mesure un plan de 600 lignes largement
  sous la limite), mais à garder en tête si le grain des lignes grossit encore.
- **Sur-provisionnement volontaire** : l'agrégat étape 1 somme les colis PAR PDV
  (3 PDV × 0,7 kg = 6 paquets, pas 5) — comportement métier 295-01, pas un bug.
- **Stock-up (Event Predict)** : non touché — l'unification des chemins reste le chantier
  [BUG-292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md).

## Tests

- `frontend/tests/unit/restockOutcome.spec.js` (**nouveau**, 7 cas) — cas nominal de la
  réunion (1,1 kg / 3 × 500 g → vrac 0,4), restant partiel, sur-stock, entrées non
  numériques, agrégat 2 PDV (arrondi par PDV avant somme), article sans conditionnement,
  entrées invalides.
- `frontend/tests/unit/restockPlanSnapshot.spec.js` (étendu, 26 cas) — `restockLines`
  portent vrac/stock final, `stockLines` figent la ventilation seulement si `stockOutcomes`
  est fourni, override recalculé depuis les valeurs figées, identité préservée.

## Références

- `frontend/docs/modules/06_STOCK_INVENTAIRE.md` — domaine Stock.
- [BUG-295-01](295_01_rearmement_quantites_fractionnees_unites_inventaire.md) — arrondi en
  unités d'inventaire complètes (la ventilation s'appuie sur ses quantités couvertes).
- ADR-0005 — plan sauvegardé = document figé.

---

JLH
