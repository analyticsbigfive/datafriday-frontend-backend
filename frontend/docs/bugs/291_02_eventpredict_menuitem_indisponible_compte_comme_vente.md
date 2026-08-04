# BUG-291-02 — un article impossible à produire prévoyait quand même des ventes

- **Statut** : 🟡 Corrigé non déployé (2026-08-04)
- **Sévérité** : 🔴 Critique (on planifiait, chiffrait et réarmait des ventes impossibles)
- **Domaine** : Prévision / Stock (Event Predict, Réarmement)
- **Repo(s) concerné(s)** : `datafriday-web` (100 % front — **l'API est correcte**)
- **Découvert le** : 2026-08-04, config « foot 19h-21h standard » (`cms88nx6f00x31d79s5agkbab`)
- **Fichiers** :
  - `frontend/src/components/EventPredictView.vue` (`loadShopMenuAssignment`) — **cause racine**
  - `frontend/src/components/EventPredictMenusSection.vue` (gardes de quantité, bucket, badge)
  - `frontend/src/components/EventPredictStockUpSection.vue` (gardes de quantité, `shopStockData`)
  - `frontend/src/utils/stockPlanning.js` (`buildStockRequirements`, `buildMenuItemDemand`)
  - `frontend/src/views/SpaceRestockView.vue` (`loadRestockShopAssignment`)
  - `frontend/src/store/modules/shopMenuAvailability.js` (disponibilité serveur, déjà en place)

> Première moitié du correctif livrée avec [BUG-291-01](291_01_reappro_recette_amputee_et_grain_menu_item.md).
> Cette fiche documente le **diagnostic complet et le correctif final** ; la section
> correspondante de 291-01 est périmée et renvoie ici.

## En clair

Un article peut être au menu d'un point de vente **sans qu'on puisse le fabriquer** : il lui
manque des ingrédients, ou il n'a carrément pas de recette. Le tiroir Space Menu le dit déjà —
« Disponible 42 / Non disponible 11 ».

Event Predict, lui, continuait à prévoir des ventes dessus : le Cookie du stand affichait
« 7 – Ajusté : 7 ». Ces 7 cookies entraient dans le chiffre d'affaires prévu, dans le stock-up,
et dans la liste de réarmement — avec leurs ingrédients. On planifiait de vendre quelque chose
qu'on ne pouvait pas produire, et on chargeait le camion en conséquence.

Après ce lot : **0 vente prévue**, donc 0 € et 0 ligne de stock. L'article reste toutefois
**visible**, dans l'onglet « Sans ventes prévues », avec un badge « indisponible » et la raison —
disparaître sans explication laisse l'utilisateur devant un menu incomplet sans savoir pourquoi.

## Symptôme

Capture du 2026-08-04, onglet Menus, stand de la config `cms88nx6f00x31d79s5agkbab` :

| Article | Badge affiché | Quantité affichée | État serveur réel |
|---|---|---|---|
| Cookie – 3,64 € HT | `désactivé` | **7 – Ajusté : 7** | `enabled:false` **ET** `available:false` (`hasRecipe:false`) — le double état, cf. Correctif v2 |
| Chips Lay's Nature (Aux) – 2,10 € HT (coût 0,76 · marge 64 %) | `désactivé` | 12 – Ajusté : 12 | `enabled:false`, **disponible** |
| Ecocup AJA 50cl – 1,54 € HT | `désactivé` | 10 – Ajusté : 10 | `enabled:false`, disponible |

Les trois portaient le **même** badge et se retrouvaient dans le **même** onglet
« Non attachés au menu (3) », alors qu'il s'agit de deux problèmes sans rapport :

- `available:false` → **impossible à produire** ; c'est ce bug ;
- `enabled:false` → **désactivé sur le menu du PDV** ; flux « réactiver » normal, inchangé.

## Cause racine

`EventPredictView.loadShopMenuAssignment` appliquait le filtre de disponibilité **aux deux
index à la fois** :

```js
const enabled = items.filter((it) => it && it.enabled === true && it.available !== false)
idMap.set(key, new Set(enabled.map((it) => it.id)))
itemMap.set(key, enabled.map((it) => ({ /* … */ })))
```

`itemMap` est la liste **affichée** du menu assigné. En retirant l'article indisponible de cette
liste, on ne l'excluait pas : on le déclassait. `getGroupedMenuItems` ne le trouvait plus dans
`assignedIds`, constatait une quantité prédite > 0, et le rangeait dans le bucket `unmapped` :

```js
const unmapped = base.filter(
  (it) => !assignedIds.has(it.id) && this.getPredictedQuantity(element.id, it.id) > 0,
)
```

L'article **ressortait donc par une autre porte**, avec sa quantité intacte, cochable, et
comptabilisé partout en aval. `rowAddKind` le voyant encore dans `shopMenuMembership`
(construit, lui, avant tout filtre), il héritait au passage du badge « désactivé » — d'où la
confusion avec le cas `enabled:false`.

Le commentaire de décision présent dans le code (« ne doit ni apparaître dans Event Predict, ni
compter dans les ventes prédites, ni entrer dans le stock-up ») n'était donc **appliqué qu'à
moitié**.

### Le Réarmement n'était pas concerné du tout

Chaîne distincte, jamais atteinte par ce qui précède :

```
SpaceRestockView → stockPlanning.buildStockRequirements → getPredictedQuantityForElement
                                                        → expandMenuItemStock
```

Aucune notion de disponibilité. Et le store qu'elle utilise (`shopMenuItems`,
`GET /space-menu/shop/:id`) **ne porte pas** `available` : seul l'endpoint léger
`/items` le calcule. `restockAssignmentByName` ne pouvait pas servir de garde — il n'alimente
que le badge « rattaché / non rattaché », il ne filtre aucune ligne.

