# BUG-288-01 — Réarmement : un composant partagé par plusieurs menu items produit N lignes au lieu d'une

- **Statut** : 🟢 Corrigé (2026-08-03, non mergé)
- **Sévérité** : 🟠 Majeur (sur-commande de packaging + double déduction du stock restant)
- **Domaine** : Stock (Réarmement / Feuille de course)
- **Repo(s) concerné(s)** : `datafriday-web` (cause racine 100 % front ; contrat backend correct)
- **Découvert le** : 2026-08-03
- **Fichiers** :
  - `frontend/src/utils/stockPlanning.js:251-267` (cause racine)
  - `frontend/src/utils/stockPlanning.js:89` (`stockItemKey`)
  - `frontend/src/utils/stockPlanning.js:411-444` (agrégation par `shopId|||itemKey`)
  - `frontend/src/views/SpaceRestockView.vue:470-473`, `:522-526`, `:3295` (`sourceSummary`)
  - `backend/src/features/menu-items/menu-items.service.ts:656-724` (référence contrat, **pas** un bug)

## En clair

Sur l'écran Réarmement, un gobelet « Cup 50CL » qui sert à la fois pour la Tsing Tao 50cl, la Fuze
Tea et un troisième produit s'affiche **trois fois**, chaque ligne ne comptant que la part d'un seul
produit (60 + 305 + 11) au lieu d'une seule ligne « Cup 50CL — 376 ». Ce n'est pas qu'un problème
d'affichage : chaque ligne arrondit son propre nombre de cartons et déduit **chacune** tout le stock
déjà présent au point de vente, donc on commande trop et le calcul de restant est faux dès que
l'inventaire est renseigné. Il faut une seule ligne par article physique, avec le total, et en
dessous le détail « pour quels plats ».

## Symptôme

Écran Réarmement (Auxerre, event « AJA vs Angers »), vue par point de vente :

| Article | Besoin | Restant | À déposer | Utilisé dans |
|---|---|---|---|---|
| Cup 50CL | 60 unit | 0 | 60 unit | Fuze Tea PET 40cl 25/26 (PFC) |
| Cup 50CL | 305 unit | 0 | 305 unit | Tsing Tao 50cl 25/26 |
| Cup 50CL | 11 unit | 0 | 11 unit | (4e menu item) |

Trois lignes pour **le même article physique**, dans **le même point de vente**. Attendu : une ligne
`Cup 50CL — 376 unit`, avec le détail par menu item en dessous.

Conséquences au-delà de l'affichage :

1. **Sur-commande de packaging** — `computePackagingForQuantity` (`stockPlanning.js:559`) fait
   `Math.ceil(quantité / packSize)` par ligne. Trois lignes = trois arrondis au carton supérieur au
   lieu d'un seul (ex. packSize 100 : `ceil(0.6)+ceil(3.05)+ceil(0.11)` = 1+4+1 = **6 cartons** au
   lieu de `ceil(3.76)` = **4**).
2. **Déduction multiple du stock restant** — `remainingQuantityForRow`
   (`SpaceRestockView.vue:2900-2918`) lit le comptage du PDV et le soustrait **par ligne**. Le même
   stock physique est donc déduit une fois par fragment. Invisible sur la capture (colonne Restant à
   0 partout : aucun comptage joint pour cet event), mais latent.
3. **Réglages utilisateur fragmentés** — `stockExcluded`, `stockAdjustments`, `stockPackedModes`
   sont keyés par `itemKey` : décocher « Cup 50CL » ou lui appliquer un % demande 3 gestes.
4. **Confirmations fragmentées** — `restockedRows` keyé `shopId|||itemKey` : 3 clics « Confirmer »
   pour un seul article à déposer.

## Cause racine

Identifiée. L'identité d'un article de stock est `stockItemKey(item)` =
`` `${item.id || item.name}|||${item.unit}` `` (`stockPlanning.js:89`), et l'agrégation se fait sur
`` `${shop.id}|||${itemKey}` `` (`stockPlanning.js:413`).

Dans `expandMenuItemStock`, la branche « composant simple » émet :

```js
out.push({
  id: component.id,          // ← stockPlanning.js:252
  sourceId: component.sourceId,
  name: component.name || componentMenuItem.name,
  ...
})
```

