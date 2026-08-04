# BUG-299-01 — Associations ingrédient/recette par nom : homonymes confondus (« Beurre » vs « Beurre doux motte »)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Prévision / Stock (Event Predict Stock-up, Réarmement, feuille de course)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-04 (audit demandé par JLH : associations par ID, jamais par nom)
- **Fichiers** : `src/utils/menuItemExpansion.js:74`, `src/utils/stockPlanning.js:444`,
  `src/components/EventPredictStockUpSection.vue:684`, `src/utils/stockNetting.js:46`

## En clair

Une recette référence un ingrédient précis par son identifiant (le « beurre doux motte », vendu
en motte de 0,5 kg). À plusieurs endroits, le code retrouvait pourtant l'ingrédient par son
**libellé**. Deux articles aux noms identiques ou proches (« Beurre » plaquette 0,25 kg vs
« Beurre doux motte ») pouvaient donc être confondus : mauvais article visé par le manque
prédictif, mauvais conditionnement affiché, et le stock d'un article qui « effaçait » le besoin
d'un autre. Le correctif fait toujours primer l'identifiant ; le nom ne sert plus que de filet
de secours quand aucun identifiant n'existe (vieilles données).

## Symptôme

Sur un référentiel contenant deux articles homonymes ou dont l'un porte le libellé de l'autre
(ligne de recette au libellé stale « Beurre » référençant par ID l'ingrédient « Beurre doux
motte ») :

- le manque prédictif (Stock-up / Réarmement) vise le mauvais article ;
- le conditionnement remonté est celui de l'homonyme (4 plaquettes de 0,25 kg au lieu de
  2 mottes de 0,5 kg) ;
- au netting, le stock d'un article homonyme réduit le besoin d'un autre (manque affiché 0) ;
- dans un combo, un ingrédient homonyme d'un menu item était requalifié en article de vente
  (« 100 pcs de Beurre » au lieu de 1 kg de matière).

## Cause racine

Quatre foyers, tous de la même famille — le nom court-circuitait ou primait l'ID :

1. `src/utils/menuItemExpansion.js:74` — `resolveComponentMenuItem` : lookup par NOM d'abord,
   avec départage « premier du tableau » quand nom ET `sourceId` résolvaient deux items
   différents (sémantique héritée du `.find(name || sourceId)` d'origine).
2. `src/utils/stockPlanning.js:444` — `findStockReference` : prédicat mixte `id OU nom` testé
   candidat par candidat dans un seul `.find` → un homonyme placé plus tôt dans
   `ingredients[]` gagnait PAR NOM contre l'ingrédient réellement référencé par ID plus loin.
   C'est lui qui pilote `computePackagingForQuantity` → mauvais conditionnement.
3. `src/components/EventPredictStockUpSection.vue:684` — `computePackaging` (écran predict) :
   même prédicat mixte local, et ne testait ni `sourceId` ni `marketPriceId` (or `item.id` est
   `componentIngredientId` = marketPriceId → sourceId → id).
4. `src/utils/stockNetting.js:46` — `consumeFromPool` : repli nom actif même quand les DEUX
   côtés portaient des ids sans intersection — deux articles identifiés différents se nettaient
   par homonymie.

## Correction

Branche `fix/bug-290-01-eventpredict-config-stockup`, 2026-08-04. Règle unique : **l'ID prime
toujours ; le nom est un repli réservé aux lignes sans identifiant.**

- `resolveComponentMenuItem` : `sourceId` résolu → c'est lui ; `sourceId` posé mais hors
  catalogue menu items → matière (jamais requalifié par homonymie) ; `itemType`
  Ingredient/Packaging → jamais un menu item ; repli nom réservé aux lignes legacy sans réf.
- `findStockReference` : deux passes strictes — l'ID sur tout le catalogue
  (ingredients → components → menuItems), le nom seulement si aucun id ne résout nulle part ;
  candidats élargis à `marketPriceId` / `marketPrice.id` des deux côtés.
- `computePackaging` (Stock-up) : branché sur `findStockReference` partagé.
- `consumeFromPool` : repli nom conditionné à « l'un des deux côtés n'a AUCUN id ».
- Test legacy `menuItemExpansion.spec.js` (« départage par la position ») réécrit : l'ID gagne.
- Nouveau spec `tests/unit/ingredientAssociationById.spec.js` — exemple de bout en bout
  « beurre de motte » : 100 crêpes × 10 g → besoin 1 kg rattaché par ID, stock homonyme ignoré,
  0,4 kg de motte en stock → manque 0,6 kg → 2 mottes de 0,5 kg.

### Audité sans correctif nécessaire

- `src/utils/predictedQuantityIndex.js` — 🟢 ID d'abord, `break` avant le nom, lecture MAX ;
  la clé nom est NÉCESSAIRE inter-config (BUG-290-01) et inter-référentiel timeline/catalogue.
- `src/composables/usePredictedNeed.js` — 🟢 `lookupPredictedNeed` : id d'abord, nom en repli
  (nécessaire : les lignes Logistic sont keyées par nom).
- `src/composables/useRestockPlans.js` — 🟢 RAS : pur CRUD REST de plans, aucune association.

## Risque de régression / à surveiller

- 121 tests verts sur les 11 suites concernées (expansion, netting, stock-up, parité, BOM,
  predicted need/index).
- **Risque résiduel assumé** : les replis par nom conservés (`predictedQuantityIndex`,
  `usePredictedNeed`, lignes/entrées sans id) confondent toujours deux articles au libellé
  EXACTEMENT identique après normalisation — inévitable tant que des données sans id circulent.
  Le vrai remède est côté données : pas d'homonymes stricts dans les référentiels.
- Vérif manuelle : Event Predict → Stock-up sur un event avec crêpes/beurre — prédiction non
  nulle sur « Beurre doux motte » et conditionnement « Motte 0,5 kg » ; Réarmement : le stock
  d'un homonyme ne doit plus annuler le manque.
- Comportement CHANGÉ volontairement : une ligne de recette avec `sourceId` non résolu dans le
  catalogue menu items n'est plus jamais requalifiée en menu item homonyme — si un écran
  dépendait de cette requalification pour des données où `sourceId` pointe réellement un menu
  item absent de la liste chargée, la ligne restera matière (id `componentIngredientId`).

## Références

- BUG-290-01 (index partagé Stock-up/Menus), BUG-288-01 (identité catalogue des lignes),
  BUG-292-01 (règle unique de décomposition), BUG-62 / BUG-81 (FK résolues par nom, même
  famille côté référentiels).
- `docs/modules/06_STOCK_INVENTAIRE.md`, `docs/utiles/HT_TTC_PREDICT.md`.

JLH
