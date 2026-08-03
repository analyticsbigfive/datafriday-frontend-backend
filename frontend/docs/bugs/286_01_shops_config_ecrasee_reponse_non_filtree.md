# BUG-286-01 — `GET /spaces/:id/shops` sans `configId` : un shop partagé n'est renvoyé que sous sa config la PLUS ANCIENNE → Event Predict et Restock voient 0 point de vente

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-03, non buildé — vérification en environnement à faire par JLH)
- **Sévérité** : 🔴 Prévision par point de vente inutilisable sur toute configuration qui n'est pas la plus ancienne de son espace (6 configs sur 7 chez Auxerre)
- **Domaine** : Espaces & builder / Prévision / Stock (Restock)
- **Repo(s) concerné(s)** : les deux (`api-datafriday-staging` pour la cause racine, `datafriday-web` pour les garde-fous)
- **Découvert le** : 2026-08-03 (signalement utilisateur sur Auxerre) — JLH
- **Fichiers** : `backend/src/features/spaces/spaces.service.ts:967-988` (cause racine),
  `src/components/EventPredictView.vue:1950/1995/4200` (garde-fous),
  `src/views/SpaceRestockView.vue:2462` (second symptôme, aucun edit)

## Symptôme

Espace **Auxerre**, configuration **Foot 19-21h Standard** (`cms88nx6f00x31d79s5agkbab`), event
**AJA vs Angers** du 29/08/2026 :

- **Space Menus** liste **11 points de vente**, tous *Open*, avec 15 à 25 menu items chacun
  (1 A · 25, 2 A · 17, 3 A B C · 17, 4 A B C · 18, 5 A · 17, 6 A · 19, 7 A B C D · 24,
  8 A B C D · 16, BAR EPHEMERE · 16, PARVIS · 17, VISITEUR · 15).
- **Event Predict**, même espace, même configuration : empty state
  « No point of sale in this configuration » + bouton « Add shops (Space Menus) ».

Aucune erreur console, aucun 4xx/5xx — l'API répond 200 avec des lignes, simplement aucune ne
porte le `configId` recherché.

Second symptôme, même cause, non signalé au départ : **Space Restock** sur ces mêmes
configurations ne trouve aucun point de vente (`restockAssignmentByName = null`).

## Cause racine

Les deux écrans interrogent `GET /spaces/:id/shops`, mais pas de la même façon :

- **Space Menus** passe `?configId=` (`SpaceMenuView.vue:597`) → le `configFilter`
  (`spaces.service.ts:929`) réduit `target_configs` à une ligne.
- **Event Predict** demande **tous** les shops de l'espace (`EventPredictView.vue:3364` et `:3862`,
  sans `configId`, stockés dans `_spaceShopsCache[spaceId]`, clé = spaceId seul) puis filtre
  lui-même sur `r.configId === selectedEvent.configurationId` (`configHasShops` `:1973`,
  `configShopElements` `:1995`, `isOpenByShop` `:1950`).

Or la branche builder-v2 de la requête (`spaces.service.ts:970-988`) faisait :

```sql
SELECT DISTINCT ON (se.id) … ORDER BY se.id, ce."createdAt" ASC
```

→ **une seule ligne par élément**, taguée de son adhésion `ConfigurationElement` **la plus
ancienne**. Un élément builder-v2 est PARTAGÉ entre configurations, et créer une configuration par
clonage copie ses adhésions avec un `createdAt` neuf (`builder-v2.service.ts:1161`) : la config
d'origine gagne systématiquement, toutes les autres disparaissent de la réponse « toutes configs ».

Chaîne complète : filtre client → 0 ligne → `configHasShops === false` →
`predictionItemsContext === 'no-config'` (`EventPredictView.vue:2203`) → empty state
`EventPredictMenusSection.vue:47-58`.

**Conséquence silencieuse du même défaut** : le `LEFT JOIN LATERAL` qui calcule `menuItemsCount`
(`spaces.service.ts:1007-1012`) est scopé sur `a."configId"` — tous les consommateurs « toutes
configs » voyaient donc le compteur d'assignation de la config la plus ancienne, pas le leur.

## Correction

