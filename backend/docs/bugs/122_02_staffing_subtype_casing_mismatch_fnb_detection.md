# BUG-122-02 — Détection des tags F&B (subtypes) jamais déclenchée pour les éléments Builder v2

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : RH / Staffing (`features/staffing/`)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-30
- **Corrigé le** : 2026-07-30 (Ulrich)
- **Fichiers** : `backend/src/features/staffing/staffing.service.ts:219-241` (avant correction)

## Symptôme

Un `SpaceElement` de type `shop` créé via le Builder v2, avec des sous-types (`subtypes`)
`beverages`, `beer`, `drinkee`, `front_food` ou `mixology`, ne déclenchait jamais les flags
`hasBeverage` / `hasFrontFood` / `hasMixology` passés au calculateur de staffing
(`StaffingCalculatorService.calculate()`). Résultat : aucun barman, aucun commis/EPR/chef de partie
n'était jamais généré pour ces PDV via `POST /events/:id/staffing/generate`, quel que soit le CA
prédictif ou les attributs saisis. Seuls les éléments legacy (importés Weezevent, `el.type ===
'fnb_beverages' | 'fnb_food' | 'fnb_bar'`) déclenchaient correctement ces flags.

Ce symptôme est probablement à l'origine de la confusion avec le ticket backlog STF-1 ("la formule
runners ajoute un runner à tort") : la formule elle-même est correcte (voir `QUESTIONS_A_BERTRAND.md`
question #28, résolue le 2026-07-29) — c'est la détection en amont qui ne nourrissait jamais le bon
signal pour les éléments créés dans le Builder v2.

## Cause racine

`staffing.service.ts:222` normalisait les sous-types en `UPPERCASE` (`subs.includes('BEVERAGE')`,
`'FRONT_FOOD'`, `'MIXOLOGY'`) alors que le vocabulaire réel des sous-types Builder v2
(`frontend/src/components/spaces/views/builder2/constants/elementTaxonomy.js`, tool `shop`) est en
minuscules sans underscore (`beverages`, `beer`, `drinkee`, `gppremium`, `temporary`, `food`).
`'beverages'.toUpperCase()` produit `'BEVERAGES'`, qui ne correspond à aucune des valeurs
attendues (`'BEVERAGE'` au singulier) — la comparaison ne matchait donc jamais.

## Correction

Remplacement de la comparaison naïve par une table de correspondance explicite
`SUBTYPE_TO_FNB_CATEGORY` (`staffing.service.ts`), construisant un `Set<string>` de catégories FNB
réellement détectées (`BEVERAGE` / `FRONT_FOOD` / `MIXOLOGY` / `KITCHEN_FOOD`), réutilisé à la fois
pour `hasBeverage`/`hasFrontFood`/`hasMixology`/`hasKitchenFood` et pour les nouvelles règles
Sinking RH (STF-2, voir `frontend/docs/modules/11_RH_STAFFING.md`, passe 2026-07-30). Au passage,
CFG-1 (Mixology/Front Food/Kitchen Food) ajoute 3 nouveaux sous-types du tool `shop` qui alimentent
directement cette table — sans eux, `hasMixology`/`hasFrontFood` ne pouvaient de toute façon être
déclenchés que via les types legacy.

## Risque de régression / à surveiller

- Tests unitaires ajoutés (`staffing-calculator.service.spec.ts`, describe `Kitchen Food
  (hasKitchenFood, §CFG-1)`) couvrent le nouveau signal `hasKitchenFood`. La détection de tags
  elle-même (fonction de mapping `SUBTYPE_TO_FNB_CATEGORY`) vit dans `staffing.service.ts` (pas
  pure) — non couverte par un test unitaire dédié faute de harnais Prisma mocké existant pour ce
  service ; à couvrir si un tel harnais est mis en place plus tard.
- Vérifier lors d'un prochain test manuel en environnement réel qu'un PDV `shop` avec sous-type
  `mixology`/`front_food`/`kitchen_food` génère bien les lignes attendues via `POST
  /events/:id/staffing/generate` (bloqué aujourd'hui par ailleurs par la question #43 —
  `ElementPerformance` vide, `caPredictif` toujours à 0 dans cet environnement).

## Références

- `frontend/docs/modules/11_RH_STAFFING.md` §10 (algorithme de staffing) et passe 2026-07-30.
- `frontend/docs/QUESTIONS_A_BERTRAND.md` question #28 (formule runners, déjà résolue) et #43
  (source de `caPredictif`, toujours ouverte — explique le symptôme résiduel même après ce fix).
