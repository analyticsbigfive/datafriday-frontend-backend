# BUG-085 — Import CSV MenuItem : succès partiel invisible, boucle sans try/catch par item

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue:449-483`

## Symptôme

Deux cas concrets constatés :
1. `totalCreated += res?.data?.count ?? res?.count ?? withoutRecipe.length` — si l'endpoint bulk
   répond sans champ `count` (mais avec des échecs partiels dans son propre payload), le code
   suppose que **100% des lignes ont réussi** (repli sur `withoutRecipe.length`).
2. La boucle `for (const item of withRecipe) { await createMenuItem(item) }` n'a **aucun
   try/catch par item** : si l'item n°3 sur 10 échoue, l'exception remonte au catch global,
   l'utilisateur voit "Import error" avec `importedCount` resté à `0`, alors que les items 1 et 2
   ont réellement été créés en base. Aucune information sur quelles lignes ont échoué.

## Cause racine

Absence de comptage individuel des échecs et de try/catch par item dans la boucle `withRecipe`.

## Correction

Chaque `createMenuItem` de la boucle `withRecipe` est désormais wrappé dans un try/catch local ;
`succeeded`/`failed` sont accumulés avec le détail des lignes en échec (nom + message d'erreur),
affiché à l'étape Résultat au lieu d'un simple total. Le repli `res?.count ?? withoutRecipe.length`
sur la branche bulk est retiré : si `count` est absent de la réponse, l'UI l'indique explicitement
plutôt que de supposer un succès total.

## Risque de régression / à surveiller

Vérifier avec un CSV contenant volontairement une ligne invalide au milieu d'un lot `withRecipe`
que les lignes valides avant et après sont bien créées, et que le détail des échecs affiché est
exploitable.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] (même pattern déjà
  traité sur `/market-prices`).
