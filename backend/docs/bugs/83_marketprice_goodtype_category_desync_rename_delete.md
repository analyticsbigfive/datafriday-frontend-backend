# BUG-83 — `MarketPrice.goodType`/`category` (texte libre) jamais resynchronisés au rename/delete de `MarketPriceType`/`Category`

- **Statut** : 🔴 Ouvert
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

Reste à faire — deux options à trancher avec le produit avant d'implémenter :
1. Propager le rename dans une transaction (`updateType`/`updateCategory` mettent aussi à jour
   `MarketPrice.goodType`/`category` pour toutes les lignes dont `marketPriceTypeId`/
   `marketPriceCategoryId` correspond).
2. Ou faire de `goodType`/`category` des colonnes strictement dérivées en lecture (join sur la FK),
   supprimant la duplication texte — plus gros chantier, à évaluer au vu de l'usage de `goodType`
   comme discriminateur (`syncIngredients`/`syncPackagings`).

## Risque de régression / à surveiller

Ne pas casser `syncIngredients()`/`syncPackagings()` (`market-prices.service.ts:540-558`), qui
lisent `goodType` comme discriminateur fonctionnel — toute modification de ce champ doit rester
cohérente avec leur logique de matching.

## Références

- [`frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md`](../../../frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)
- [`frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md`](../../../frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md)
- [BUG-84](84_packingtype_desync_rename_delete_texte_libre.md) — même famille, cas encore plus grave (pas de FK du tout).
- [`frontend/docs/bugs/162_marketprice_selectedtype_category_resolu_par_nom.md`](../../../frontend/docs/bugs/162_marketprice_selectedtype_category_resolu_par_nom.md) — symptôme miroir côté frontend.
