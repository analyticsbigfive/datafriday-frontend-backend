# BUG-260-02 — HrSinkingRule.conditionAttribute ne se déclenche jamais (aucun champ Builder ne saisit nbFriteuses/nbTireuses/…)

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : RH / Staffing
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-30 (implémentation STF-2) — remonté explicitement le 2026-07-31
- **Fichiers** : `frontend/src/components/hr/drawers/HrRoleFormDrawer.vue:165-176` (saisie
  `conditionAttribute`), `backend/src/features/staffing/staffing-calculator.service.ts::applySinkingRules`,
  `backend/src/features/builder-v2/builder-v2.service.ts:939-947`

## Symptôme

Une règle Sinking RH (STF-2, table `HrSinkingRule`) peut porter une condition d'équipement
optionnelle — ex. « ce rôle n'est obligatoire que si `nbFriteuses ≥ 2` » — saisie via un `<select>`
dans le tiroir "Edit HR role" (section repliable "Sinking Rules — Mandatory Staffing"). Une fois la
règle créée avec une telle condition, elle **ne se déclenche jamais**, ni dans le Builder (suggestions
de staff sur un shop) ni dans la génération de staffing d'un événement complet : le rôle n'apparaît
jamais comme requis via cette règle, quel que soit l'équipement réellement présent sur le PDV.

## Cause racine

`applySinkingRules()`/`computeStaffSuggestions()` lisent la valeur de la condition dans
`SpaceElement.attributes[rule.conditionAttribute]` (JSON libre sur l'élément). Les 5 clés valides
(`nbFriteuses`, `nbTireuses`, `nbBurgersPrevus`, `nbDinettes`, `nbHotdogsPrevus`, cf.
`CONDITION_ATTRIBUTES` dans `HrRoleFormDrawer.vue`) sont bien lues par la formule de calcul
(`StaffingCalculatorService.calculate()`), mais **aucun champ nulle part dans le Builder ne permet de
les saisir** sur un élément shop — aucune section de l'inspecteur (`ConfigsSection.vue` et les
autres sections de `InspectorPanel.vue`) n'expose ces clés. `attrs[rule.conditionAttribute]` vaut
donc toujours `undefined`, et la comparaison `Number.isFinite(v) && v >= (rule.conditionMinValue ?? 0)`
échoue systématiquement.

Déjà signalé en commentaire de code (`builder-v2.service.ts:946-947`, "aucun champ du Builder ne
renseigne encore les attributs… — limite assumée, cf. module doc") et dans
[`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §10.3 (ligne "Inputs algo par PDV") et §10.4
point 3 ("UI de saisie des inputs algo dans `SpaceElement.attributes` — bloquant") — mais jamais
consigné comme fiche bug dans cet index, uniquement comme item de TODO dans la doc de module. Cette
fiche corrige ce manque de traçabilité (retour utilisateur du 2026-07-31 : les gaps connus doivent
être documentés dans `docs/bugs/`, pas seulement dans un TODO de doc de module).

## Correction

Corrigé le 2026-08-01. Décision utilisateur explicite sur l'emplacement : **tout dans le Builder**
(pas de split avec Event Predict, malgré une recommandation initiale de scinder équipement/prévisions
entre les deux écrans — tranché en faveur d'un seul endroit de configuration).

Nouvelle section `StaffingInputsSection.vue` dans l'inspecteur du Builder, visible uniquement pour
les éléments `shop` (`sectionsForType().staffingInputs`, cf. `elementTaxonomy.js` — ces attributs ne
sont consommés que par la formule par paliers, scopée à `shop`/legacy F&B). Couvre les 9 clés lues
par `StaffingCalculatorService`/`SpaceElement.attributes` : `metresLineaires` (nullable — vide = pas
de plafond TPE), `txParSeconde` (30|60), `ouvertureObligatoire`, `hasResponsablePdv`, `nbTireuses`,
`nbFriteuses`, `nbBurgersPrevus`, `nbDinettes`, `nbHotdogsPrevus`. Même mécanisme de PATCH que
`StorageShopsSection.vue` (`store.commitElementPatch`, `attributes` fusionné jamais remplacé).
Aucun changement backend nécessaire — `attributes` est un JSON libre déjà lu tel quel.

## Risque de régression / à surveiller

Aucun risque de régression (fonctionnalité jamais opérationnelle depuis sa création, pas de
comportement antérieur à préserver). À surveiller : si un utilisateur crée une règle Sinking avec
condition en pensant qu'elle s'applique, le rôle ne sera silencieusement jamais mandaté par cette
règle — pas d'erreur, pas de warning visible côté UI aujourd'hui.

## Références

- [`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §10.3 (tableau "Inputs algo par PDV"), §10.4
  point 3, §11.3 (STF-2)
- [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #44 (Kitchen Food, recoupe le besoin de
  nouveaux champs d'attributs)
