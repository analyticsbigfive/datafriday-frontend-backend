# BUG-320-02 — Shops dupliqués dans Space Menus (et l'étape 2 du wizard) quand 2 intégrations mappent leurs locations vers le même SpaceElement

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/multi-integration-same-space`)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 2) / Menu & recettes (Space Menus) / Espaces & builder
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-14 (signalement utilisateur KOUAME Ulrich : "plusieurs duplications au
  niveau des shops dans Spaces Menu et peut-être encore dans plusieurs autres lieux")
- **Fichiers** :
  - `backend/src/features/spaces/spaces.service.ts:1031-1046` (CTE `enriched`, `GET
    /spaces/:id/shops`)
  - `backend/prisma/schema.prisma:2811-2829` (`LocationShopMapping` — aucune contrainte unique sur
    `spaceElementId`)
  - `frontend/src/components/integration/wizard/StepMapShops.vue:1078-1097` (`loadData`,
    `this.elements` chargé espace-entier, pas filtré par intégration)
  - `frontend/src/components/integration/wizard/StepMapShops.vue:1526-1542` (`openBulkConfirm`,
    matcher anti-doublon `findBestElementMatch` — correctif de BUG-209, toujours en place)
  - `frontend/src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:300-306`
    (computed `shops`, aucun dédoublonnage par `id`)
  - `frontend/src/components/menu-fb/views/space-menus/views/SpaceMenuShopView.vue:56`
    (`v-for="shop in paginatedShops"`, une clé dupliquée s'affiche deux fois, ne fusionne pas)

## Symptôme

Espace mappé par 2 intégrations, chacune ayant passé l'étape 2 du wizard (mapping shops) sur ses
propres locations. Dans Space Menus (et dans le dropdown de shops de l'étape 2 du wizard elle-même),
un même point de vente physique ("Bar Central" par exemple) apparaît 2 fois dans la liste.

## Cause racine

`GET /spaces/:id/shops` (consommée par Space Menus **et** par `StepMapShops.vue`) fait, dans sa CTE
`enriched` :

```sql
-- spaces.service.ts:1031-1046
enriched AS (
  SELECT a.*, wm."weezeventLocationId",
         (wm."weezeventLocationId" IS NOT NULL) AS "isMappedToWeezevent",
         COALESCE(ma.cnt, 0) AS "menuItemsCount"
  FROM all_shops a
  LEFT JOIN "WeezeventLocationShopMapping" wm
    ON wm."spaceElementId" = a.id AND wm."tenantId" = ${tenantId}
  LEFT JOIN LATERAL (...) ma ON true
)
```

`LocationShopMapping.spaceElementId` (`schema.prisma:2811-2829`) n'a **aucune contrainte unique** —
seule `@@unique([tenantId, salesLocationId])` existe (un index non-unique
`@@index([tenantId, spaceElementId])` seulement). Rien n'empêche donc que 2 `salesLocationId`
différents — une location de l'intégration A, une de l'intégration B — pointent vers le **même**
`spaceElementId`. Le `LEFT JOIN` ci-dessus n'agrège pas sur `wm` : avec 2 mappings vers le même
élément, la ligne de l'élément sort 2 fois dans `enriched`, et `json_agg(enriched ORDER BY id,
"configId")` (ligne 1054) renvoie 2 copies du même shop.

C'est précisément le scénario que produit le comportement (voulu) de `StepMapShops.vue` : le matcher
anti-doublon `findBestElementMatch` (correctif de l'ancien BUG-209) compare une location non mappée
contre **tous** les `SpaceElement` de l'espace (`this.elements`, chargé espace-entier via
`spaceShops/fetchForSpace({spaceId})` — `StepMapShops.vue:1089`, **pas filtré par intégration**),
pour éviter de créer un second shop physique en double si l'intégration A a déjà créé "Bar Central".
C'est le comportement correct au niveau "ne pas créer 2 `SpaceElement` physiques" — mais il produit
mécaniquement 2 lignes `LocationShopMapping` (une par intégration) pointant vers le même
`spaceElementId`, ce qui déclenche le fan-out du `LEFT JOIN` ci-dessus. **Le fix de BUG-209 est ce
qui rend ce bug d'affichage plus probable, pas ce qui le cause** — la vraie cause est l'absence de
dédoublonnage dans `getSpaceShops`.

Aucune déduplication ne rattrape ça côté front : `SpaceMenuView.vue::shops` (`:300-306`) filtre
uniquement par `configId`/`type`, jamais par `id` ; `SpaceMenuShopView.vue:56` fait
`v-for="shop in paginatedShops" :key="shop.id"` — une clé dupliquée s'affiche deux fois (avec un
warning Vue en dev), elle ne fusionne rien.

**Cause secondaire possible, non confirmée** (confiance faible) : les routes `merchant-element`
(`mappings.service.ts:398-434`) écrivent dans la **même** table `LocationShopMapping` en réutilisant
`salesLocationId` pour un `weezeventMerchantId` — une location ET son marchand associé, mappés
séparément vers le même `SpaceElement`, produiraient le même fan-out au sein d'une seule
intégration. Non vérifié comme se produisant en pratique.

## Correction

Corrigée en code le 2026-08-14 (branche `fix/multi-integration-same-space`), pas encore testée en
environnement réel ni déployée :

1. `getSpaceShops` (`spaces.service.ts`, CTE `enriched`) : le `LEFT JOIN
   "WeezeventLocationShopMapping"` 1-vers-N a été remplacé par deux sous-requêtes scalaires — une
   pour `weezeventLocationId` (`ORDER BY ... LIMIT 1`, pick déterministe, champ non consommé par le
   front aujourd'hui d'après un grep exhaustif) et un `EXISTS(...)` pour `isMappedToWeezevent`
   (`true` dès qu'au moins un mapping existe, quel que soit le nombre d'intégrations qui en créent
   un — c'est l'option "fusion" retenue, décision produit implicite : 2 intégrations alimentant le
   même shop physique est un cas légitime, pas une erreur à bloquer). Garantit au plus UNE ligne
   par `(élément, config)`, quel que soit le nombre de `LocationShopMapping` pointant vers le même
   `spaceElementId`. Même famille de correctif que BUG-286-01 (`DISTINCT ON` mal posé, même
   fichier), cause différente ici (`LEFT JOIN` non agrégé, pas un `DISTINCT ON`).
2. Décision produit (point 2 de la piste initiale) : tranchée implicitement en faveur de la fusion
   plutôt que de bloquer le double mapping — aucune contrainte d'intégrité ajoutée sur
   `LocationShopMapping.spaceElementId`, à revisiter si Bertrand préfère l'option "au plus 1 mapping
   actif par shop".
3. Pas de test dédié ajouté (aucune suite existante pour `getSpaceShops`) — `tsc --noEmit` propre.

## Risque de régression / à surveiller

- Consommateurs de `GET /spaces/:id/shops` à revérifier après fix : Space Menus, Inventory, Restock,
  Event Predict, Analyse, wizard Weezevent (`StepMapShops.vue`) — même liste que BUG-286-01, qui
  documente déjà les couches de cache (Map 15 min `spaceShops.js`, Redis 30s, cache composant) à
  purger pour tester (hard reload obligatoire).
- Vérifier que `menuItemsCount` (LEFT JOIN LATERAL, ligne 1040-1045) reste correct après
  dédoublonnage — actuellement il est déjà par `(elementId, configId)`, indépendant du nombre de
  `LocationShopMapping`, donc ne devrait pas être affecté par le fix.

## Références

- [286-01](286_01_shops_config_ecrasee_reponse_non_filtree.md) — même fichier
  (`spaces.service.ts::getSpaceShops`), même famille d'erreur (`LEFT JOIN`/`DISTINCT ON` mal posé
  produisant un fan-out ou un écrasement selon le cas), cause distincte.
- [209](209_stepmapshops_bulk_create_matching_naif_doublons.md) — le correctif qui rend ce
  scénario multi-intégration plus probable (mais qui reste le comportement voulu au niveau
  "ne pas créer de `SpaceElement` en double").
- [BUG-317-02](317_02_aggregation_processevents_deletemany_non_scope_integration.md),
  [BUG-318-02](318_02_aggregation_synchronize_purge_espace_sans_scope_integration.md),
  [BUG-319-02](319_02_getweezeventeventsforspace_integration_arbitraire_espace_partage.md) — même
  fil d'investigation (multi-intégration sur un même space).