## Correction

### 1. Séparer les deux usages de l'index (`EventPredictView.vue`)

> ⚠️ Prédicats de la **v1**, resserrés le même jour — les prédicats **en vigueur** sont ceux du
> § « Correctif v2 » plus bas (le `enabled === true` de `unavailableMap` laissait passer le
> double état désactivé + improduisible).

| Index | Filtre | Rôle |
|---|---|---|
| `itemMap` | `enabled === true` | liste **affichée** → l'indisponible redevient visible, avec `available` / `hasRecipe` / `missingIngredients` |
| `idMap` | `enabled === true && available !== false` | ids **auto-sélectionnables** (lu aussi par `derivedMenuConfigFromRecords`) → jamais coché d'office |
| `unavailableMap` (**nouveau**) | `enabled === true && available === false` | index d'indisponibilité `{ids, names}` pour le Stock-up, qui ne reçoit que des ids |

`available === false` **strict**, symétrique du `!== false` d'origine : un backend antérieur
qui n'enverrait pas le champ ne doit ni vider les menus, ni tout déclarer indisponible.

`missingIngredients` est **aplati en noms** au passage : le backend renvoie des objets
`{ kind, name, reason, … }` et le template fait `.join(', ')` — les objets bruts auraient
affiché `[object Object]`.

### 2. Fermer les quatre portes de quantité

Une seule garde ne suffisait pas — trois chemins contournent `getPredictedQuantity` :

| Emplacement | Pourquoi |
|---|---|
| `MenusSection.getPredictedQuantity` | porte principale : buckets, `unitSliderMax`, auto-sélection |
| `MenusSection.getAdjustedQuantity` | **la garde qui rattrape le correctif lui-même** : `manual` n'est actif que si `base === 0`. Forcer le prédit à 0 *active* la branche manuelle → un ajusté > 0 franchirait le garde `adjustedQty === 0` du stock-up |
| `MenusSection.getPredictedItemRevenue` | lit `timelineRevenueIndex`, index **distinct** → sinon 0 unité mais du CA prévu |
| `StockUpSection.getPredictedQuantity` / `getAdjustedQuantity` + `shopStockData` | le Stock-up ne relit pas les quantités de l'écran Menus |

`autoSelectIfEmpty` filtre en plus explicitement : `assignedIdsForElement` dérive de `itemMap`,
désormais élargi — sans ce filtre, un article indisponible serait coché d'office sur un
événement neuf, exactement l'inverse de l'intention.

### 3. Affichage : rester visible, avec la raison

La quantité valant 0, le bucket devient `noSales` → l'article s'affiche dans « Sans ventes
prévues », plus dans « Non attachés au menu ». La vérité **serveur** écrase la dérivation front
`checkMenuItemAvailability`, qui applique encore la règle « fournisseur sans `sites` = livre tous
les espaces » que le backend a explicitement abandonnée (`space-menus.service.ts:427-430`).

⚠️ L'override est écrit **après** le spread `...checkMenuItemAvailability(it)` — à l'intérieur,
la dérivation front reprendrait la main.

