# BUG-84 — `PackingType` (texte libre, sans FK) jamais resynchronisé au rename/delete

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Configurations — Packing Types)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `prisma/schema.prisma:1829-1837` (`PackingType`, aucune relation — commentaire explicite du modèle), `:820-821` (`MarketPrice.purchasePackaging`/`inventoryPackaging`, `String`), `:1612` (`MenuComponent.inventoryPackaging`, `String`), `src/features/packing-types/packing-types.service.ts:34-50` (`update`), `:52-57` (`remove`)

## Symptôme

`PackingType` est **volontairement** un référentiel de texte libre, pas une FK (confirmé par le
commentaire du modèle et par `frontend/docs/modules/04_MENU_CATALOGUE.md:397-399`) : `MarketPrice.
purchasePackaging`/`inventoryPackaging` et `MenuComponent.inventoryPackaging` stockent directement
le **nom** du PackingType en chaîne. Renommer ou supprimer un PackingType depuis
`/packing-types` ne touche que la table `PackingType` elle-même — aucune requête ne met à jour les
lignes `MarketPrice`/`MenuComponent` qui portaient l'ancienne chaîne. Ces lignes gardent
indéfiniment un texte qui ne correspond plus à aucun PackingType actif ; à la prochaine édition, le
`<select>` de packaging affiche une valeur absente de sa propre liste d'options.

## Cause racine

`update()`/`remove()` dans `packing-types.service.ts` ne touchent que la ligne `PackingType`.
Contrairement à [BUG-83](83_marketprice_goodtype_category_desync_rename_delete.md) (`MarketPrice.
goodType`/`category`), il n'existe même pas de FK de secours ici — `PackingType` n'a **aucune**
relation Prisma. C'est donc un cas plus grave de la même famille que
[`62_component_taxonomie_fk_resolution_fragile_par_nom.md`](../../../frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)/
[`81_menu_items_fk_taxonomie_resolue_par_nom.md`](../../../frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md) :
là où ces bugs avaient un FK id à réutiliser pour corriger la résolution, ici il n'y a **aucun** id
auquel se raccrocher — un fix nécessite soit une propagation explicite du rename/delete, soit une
promotion de `PackingType` en vraie FK.

## Correction

Reste à faire — décision produit nécessaire avant d'implémenter (impact plus large qu'un simple
bugfix) :
1. Option a minima : propager le rename dans `MarketPrice.purchasePackaging`/`inventoryPackaging`
   et `MenuComponent.inventoryPackaging` via une requête de masse au moment du `update()`, et
   bloquer/avertir le `remove()` si des lignes utilisent encore ce nom.
2. Option structurelle : promouvoir `PackingType` en FK réelle sur les 3 champs concernés — chantier
   plus lourd (migration de données, tous les points de saisie/affichage packaging à retoucher).

## Risque de régression / à surveiller

Si option 1 retenue : la propagation doit être transactionnelle (rename de `PackingType` + mise à
jour de toutes les lignes `MarketPrice`/`MenuComponent` concernées dans la même transaction) pour
éviter un état intermédiaire incohérent.

## Références

- [`frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md`](../../../frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)
- [`frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md`](../../../frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md)
- [BUG-83](83_marketprice_goodtype_category_desync_rename_delete.md) — même famille, cas légèrement moins grave (une FK de secours existe encore côté MarketPrice.goodType/category).
