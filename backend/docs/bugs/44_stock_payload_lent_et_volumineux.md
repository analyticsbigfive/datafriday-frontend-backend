# BUG-044 — `GET /logistics/:spaceId/stock` lent et volumineux (jusqu'à ~180 Mo / 52s)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (page Logistic quasi inutilisable sur les espaces à catalogue riche)
- **Domaine** : Stock (Logistics)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `logistics.service.ts` (`itemRefsForMenuItem`, `componentRefsForComponent`,
  `aggregateItems`)

## Symptôme

Sur `/spaces/:spaceId/logistic`, l'appel `GET /logistics/:spaceId/stock` prenait ~52s et pesait
~180 273 Ko dans un cas observé, donnant l'impression d'un téléchargement infini côté front (onglet
réseau : `stock` très long à charger, taille anormale par rapport aux autres appels de la même page
— `latest` ~2 Ko, `reconciliations` ~1,5 Ko).

## Cause racine

Deux problèmes cumulés dans la construction du référentiel de stock (`getSpaceElementsWithItems` →
`aggregateItems` → `itemRefsForMenuItem`/`componentRefsForComponent`) :

1. **Aucune mémoïsation** du dépliage de recette. `itemRefsForMenuItem`/`componentRefsForComponent`
   recalculaient l'intégralité de l'arbre recette (ingrédients, composants, combos imbriqués
   jusqu'à profondeur 4) à chaque référence à un menu item/composant, y compris pour un même item
   partagé par plusieurs plats ou plusieurs shops — contrairement à leur jumeau
   `perUnit`/`perUnitForComponent` (dans `explodeSalesToConsumption`, plus bas dans le même
   fichier) qui, lui, cache déjà par `${id}:${depth}`. Sur un catalogue à combos/composants
   imbriqués et partagés, le coût de recalcul explique le temps de réponse.
2. **`usedIn[].picture`** (un champ par menu item consommateur d'une denrée, répété à chaque
   élément — shop ou storage — qui porte cette denrée) n'était **jamais lu côté front** (vérifié :
   seul `.name`/`.menuItemName` est utilisé dans `usedInLabel()` de `SpaceLogisticView.vue` et dans
   `LogisticSimulateSaleDialog.vue`) — pur poids mort dupliqué à chaque référence.

## Correction

- Ajout d'un cache `Map<string, ItemRef[]>` (`RecipeCtx.itemRefsCache`/`componentRefsCache`, clé
  `${id}:${depth}`) dans `itemRefsForMenuItem` et `componentRefsForComponent`, même schéma que
  `perUnitCache`/`componentPerUnitCache`.
- Suppression du champ `picture` de `usedIn[]` (type `ElementItem.usedIn` et sites de construction
  dans `aggregateItems`).

Commit `6113dce` ("Refactor logistics service to optimize item and component reference caching").

## Risque de régression / à surveiller

- La mémoïsation suppose que le résultat de `itemRefsForMenuItem(item, ctx, depth)` /
  `componentRefsForComponent(comp, ctx, depth, visited)` ne dépend que de `(id, depth)` pour un
  `ctx` donné (fixe pour toute la durée d'un appel `getStock`) — `visited` ne sert qu'à couper les
  cycles, pas à faire varier le résultat final pour un `(id, depth)` donné. Si cette invariance est
  cassée un jour (ex. `visited` influence le résultat autrement qu'en cutoff), le cache deviendrait
  incorrect silencieusement.
- Revérifier la taille/temps de réponse sur l'espace qui a servi de repro
  (`cmovsjbiz01lzvwyn30wweqpf`) après déploiement.
- Ne pas réintroduire `picture` dans `usedIn[]` sans vérifier d'abord qu'un consommateur front en a
  réellement besoin.

## Références

- [BUG-045](45_unit_null_codee_en_dur_readyforsale_yes.md) — trouvé pendant le diagnostic du même
  écran, code adjacent mais cause indépendante.