**Backend (le vrai fix, 2 lignes de SQL)** — `spaces.service.ts`, CTE `zone_shops` :
`DISTINCT ON (se.id)` → `DISTINCT ON (se.id, ce."configId")`, et `ORDER BY se.id, ce."configId"`
(Postgres exige que les expressions du `DISTINCT ON` soient les premières de l'`ORDER BY`, dans le
même ordre ; le départage sur `createdAt` n'a plus de sens). La réponse non filtrée porte désormais
**une ligne par (élément, configuration)**.

Sûreté : `ConfigurationElement` est `@@id([configId, elementId])` (`schema.prisma:846`) → au plus
une adhésion par couple, donc le `DISTINCT ON` conservé est un no-op documenté et non plus un
écrasement. **Quand `configId` est passé, la sortie est inchangée** (`target_configs` n'a qu'une
ligne) → Space Menus, Inventory et le wizard d'intégration ne bougent pas.

Ajouté au passage : `json_agg(enriched ORDER BY enriched.id, enriched."configId")` — sans tri
explicite l'ordre des lignes est arbitraire et peut varier d'une requête à l'autre, ce qui ferait
clignoter la suggestion de `configName` chez un consommateur en premier-arrivé-gagne
(`StepMapShops`).

Aucun changement de cache Redis : la clé non filtrée reste une fonction pure de
`(tenantId, spaceId)` et `invalidateSpaceCache` couvre déjà les deux formes via `deletePattern`.

**Frontend (3 garde-fous, `EventPredictView.vue`)** — nécessaires parce que la réponse porte
désormais N lignes par élément partagé et que le chemin `selectedEvent.configurationId === null`
(event brouillon / non configuré) ne filtre rien :

- Helper module `mergeShopRowsByKey(rows, keyOf)` : fusion **OU logique** sur `isOpen`, **MAX** sur
  `menuItemsCount`. **Jamais premier- ni dernier-gagnant** — ce serait l'ordre des lignes qui
  déciderait de l'état Opened/Closed d'un point de vente, et il changerait d'un rechargement à
  l'autre.
- `configShopElements` : fusion par **id**, `isOpen`/`menuItemsCount` pris du résultat de fusion.
- `isOpenByShop` : même helper, clé = **nom** normalisé (remplace le `out[name] = …` en
  dernier-écrit-gagne). **La même règle des deux côtés est le point** : l'enfant lit le badge via
  `isShopOpen` (clé nom), le parent exclut les PdV fermés du CA via `closedShopNormSet` (clé id) —
  deux règles divergentes afficheraient un PdV « Opened » dont le CA est pourtant exclu.
- `handleAssignShopItem` : la MAJ optimiste ne bumpe plus que la ligne de la config courante
  (`if (rc != null && rc !== cfgId) return r;`) — sinon une assignation gonflait le compteur de
  **toutes** les configs partageant l'élément.

**Aucun edit ailleurs**, et c'est délibéré : `configHasShops` est un `some()` (insensible aux
doublons — c'est la ligne que le fix fait repasser à `true`) ; `resolveShopRow` ne lit que `row.id`,
identique sur toutes les lignes d'un même élément ; `loadShopMenuAssignment` filtre strictement sur
`cfgId` ; `SpaceRestockView.vue:2462`, `analyse.js:146/167`, `StepMapShops.vue:1089`,
`useInventoryData.js:155`, `SpaceMenuView.vue:597` sont soit filtrés par config, soit déjà
dédoublonnés par id/nom. **Space Restock est réparé sans une ligne de frontend** — c'est le
meilleur test indépendant du fix.

## Risque de régression / à surveiller

- **Ordre de déploiement** : frontend et backend se déploient séparément. Les 3 garde-fous sont des
  no-ops contre le backend actuel → déployer le **frontend d'abord ou en même temps**, jamais le
  backend seul. Rollback = revert du seul hunk SQL.
- **Trois couches de cache pendant la vérification**, de la plus tenace à la plus courte : `Map`
  module-level clé `spaceId::` **15 min, survit à la navigation SPA** (`spaceShops.js:10,15`) →
  Redis 30 s (`spaces.service.ts:26`) → `_spaceShopsCache` (durée de vie du composant). **Hard
  reload obligatoire** (`Cmd+Shift+R`), sinon on teste des lignes d'avant le déploiement.
- **Oracle sur les compteurs** — seul test qui distingue « bon `configId` » de « bon `configId` ET
  bon compteur » : la réponse non filtrée restreinte à `cms88nx6f00x31d79s5agkbab` doit reproduire
  exactement les 11 nombres listés dans le Symptôme. Avant le fix, ce sont ceux de la config la plus
  ancienne.
- **Taille de payload** sur le chemin non filtré : multipliée par le nombre de configs partageant
  les éléments (Auxerre ≈ 7 × 11 ≈ 77 lignes au lieu de ~11), et `SpaceElement.image` est
  `@db.Text` (data-URL base64 possible sur des éléments legacy). Sans effet sur le chemin
  `?configId=`. À surveiller si un espace monte à beaucoup plus de configurations.
- **Non-régression garde-fous** : cocher/décocher un item sur un shop en config X (badge doit
  basculer), puis passer à un event d'une config Y partageant ce shop — son compteur doit être
  **inchangé**.
- **Non-régression consommateurs immunisés** (visuellement identiques) : Space Menus, Inventory,
  dropdown shops du wizard d'intégration.
- Pas de spec backend sur `spaces.service.ts` (aucun `spaces.service.spec.ts` n'existe) ; côté
  frontend `analyseConfigShopEntryCache.spec.js` et `inventoryContext.spec.js` mockent des lignes
  littérales et ne couvrent donc pas le cas multi-adhésion.

## Références

- [`../modules/03_BUILDER_ESPACES.md`](../modules/03_BUILDER_ESPACES.md) — `ConfigurationElement`,
  l'adhésion élément ↔ configuration (v2), et la règle « 1ʳᵉ adhésion par ordre de création » qui
  est exactement le piège corrigé ici.
- [`../adr/0002_builder_v2_relationnel_seul.md`](../adr/0002_builder_v2_relationnel_seul.md) —
  pourquoi les adhésions sont relationnelles.
- [`../modules/01_EVENT_PREDICT_ALGORITHME.md`](../modules/01_EVENT_PREDICT_ALGORITHME.md) —
  `isOpenByShop` / `configHasShops` côté Event Predict.
- Bugs voisins sur le même endpoint : [BUG-274-02](274_02_spacemenu_merchshop_visible_dans_assignation_menuitem.md),
  [BUG-275-02](275_02_merchshop_infiltre_menuassignment_predict_et_inventory.md).
