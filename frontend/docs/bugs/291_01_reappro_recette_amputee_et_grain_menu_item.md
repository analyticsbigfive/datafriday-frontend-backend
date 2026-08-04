# BUG-291-01 — Réappro : recette amputée et onglet « Par article » au grain plat

- **Statut** : 🟡 Corrigé non déployé (2026-08-04)
- **Sévérité** : 🔴 Critique (la liste de chargement d'un point de vente est fausse)
- **Domaine** : Stock (Réappro / Stock-up) — impacte aussi Inventaire et Restock
- **Repo(s) concerné(s)** : `datafriday-web` (100 % front ; **l'API est correcte**)
- **Découvert le** : 2026-08-04, en vérifiant le lot [BUG-290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md)
- **Fichiers** :
  - `frontend/src/utils/menuItemNormalize.js` (`buildComponents`, `normalizeComponent`) — **cause racine**
  - `frontend/src/components/EventPredictView.vue` (miroirs réactifs du store + watchers)
  - `frontend/src/components/EventPredictStockUpSection.vue` (`elementStockData`, `sortedShopElements`, garde nom, `unitCost`)
  - `frontend/src/components/StockElementRow.vue` (**nouveau** — ligne partagée par les deux modes)
  - `frontend/src/store/modules/shopMenuAvailability.js` (**nouveau** — disponibilité serveur, BUG-291-02)

## En clair

L'écran Réappro répond à une seule question : **qu'est-ce qu'on charge dans le camion ?**
Il répondait faux, pour deux raisons empilées.

D'abord, la recette n'arrivait pas entière. Le burger a sept éléments — salade, viande,
bun, cheddar, serviette, sauce, pickles. Cinq disparaissaient en route, et les deux
survivants arrivaient sans nom : ils fusionnaient donc tous ensemble en **une seule ligne
« 64,05 unit »** sans libellé, la même pour toutes les recettes du stand.

Ensuite, même corrigé, le mode « Par article » listait des **plats** (Hot Dog 53,
Tsing Tao 691). On ne charge pas des plats : on charge des pains et des gobelets.

## Symptôme

Relevé du 2026-08-04 — Burger 25/26 (Aux) (`cms87onoz00k11d79i9xk1ecx`), 105 u ajustées
sur le stand 6 A, configuration « foot 19h-21h standard ».

| Source | Contenu |
|---|---|
| API `/menu-items?spaceId=…` | `components: 2` + **`ingredients: 4`** + **`packagings: 1`** |
| API `/menu-items/:id/recipe` | 7 lignes complètes (`name`, `itemType`, `unit`, `marketPriceId`, `cost`) |
| `store.analyse.menuItems[burger].components` | **2**, sans `name` ni `unit` ni `sourceId` |
| Props de `EventPredictStockUpSection` | `ingredients: 0`, `components: 0` |
| Écran, stand 6 A | 1 ligne **sans nom**, `64,05 unit` |

**L'API est correcte des deux côtés.** Toute la perte est côté front.

## Cause racine

### A — `buildComponents` chaînait les trois relations en alternatives

`menuItemNormalize.js` :

```js
let comps = toArray(mi.components)                    // 2 lignes → non vide
if (!comps.length) comps = toArray(mi.componentsData)
if (!comps.length) {                                  // ← JAMAIS atteint
  comps = [ ...toArray(mi.ingredients), ..., ...toArray(mi.packagings) ]
}
```

Dès qu'un article portait **un seul** composant, ses ingrédients et son packaging étaient
jetés. C'est le symptôme S1 du brief initial : « seuls les composants apparaissent — les
ingrédients et le packaging manquent ».

### B — copie périmée du store dans EventPredictView

`ingredients` / `components` / `menuItems` étaient copiés du store dans le `data()` local
**une seule fois**, dans la fonction de chargement, avant que la vague 2b de `useSpaceData`
(catalogues recette) n'ait répondu. Aucun watcher ne resynchronisait.

⚠️ **La vague 2b n'échoue pas** — hypothèse envisagée puis écartée par le relevé : le store
portait bien 100 ingrédients et 24 composants pendant que le composant restait à `0, 0`.

### C — composants sans nom émis quand même

`expandMenuItem` poussait `name: component.name` sans vérifier. Comme `shopStockData`
agrège sur `${item.name}|||${item.unit}`, **tous** les composants anonymes de **toutes**
les recettes d'un stand fusionnaient sous la clé `undefined|||unit` → la ligne fantôme
`64,05 unit`. C'est aussi la cause du `localeCompare` sur `undefined` rustiné en
BUG-289-01. `stockPlanning.js:280-288` traitait déjà ce cas correctement.

## Correction

1. **Union des relations** (`buildComponents`), `componentsData` en repli seulement si
   les trois sont vides. `itemType` est posé d'après la relation d'origine — le payload
   liste ne le porte pas, et la règle « on n'éclate jamais un `Component` » en dépend.
   `normalizeComponent` résout aussi l'unité depuis `component.recipeUnit` /
   `packaging.unit` (seul `ingredient` était couvert).
   **Dédoublonnage obligatoire** : `normalizeMenuItem` renvoie `{...mi}`, donc un article
   déjà normalisé conserve ses relations brutes à côté du `components[]` fusionné —
   sans passe de dédup, re-normaliser (ce que fait `useSpaceData` après la vague 2b)
   donnait **12 lignes au lieu de 7**, donc des quantités de réappro gonflées en silence.
   Le contrat d'idempotence est documenté et désormais couvert par un test.
2. **Miroirs réactifs** (`storeAnalyseMenuItems` / `…Ingredients` / `…Components`) +
   watchers qui n'adoptent que ce qui est **strictement plus riche**. Pour `menuItems`,
   la richesse se mesure en nombre de **lignes de recette**, pas d'articles : les deux
   vagues renvoient les mêmes articles, seule la profondeur change.
3. **Garde sur les composants sans nom** — la ligne est sautée avec un log, miroir de
   `stockPlanning.js:280-288`.
4. **`elementStockData`** — vue « Par article » au grain élément, dérivée de
   `shopStockData` (jamais d'une seconde expansion), même clé d'agrégation
   `${name}|||${unit}`. Les deux modes de l'écran ne peuvent donc pas diverger.
5. **`StockElementRow.vue`** — ligne unique partagée par « Par PDV » et « Par article » :
   libellé, badge de nature, quantité, coût, conditionnement, « utilisé dans », puces PDV
   (masquées en vue PDV). Le markup était dupliqué inline, avec un coût affiché d'un seul côté.
6. **Coût par élément** (décision JLH du 2026-08-04) — `unitCost` est porté par les lignes
   de relation, aucun appel supplémentaire. `totalStockCost` est désormais calculé sur les
   **éléments**, même source que les lignes : le total et le détail ne peuvent plus diverger.
7. **Suppression du groupement par `shopType`** — `groupedEntries` et son `Collapsible`
   rangeaient les stands sous un libellé composite, avec repli « Aucun type de point de
   vente » où atterrissaient **tous** les stands de cet espace. Remplacé par
   `sortedShopElements` (à plat, trié par nom). `itemStockData`, `collapsedStockGroups`,
   `isStockGroupOpen`, `setStockGroupOpen`, `getCompositeLabel`, `getCompositeIcon` et les
   constantes `FB_TYPE_*` sont supprimés, pas laissés en place.

## Résultat attendu

Burger 25/26 (Aux), 105 u sur 6 A → **7 lignes**, sauce et pickles entiers :

| Ligne | Type | Qté | Unité | Coût |
|---|---|---|---|---|
| Salade Iceberg | Ingrédient | 4,2 | Kg | 5,04 € |
| Viande Hachée -  Vrac | Ingrédient | 12,6 | Kg | 114,41 € |
| Bun - Burger | Ingrédient | 105 | Pc | 57,75 € |
| Cheddar Tranche | Ingrédient | 105 | Pc | 18,33 € |
| Serviettes Papier | Packaging | 105 | Pc | 0,57 € |
| Sauce burger 25/26 (Aux) | Composant | 2,1 | kg | 7,79 € |
| Pickles 25/26 (Aux) | Composant | 1,05 | kg | 2,14 € |

Total 206,03 €. Aucune ligne sans nom, aucun ingrédient interne à la sauce ou aux pickles.

## BUG-291-02 — articles « non disponible » comptés dans les prévisions

> ⚠️ **Section conservée pour l'historique — le correctif décrit ici était incomplet.**
> Diagnostic complet, correctif final et tests :
> [`291_02_eventpredict_menuitem_indisponible_compte_comme_vente.md`](291_02_eventpredict_menuitem_indisponible_compte_comme_vente.md).
> Le filtre ci-dessous retirait l'article de la liste **affichée** du menu assigné, ce qui le
> faisait basculer dans le bucket « non attaché » **avec sa quantité intacte** : il ressortait
> par une autre porte. Le Réarmement, lui, n'était pas concerné du tout (chaîne séparée).

**Symptôme.** Sur le stand 1 A (config « Foot 19-21h Standard »), le tiroir Space Menu
affiche « Disponible 42 / Non disponible 11 » — Cookie (« Pas de recette »), Café,
Croque Monsieur… Ces articles apparaissaient malgré tout dans Event Predict et
comptaient dans les ventes prédites, donc dans le stock-up.

**Le bon signal, et celui à ne PAS utiliser.** `unmapped`
(`analyseReconciliation.js:367`) signifie « vendu sur Weezevent mais non assigné » —
aucun rapport avec la recette. Le signal correct est `available`, **calculé côté
serveur** par `GET /space-menu/shop/:id/items`, avec des raisons typées
(`INACTIVE`, `NO_SUPPLIER`, `SUPPLIER_NOT_IN_SPACE`) — la même valeur que celle
affichée par le tiroir. Le re-dériver côté front rejouerait la divergence entre écrans
que ce lot supprime. **Ce constat reste valide** et fonde le correctif final.

**Correction (1re passe).** Nouveau store `shopMenuAvailability` (même motif single-flight +
TTL 15 min que `shopMenuItems`), consommé par `loadShopMenuAssignment` avec un filtre unique
appliqué aux deux index :

```js
// Code d'origine — REMPLACÉ, cf. 291-02 : `itemMap` ne doit pas subir ce filtre.
const enabled = items.filter((it) => it && it.enabled === true && it.available !== false)
```

`available !== false` et non `=== true` : un backend antérieur qui n'enverrait pas le
champ ne doit pas vider tous les menus. Les trois invalidations de cache d'EventPredict
purgent aussi ce store — sans quoi un article réactivé resterait exclu 15 minutes.

⚠️ **Pourquoi un store séparé plutôt que la migration du store partagé** (option
envisagée puis écartée sur preuve) : `/space-menu/shop/:id` et
`/space-menu/shop/:id/items` **ne sont pas interchangeables**. Le premier renvoie l'arbre
complet des recettes (composants, ingrédients, coûts) dont l'Inventaire dépend
(`useInventoryData.js:261`) ; le second est un payload léger sans recettes. Migrer le
store partagé aurait cassé l'Inventaire. Second piège : `/items.price` est **TTC** alors
que les consommateurs lisent `basePrice` — mapper l'un sur l'autre aurait injecté de la
TVA dans le CA sans rien signaler.

Effet de bord favorable : EventPredict passe du payload lourd au payload léger, donc
**moins** de charge sur la boucle par shop qui avait provoqué des 429 Render.

## Deux fausses pistes — réfutées, à ne pas rouvrir

Documentées ici parce qu'elles ont coûté du temps et qu'elles sont crédibles.

**1. « L'assignation du 6 A est cassée. »** L'écran affichait « Ajusté 0 » et
« 1 / 3 points de vente » sur un article que Space Menus semblait assigner à deux stands.
Diagnostic console : `assignedItemsForElement(6 A)` résout **correctement** par nom vers
19 articles, et les clés d'assignation (`"1 a"`…`"visiteur"`) correspondent exactement aux
noms de `fbElements` sur les 11 PDV. La capture Space Menus montrait une **autre
configuration** : dans « foot 19h-21h standard », l'article n'était assigné qu'au 1 A, qui
n'a jamais vendu de burger → `Ajusté 0` était **juste**. Les candidats explorés ensuite —
filtre `enabled === true` (`EventPredictView.vue:3997`) et scoping de `configurationId` —
tombent avec elle.

**2. « Prédire sur un PDV non assigné est un bug. »** BAR EPHEMERE recevait des ventes
prédites de burger sans l'avoir à sa carte. Décision JLH : même cas de figure que le 6 A,
la réponse est produit et non technique — on ajoute l'article au menu du stand. Le badge
d'alerte « N prédits sur des PDV non assignés » envisagé un temps est abandonné.

## Risque de régression / à surveiller

- **Rayon d'impact large et assumé** : `normalizeMenuItem` alimente `useSpaceData`, donc
  **Restock et Inventaire** autant qu'EventPredict. Les trois veulent la recette complète
  à un niveau, mais leurs écarts doivent être relus à l'écran, pas seulement ceux
  d'EventPredict.
- Le total de coût change de source (menu items → éléments). **Mesuré le 2026-08-04** sur
  l'espace réel : `stock-up 7 539,92 €` vs `coût ajusté 7 537,33 €`, dont
  **2,59 € d'arrondi et −0,01 € de base de coût**. Autrement dit `menuItem.totalCost`
  égale la somme des coûts de ses composants au centime près : le changement de grain
  n'introduit **aucune** divergence de données. L'écart résiduel vient du `Math.round`
  de `getAdjustedQuantity` par couple (stand, article) — et il est **voulu** : on ne
  charge pas 104,7 burgers. Une infobulle (`epsTotalEstimatedCostHint`) le dit à l'écran
  plutôt que de laisser la question surgir en démo.
- La suppression du groupement par `shopType` est visible pour un espace dont les stands
  **ont** un type : ils ne sont plus regroupés. Décision assumée (JLH, 2026-08-04).

## Tests

- `frontend/tests/unit/menuItemNormalizeRelations.spec.js` (**nouveau**, 11 cas) — union des
  3 relations, résolution nom/unité par entité nichée, `itemType` d'après la relation,
  anti double comptage `componentsData`, **idempotence**, quantités × 105 du cas mesuré.
- `frontend/tests/unit/eventPredictElementStockData.spec.js` (**nouveau**, 8 cas) — fusion
  d'un élément sur deux stands, séparation par unité, fusion des sources par plat,
  non-mutation de `shopStockData`, tri, `totalStockCost` = 206,03 € sur le cas mesuré.
- `frontend/tests/unit/eventPredictStockUpExpansion.spec.js` — mis à jour : `unitCost` dans
  la shape des lignes, `miUnitCost` branché sur la vraie méthode.
- `frontend/tests/unit/shopMenuAvailabilityStore.spec.js` (**nouveau**, 9 cas) — cache par
  (shop, config), ids indisponibles toutes raisons confondues, garde-fou backend antérieur
  (`available` absent → l'article reste disponible), invalidation, et le prédicat
  d'exclusion `enabled === true && available !== false`.

`pnpm test:unit` : **750 passés**. 4 échecs préexistants inchangés, vérifiés identiques sur
un worktree à HEAD sans ces modifications — `apiOrMock.spec.js` (mock réseau),
`eventDetailsEditor.spec.js` (ESM Vuetify), `spaceMenusInventory.spec.js` (consolidation
`inventoryUtils`).

## Références

- [BUG-290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md) — lot précédent (prédictions du Stock-up, règle combo).
- [BUG-288-01](288_01_restock_composant_partage_lignes_dupliquees.md) — identité catalogue côté restock.
- `frontend/docs/QUESTIONS_A_BERTRAND.md` — décision combo du 2026-08-04.

---

JLH