Or `component.id` **n'est pas** l'identifiant catalogue de l'article : c'est l'id de la **ligne de
recette**. Contrat backend (`menu-items.service.ts:656-724`), qui aplatit
`MenuItemIngredient` + `MenuItemComponent` + `MenuItemPackaging` en un seul `components[]` :

```ts
components.push({
  id: line.id,               // PK de la ligne de jointure (unique par recette)
  sourceId: line.packagingId, // (ou ingredientId / componentId) = id catalogue PARTAGÉ
  ...
})
```

Schéma Prisma : `MenuItemPackaging` / `MenuItemComponent` / `MenuItemIngredient` ont
`@@unique([menuItemId, <refId>])` — donc **un `line.id` distinct par (menu item, article)**. Trois
recettes utilisant le même gobelet ⇒ trois `component.id` ⇒ trois `itemKey` ⇒ trois lignes que
`rowsByKey` ne fusionne jamais.

L'invariant est pourtant explicitement documenté dans le fichier même
(`stockPlanning.js:222-224`) : « Identité ingrédient IDENTIQUE à l'inventaire (helpers partagés) →
le netting comptage↔réarmement joint. » Et la branche voisine le respecte déjà : les feuilles issues
de `flattenComponentDef` utilisent `componentIngredientId(sub)` = `marketPriceId || sourceId || id`
(`inventoryUtils.js:22-24`, consommé en `stockPlanning.js:233`). Seule la branche « composant
simple » est passée à côté.

Côté inventaire, `inventoryUtils.buildInventory` clé sur `component.name`
(`inventoryUtils.js:335`, `:389`) : l'inventaire agrège donc « Cup 50CL » en **une** ligne avec
`usedIn` multi-menus. Le réarmement est le seul des deux à fragmenter — d'où l'asymétrie observée.

## Correction

**Faite** (branche `fix/bug-287-01-txn-min-plage-horaire`, non mergée). Deux volets.

### Volet 1 — Identité (cause racine)

`stockPlanning.js` (branche « composant simple ») : `id: component.id` →
`id: componentIngredientId(component)` (helper exporté par `inventoryUtils.js`, désormais importé
en tête de `stockPlanning.js` à côté de `resolveComponentDef`/`flattenComponentDef`). Cascade :
`marketPriceId → sourceId → id`, identique à la branche feuille et à l'invariant documenté.
`sourceId` est toujours peuplé par le backend (FK non nullable), donc le repli sur `id` ne se
déclenche que hors contrat.

Effets obtenus : une ligne par article physique et par PDV, `sources[]` cumulant les menu items
(la fusion `sources` existait déjà, `stockPlanning.js:417-428`), un seul `Math.ceil` de packaging,
une seule déduction du restant, un seul réglage %/exclusion/confirmation.

**Vérifié** — `findStockReference` (`stockPlanning.js:512-531`) construit ses candidats à partir de
`itemId | id | sourceId` **et** du nom : `sourceId` y figurait déjà avant le fix, donc la résolution
du packaging ne change pas de cible. Seul cas résiduel : un article dont le `marketPriceId` pointe
vers une autre entrée catalogue que son `sourceId` — le `find` retiendrait la première entrée de la
liste qui matche l'un des deux (à surveiller sur tenant réel, cf. « Risque de régression »).
`remainingQuantityForRow` lit `live[row.itemId] || live[row.sourceId]` : `row.sourceId` est inchangé
par la fusion (`stockPlanning.js:435`), le netting comptage ⇄ réarmement ne peut donc pas régresser.

### Volet 2 — Détail « utilisé dans » par menu item (demande utilisateur)

`SpaceRestockView.vue` : nouvelle méthode `buildSourceBreakdown(row)` (à côté de `sourceSummary`,
conservée pour le cas mono-source). Elle fusionne `row.sources` par **nom de plat** et applique le
même `adjustedQuantity(qty, unit, itemKey)` que `targetQuantity` — la somme du détail reconstitue
donc la colonne **Besoin**. Résultat exposé en `row.sourceBreakdown` (calculé une fois dans
`restockRows`, pas appelé depuis le template) et cumulé sur tous les PDV en `group.sourceBreakdown`
dans `restockGroupsByItem`.

