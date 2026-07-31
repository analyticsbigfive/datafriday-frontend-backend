# BUG-260-02 — HrSinkingRule.conditionAttribute ne se déclenche jamais (aucun champ Builder ne saisit nbFriteuses/nbTireuses/…)

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
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

Non corrigé — nécessite de choisir où/comment saisir ces attributs dans le Builder (ex. nouveaux
champs numériques dans `ConfigsSection.vue` de l'inspecteur, visibles seulement pour les shops
concernés), ce qui est un ajout de fonctionnalité, pas un simple fix. Décision d'implémentation à
prendre côté produit avant de coder — voir aussi la question ouverte liée sur Kitchen Food
(`QUESTIONS_A_BERTRAND.md` #44) qui recoupe partiellement ce sujet (nouveaux champs d'attributs à
définir pour une recette de dotation dédiée).

En attendant : créer une `HrSinkingRule` SANS `conditionAttribute` (condition vide) fonctionne
normalement — c'est uniquement la variante « avec condition d'équipement » qui est inopérante.

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