Nouveau badge `indisponible` (`epmUnavailableBadge`) ; la raison réutilise l'affichage existant
« Manquant : … », complété par `epmNoRecipe` pour le cas `hasRecipe === false` où
`missingIngredients` est vide (le Cookie).

Sélection : case non cochable, et un id encore présent dans une version sauvegardée est
neutralisé **à la lecture** — on ne réécrit pas le choix persisté de l'utilisateur.

### 4. Réarmement

Nouveau paramètre `unavailableItems` sur `buildStockRequirements` **et** `buildMenuItemDemand`
(on n'achète pas non plus les ingrédients d'un plat qu'on ne peut pas produire) : index **PLAT**
`{ ids: [], names: [] }` au niveau **espace**.

> ⚠️ **Correctif v2, sur signalement immédiat (Cookie encore présent au Réarmement).** La 1re
> version passait un index par shop (`[{ shopName, itemIds, itemNames }]`) joint par
> `normalizeName(shop.name)` — et cette jointure **ratait en silence** dès que la config du
> calcul était **synthétique** : `buildSyntheticConfig` (`SpaceRestockView.vue`) pose un **id
> brut** comme `shop.name` quand les records n'en portent pas → aucune entrée ne matchait,
> l'exclusion était inopérante, le Cookie et sa farine ressortaient. Or `available` est calculé
> **par espace** côté serveur (`getItemsWithAvailabilityForSpace`) : la granularité par shop
> n'apportait rien, elle n'était qu'une surface de panne. L'index plat n'a plus aucune jointure
> à rater. Un test dédié rejoue la config synthétique.

L'exclusion est placée **après** la résolution catalogue et **avant** le calcul de quantité, et
teste les trois clés disponibles — id timeline, id catalogue, nom normalisé — parce que l'id du
record diffère régulièrement de l'id catalogue (c'est tout le sujet de
[BUG-290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md)).

Côté vue, `loadRestockShopAssignment` dispatche `shopMenuAvailability/fetchForShop` **dans la
boucle existante** plafonnée à 3 : pas de nouveau parallélisme (l'historique des 429 Render
l'interdit), endpoint léger, et même clé de cache `shopId::configId` avec TTL 15 min que celle
qu'Event Predict remplit — sur un parcours Predict → Réarmement, l'appel est servi par le cache.
Le fetch de disponibilité est dans un **try indépendant** du fetch lourd `shopMenuItems` (v2) :
l'échec de l'un n'emporte pas l'autre. Si la disponibilité échoue, on n'exclut rien (dégradation
vers le comportement antérieur) ; le log console nomme les articles exclus —
`[RESTOCK] … N article(s) non produisible(s) exclus : [Cookie, …]` — pour rendre l'état de la
garde vérifiable d'un coup d'œil.

## Les 4 chaînes, et lesquelles appliquent la règle

