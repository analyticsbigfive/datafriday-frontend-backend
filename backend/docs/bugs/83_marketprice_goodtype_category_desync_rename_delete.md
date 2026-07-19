# BUG-83 — `MarketPrice.goodType`/`category` (texte libre) jamais resynchronisés au rename/delete de `MarketPriceType`/`Category`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Configurations — Good Types/Categories)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `prisma/schema.prisma:800-843` (`MarketPrice.goodType`/`category` texte libre **et** `marketPriceTypeId`/`marketPriceCategoryId` FK réelles, `onDelete: SetNull`), `src/features/market-prices/market-price-taxonomy.service.ts:36-53` (`updateType`), `:125-170` (`updateCategory`), `:55-67`/`:172-184` (`deleteType`/`deleteCategory`)

## Symptôme

`MarketPrice` porte **à la fois** des FK réelles (`marketPriceTypeId`/`marketPriceCategoryId`) et
des colonnes texte libre en miroir (`goodType`/`category`), ce dernier étant le "discriminateur
fonctionnel" documenté dans `frontend/docs/modules/04_MENU_CATALOGUE.md:361` (pilote
`syncIngredients`/`syncPackagings`). Renommer un Good Type/Category ne met à jour **que** la
colonne `name` de la ligne taxonomie — aucune propagation vers `MarketPrice.goodType`/`category`
des lignes existantes, qui gardent l'ancien texte indéfiniment. Supprimer un Good Type/Category met
`NULL` sur la FK (`SetNull`) mais laisse le champ texte intact — celui-ci pointe alors vers une
valeur qui ne correspond plus à aucune entrée de taxonomie active ("étiquette fantôme").

## Cause racine

`updateType`/`updateCategory`/`deleteType`/`deleteCategory` ne touchent que la table taxonomie —
aucune requête de propagation vers `MarketPrice`. Même famille de bug que
[`62_component_taxonomie_fk_resolution_fragile_par_nom.md`](../../../frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)
et [`81_menu_items_fk_taxonomie_resolue_par_nom.md`](../../../frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md)
côté front (résolution par nom au lieu de FK au moment de la sauvegarde), mais ici côté backend et
sur l'axe update/delete plutôt que create.

## Correction

Option 1 retenue (propagation transactionnelle du rename) :

- `market-price-taxonomy.service.ts:75-112` (`updateType`) — quand `name` change réellement,
  `prisma.$transaction([...])` regroupe désormais `marketPriceType.update()` et
  `prisma.marketPrice.updateMany({ where: { marketPriceTypeId: id }, data: { goodType: name } })`,
  même style de transaction (tableau de promesses) que `EventsService.updateTeam`
  (`events.service.ts:636-646`).
- `market-price-taxonomy.service.ts:199-264` (`updateCategory`) — même principe :
  `prisma.marketPrice.updateMany({ where: { marketPriceCategoryId: id }, data: { category: name } })`
  dans la même transaction que `marketPriceCategory.update()`.

Le risque de désync côté suppression est désormais couvert par la garde de [BUG-82](82_suppression_marketpricetype_sans_garde_categories.md)
(impossible de supprimer un type/catégorie encore référencé par une ligne `MarketPrice`) — seule la
propagation du rename manquait encore, d'où ce correctif ciblé sur `updateType`/`updateCategory`
uniquement.

**Gap résiduel connu (non traité, non vérifié)** : d'éventuelles lignes `MarketPrice` historiques
portant un `goodType`/`category` texte mais une FK `marketPriceTypeId`/`marketPriceCategoryId` à
`NULL` ne seraient rafraîchies par aucun des deux correctifs (BUG-82 ni celui-ci), puisque la
propagation et la garde de suppression s'appuient toutes deux sur la FK. Présence de telles lignes
non vérifiée lors de cette session.

## Risque de régression / à surveiller

Revue de code uniquement dans cette session (pas de `pnpm dev` lancé) — validation manuelle requise,
en particulier :
- Ne pas casser `syncIngredients()`/`syncPackagings()` (`market-prices.service.ts:540-558`), qui
  lisent `goodType` comme discriminateur fonctionnel — toute modification de ce champ doit rester
  cohérente avec leur logique de matching.
- Tester la propagation transactionnelle (`updateType`/`updateCategory`) sur un tenant ayant un
  nombre non trivial de lignes `MarketPrice` avant mise en production, pour valider le comportement
  et le temps de réponse du `updateMany` en masse dans la transaction.

## Références

- [`frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md`](../../../frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)
- [`frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md`](../../../frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md)
- [BUG-84](84_packingtype_desync_rename_delete_texte_libre.md) — même famille, cas encore plus grave (pas de FK du tout).
- [`frontend/docs/bugs/162_marketprice_selectedtype_category_resolu_par_nom.md`](../../../frontend/docs/bugs/162_marketprice_selectedtype_category_resolu_par_nom.md) — symptôme miroir côté frontend.
