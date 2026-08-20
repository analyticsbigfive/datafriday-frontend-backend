# BUG-133-02 — `loadRecipeContext` : résolution du conditionnement par nom jamais tentée pour le chemin d'explosion principal (readyForSale=No)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock (Logistics)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend seul)
- **Découvert le** : 2026-08-20 (balayage complet du module Logistique demandé par Ulrich, suite
  aux fix packaging frontend BUG-347-02/348-02 côté web)
- **Fichiers** :
  - `src/features/logistics/logistics.service.ts:820-839` (`loadRecipeContext`, population
    `unresolvedNames`/`mpByName`)
  - `src/features/logistics/logistics.service.ts:889-923` (`itemRefsForMenuItem`, consommation)
  - `src/features/logistics/logistics.service.ts:1391-1434` (`getStock`, repli niveaux orphelins)
  - `src/features/logistics/logistics.service.ts:274-295` (`resolveUnitsPerPackForItemKey`)
  - `src/features/logistics/logistics.service.ts:2499-2507` (`checkConsumptionFeasibility`,
    `uppByName`)

## Symptôme

Sur `/spaces/:id/logistic`, un ingrédient référencé par un menu item `readyForSale='No'` (le
chemin d'explosion recette principal — la majorité du catalogue) sans `Ingredient.marketPriceId`
direct n'affichait jamais son conditionnement réel (`packagingType`/`unitsPerPack` restaient
`null`), même quand une Market Price au nom identique existait bien dans le catalogue tenant.
Repéré indirectement via un balayage frontend complet du module — le front (`LogisticItemCard.vue`,
`LogisticByItemView.vue`) affiche correctement `item.packagingType` quand il est fourni ; c'est la
donnée elle-même qui n'arrivait jamais résolue depuis le backend pour ce chemin.

## Cause racine

`loadRecipeContext` construit `mpByName` (résolution du conditionnement par NOM, utilisée en
repli quand un ingrédient n'a pas de `marketPriceId` direct) à partir d'un Set `unresolvedNames`
peuplé ainsi (avant fix) :

```ts
const unresolvedNames = new Set&lt;string&gt;();
for (const item of [...seedItems, ...comboByName.values()]) {
  if (this.normYesNo(item.readyForSale) === 'Yes' && item.ingredients.length === 1) {
    const ing = item.ingredients[0].ingredient;
    if (ing?.name && !ing.marketPrice) unresolvedNames.add(ing.name.trim());
  }
}
```

Cette population ne collecte que les items `readyForSale='Yes'` mono-ingrédient — exactement la
population que [BUG-048](48_readyforsale_yes_mono_ingredient_masque_par_marketprice.md) a rendue
non-consommatrice de cette résolution : depuis ce fix (juillet 2026), un item `readyForSale='Yes'`
retourne toujours sa propre ref `kind: 'product'` AVANT d'atteindre la boucle des ingrédients
(`itemRefsForMenuItem:889-897`, `if (!isCombo && readyForSale==='Yes') { ...; return refs; }`).

`mpByName` n'est en réalité consommée (`itemRefsForMenuItem:917`,
`ctx.mpByName.get(name.toLowerCase())`) QUE par les items qui atteignent la boucle des
ingrédients : `readyForSale='No'` (le cas normal) ou `comboItem='Yes'`. Le doc de BUG-048 confirme
que le calcul équivalent côté consommation des ventes (`perUnit`/`explodeSalesToConsumption`,
`unresolvedIngredientNames`/`mpByItemName`) a bien été nettoyé/supprimé à ce moment-là car devenu
mort — mais l'équivalent côté référentiel (`loadRecipeContext`, utilisé par `itemRefsForMenuItem`)
n'a pas été réaligné sur son véritable consommateur : la condition de population est restée
calée sur l'ANCIENNE branche (celle que BUG-048 a justement fait disparaître comme consommatrice),
au lieu d'être recalée sur la boucle des ingrédients qui, elle, existe toujours et utilise
toujours `mpByName`.