Même schéma que la [question #18](../QUESTIONS_A_BERTRAND.md) (explosion des combos), où des
implémentations dupliquées à dessein ont dû être alignées une par une :

| Chaîne | Fichier | Règle appliquée |
|---|---|---|
| Event Predict (Menus + Stock-up) | `EventPredict*Section.vue` | ✅ ce lot |
| Réarmement / BOM | `stockPlanning.js` | ✅ ce lot |
| Inventaire | `inventoryUtils.js`, `useInventoryData.js` | ❌ à trancher |
| Backend `deriveSales` | `logistics.service.ts` | ❌ non aligné |

⚠️ `useInventoryData.availableMenuItems` est un **faux ami** : il ne filtre que sur `enabled`,
jamais sur `available`.

## Correctif v2 (même jour) — la « limite connue » n'a pas tenu deux heures

La v1 filtrait `unavailableMap` sur `enabled === true && available === false`, et documentait
comme « assumé » le trou du double état `enabled:false && available:false`. La donnée réelle l'a
invalidé immédiatement : **le Cookie du 1 A est exactement dans ce double état** — il ressortait
en « Non attachés au menu », badge « désactivé », avec ses **7 ventes prévues** intactes
(capture utilisateur, config `cms88nx6f00x31d79s5agkbab`).

Règle finale : **`available === false` fait foi SEUL**, quel que soit `enabled`. En code
(`loadShopMenuAssignment`) :

| Index | Prédicat v2 | Changement |
|---|---|---|
| `unavailableMap` | `available === false` (tout le payload, calculé **avant** les `continue`) | condition `enabled` supprimée |
| `itemMap` | `enabled === true \|\| (assigned === true && available === false)` | l'assigné-désactivé-improduisible entre dans la liste affichée → bucket `noSales`, badge « indisponible », raison |
| `idMap` | `enabled === true && available !== false` | inchangé |

Un improduisible **non assigné** reste hors liste ; Chips/Ecocup (`enabled:false`, disponibles)
gardent leur flux « réactiver » à l'identique — verrouillé par test.

**Effet checkbox assumé** : un article improduisible n'est plus réactivable depuis Event Predict
(`onItemCheckboxChange` bloque en tête, quelle que soit la porte). Réactiver un article qu'on ne
peut pas fabriquer n'aurait rien produit ; le chemin correct est Space Menus, après correction de
la recette — l'article redevient alors `available:true` et sort de l'index au chargement suivant.

Le Réarmement n'avait pas ce trou : `SpaceRestockView` filtrait déjà `available === false` sans
condition `enabled`.

**Branche legacy de `getGroupedMenuItems`** (`:2044-2047`, catalogue réparti sales/noSales quand
*aucune* assignation n'existe dans toute la config) : elle ne porte pas l'override serveur, ses
items venant du catalogue et non de `itemMap`. Elle est **inatteignable dès que la règle
s'applique** — `unavailableMap` n'est peuplée que si un shop a des articles `enabled`, ce qui
peuple aussi `itemMap`, ce qui rend `assignmentFeatureActive()` vrai et cette branche morte.
Vérifié : les deux index sont construits dans la même boucle, à partir du même `assignedEnabled`.

## Risque de régression / à surveiller

- **Les totaux prévisionnels baissent** après déploiement. C'est l'effet recherché — on retire
  des ventes qui n'auraient pas pu être servies — mais l'écart sera visible en comparant à une
  version sauvegardée antérieure.
- **Ne pas confondre avec `enabled:false`** : Chips Lay's et Ecocup restent en « Non attachés au
  menu » avec leur badge « désactivé » et leur action « réactiver ». Un test dédié verrouille
  cette frontière.
- La garde est **inactive tant que la prop n'est pas chargée** (`null`) : un écran monté avant la
  fin du chargement se comporte comme avant, puis se corrige. Pas de flash d'articles retirés,
  mais un bref instant où ils sont encore comptés.
- `getPredictedItemRevenue` n'a **aujourd'hui aucun appelant** : la garde y est posée par
  cohérence, elle n'est pas couverte par l'usage réel.

## Tests

- `frontend/tests/unit/eventPredictUnavailableNoSales.spec.js` (10 tests) — dont la
  **non-régression du correctif lui-même** : une quantité manuelle ne ressuscite pas un article
  indisponible ; bucket `noSales` ; vérité serveur qui écrase la dérivation front ; case
  neutralisée sans réécriture de la sélection persistée ; prop absente = comportement inchangé ;
  auto-sélection qui ne coche pas d'office.
- `frontend/tests/unit/stockPlanningUnavailable.spec.js` (7 tests) — exclusion du réarmement et
  du BOM, appariement par nom quand l'id du record ≠ id catalogue, normalisation du nom de shop,
  et sortie **strictement identique** sans le paramètre.
- `frontend/tests/unit/shopMenuMembershipGuard.spec.js` — `this` construit à la main, complété de
  `isItemUnavailable` (`onItemCheckboxChange` la consulte désormais).

Suite complète : 805 tests passants, 4 échecs **pré-existants** sans rapport (transform
Vuetify/ESM dans `apiOrMock`, `spaceMenusInventory`, `eventDetailsEditor`).

## Vérification manuelle

Config `cms88nx6f00x31d79s5agkbab` :

1. Onglet **Menus** — Cookie et Café ne sont plus dans « Non attachés au menu » ; ils sont dans
   « Sans ventes prévues », badge « indisponible », `0 – Ajusté : 0`, case inactive, raison
   affichée (« aucune recette » pour le Cookie).
2. Chips Lay's et Ecocup **inchangés** dans « Non attachés au menu ».
3. Onglet **Stock-up** — aucun ingrédient provenant uniquement du Cookie/Café.
4. Écran **Réarmement** — aucune ligne issue de ces articles ; les autres inchangées à l'unité
   près ; les PdV fermés toujours exclus.

---

JLH