Rendu (3 sites, pour que les deux modes d'affichage racontent la même chose) : table « assignés »,
table « non rattachés », et en-tête de groupe du mode « par article ». Une seule source ⇒ ancienne
ligne texte ; ≥ 2 ⇒ liste `.sr-source-breakdown` nom + part :

```
Cup 50CL                          376 unit   0 unit   376 unit  [Confirmer]
  Utilisé dans :
    Tsing Tao 50cl 25/26 ......... 305
    Fuze Tea PET 40cl 25/26 (PFC) .. 60
    Tsing Tao 25cl 25/26 ........... 11
```

⚠️ Les parts se rapportent au **Besoin**, jamais à « À déposer » : le restant du PDV n'est pas
attribuable à un plat plutôt qu'à un autre. Le `title` de chaque quantité porte donc le libellé de
la colonne Besoin. Aux arrondis unitaires près, la somme des parts peut différer du total affiché
de ±1 (chaque part est arrondie par `roundForUnit`).

### Test

`frontend/tests/unit/stockPlanningSharedComponent.spec.js` (nouveau, 6 cas, verts) : deux menu items
d'un même PDV partageant `sourceId: 'cup-50'` avec des `id` de ligne différents ⇒ **une** ligne,
`totalQuantity` = 365 = somme, `sources.length === 2`, somme du détail = total, et
`computePackagingForQuantity` renvoie `packedCount: 4` (au lieu de 4+1 = 5 fragmenté).

## Risque de régression / à surveiller

- **État utilisateur persisté orphelin** : `stockAdjustments` / `stockExcluded` / `stockPackedModes`
  / `restockedRows` sont keyés par l'ancien `itemKey`. Après le fix, les clés changent → les
  réglages sauvegardés d'un event en cours sont ignorés. Dégradation douce (`SpaceRestockView.vue:2791`
  réinitialise les défauts à 100 % / non exclu), mais à annoncer : **une feuille en cours de
  préparation perd ses % et ses confirmations**.
- **Fusion trop large via `marketPriceId`** : deux articles de noms différents partageant le même
  `marketPriceId` fusionneraient en une ligne (le nom retenu serait celui rencontré en premier).
  C'est le comportement voulu côté inventaire (« matière achetée = vraie identité ») mais à vérifier
  sur un tenant réel avant merge.
- **Articles homonymes non fusionnés** : si le même gobelet existe en double dans le catalogue
  (une entrée Packaging + une entrée Ingredient), les `sourceId` diffèrent → deux lignes
  subsistent. Ce n'est plus un bug de calcul mais un doublon de référentiel ; le signaler plutôt
  que de fusionner par nom.
- **Consommateurs de `buildStockRequirements`** à retester : `useShoppingList.js:115`,
  `usePredictedNeed.js:60`, `SpaceRestockView.stockRowsRaw`. Le `nettedShopping` (déduction
  Storage) hérite mécaniquement de la fusion — vérifier que les totaux de la feuille de course
  baissent bien du montant sur-commandé et pas davantage.
- Pas de migration ni de backfill : aucun de ces `itemKey` n'est persisté côté serveur.
- **Miroir `datafriday-web`** : `src/utils/stockPlanning.js` y est octet pour octet identique à la
  copie corrigée. Le repo est hors des répertoires de travail de la session — la même modification
  doit y être reportée à la main.
- **Non lié** : `tests/unit/spaceMenusInventory.spec.js` échoue déjà avant ce fix (consolidation
  Market Price, « Coca » vs « Coca 33cl ») ; `apiOrMock.spec.js` et `eventDetailsEditor.spec.js`
  échouent sur l'environnement de test (mock réseau, ESM Vuetify). Aucun n'est causé par BUG-288-01.

## Références

- `frontend/docs/modules/` — domaine Stock / Réarmement.
- [BUG-020](20_filtre_storage_material_jamais_match.md), [BUG-033](33_exceedscap_ignore_casse_de_pack_bloque_retrait_valide.md) — mêmes zones (identité stock, casse de pack).
- `frontend/docs/QUESTIONS_A_BERTRAND.md` — netting comptage ⇄ réarmement (question déjà ouverte, cf. `inventoryUtils.js:14-16`).

---

JLH