Effet : quasiment aucun overlap entre "items dont le nom d'ingrédient est ajouté à
`unresolvedNames`" et "items qui appellent réellement `ctx.mpByName.get(...)`" — la résolution par
nom échouait silencieusement pour le cas normal (`readyForSale='No'`), sur potentiellement tout le
catalogue recette.

## Correction

- `unresolvedNames` reconstruit avec la MÊME garde que la boucle des ingrédients
  (`isCombo || readyForSale !== 'Yes'`), sur TOUS les ingrédients de l'item (plus seulement le cas
  mono-ingrédient — un item multi-ingrédients readyForSale='No' a autant besoin de cette
  résolution pour chacune de ses lignes).
- Repli niveaux orphelins (`getStock`) : `marketPriceId` était déjà connu sur le `StockLevel` mais
  `packagingType` restait figé à `null` — résolution groupée ajoutée, bornée aux seuls
  `marketPriceId` réellement référencés par ces niveaux orphelins (jamais tout le catalogue
  tenant), même principe que web BUG-347-02.
- Déterminisme : `MarketPrice.itemName` n'a pas de contrainte unique — plusieurs lignes peuvent
  partager un nom (différents fournisseurs). Les 3 résolutions par nom (`mpByName`,
  `resolveUnitsPerPackForItemKey`, `uppByName` dans `checkConsumptionFeasibility`) n'avaient aucun
  `orderBy`, donc un ordre Postgres arbitraire décidait quelle ligne "gagne" en cas de doublon.
  Ajout d'un `orderBy: { createdAt: 'asc' }` sur les 3 — résultat reproductible, pas une
  désambiguïsation complète (cf. limites ci-dessous).

## Risque de régression / à surveiller

- **Vérifier en priorité** : un menu item `readyForSale='No'` dont un ingrédient de recette n'a
  pas de `marketPriceId` direct mais dont le nom correspond à une Market Price existante — le
  conditionnement doit maintenant apparaître sur `/logistic` là où il était vide avant ce fix.
  C'est le changement de comportement le plus large de ce correctif — à valider sur le catalogue
  réel, pas seulement un cas isolé.
- Ne touche PAS le chemin de consommation des ventes (`explodeSalesToConsumption`/`perUnit`,
  Path B) — celui-ci ne lit jamais `marketPriceId`/`packagingType`, donc aucun risque sur les
  quantités décomptées à la vente, uniquement sur l'affichage référentiel (Path A).
- **Limite connue, non traitée par ce fix** : `orderBy: { createdAt: 'asc' }` rend le choix
  déterministe mais ne garantit pas que c'est la BONNE ligne parmi plusieurs Market Price
  homonymes (différents fournisseurs) — désambiguïsation complète déjà possible ailleurs
  (`getMarketPricesForItem`, dropdown du mouvement manuel) mais pas branchée ici. À surveiller si
  des homonymes existent réellement en prod pour des ingrédients sans `marketPriceId` direct.
- Aucune migration, aucun changement de schéma — uniquement la logique de résolution dans
  `logistics.service.ts`.
- Suite de tests `logistics.service.spec.ts` déjà signalée cassée indépendamment de ce changement
  (cf. BUG-048, "7/8 tests échouent avant et après") — vérification manuelle nécessaire, pas de
  filet automatisé fiable sur ce fichier actuellement.

## Références

- BUG-048 (origine de la garde `readyForSale='Yes'` sur `itemRefsForMenuItem`, dont ce bug est un
  effet de bord non traité au moment du fix).
- BUG-050 (`resolveUnitsPerPackForItemKey`, chemin distinct — `createMovement` — même famille de
  résolution par nom, cause différente).
- Fiches miroir web : BUG-347-02 (même principe "résoudre par ID quand l'ID est connu, borné aux
  éléments réellement utilisés"), BUG-348-02 (symptôme visuel initial ayant déclenché ce balayage
  backend).

Ulrich
