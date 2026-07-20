# BUG-84 — `PackingType` (texte libre, sans FK) jamais resynchronisé au rename/delete

- **Statut** : 🟢 Corrigé
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

Option 1 (« a minima ») implémentée :

- `packing-types.service.ts:53-99` (`update`) — capture `oldName` (`item.name`) avant l'update ;
  quand le nom trimé change réellement, `prisma.$transaction([...])` regroupe
  `packingType.update()` avec trois `updateMany` scopés `tenantId` : `marketPrice.purchasePackaging`,
  `marketPrice.inventoryPackaging`, et `menuComponent.inventoryPackaging` (tous `where: { ...Packaging: oldName, tenantId }`).
- `packing-types.service.ts:101-121` (`remove`) — bloque désormais la suppression (`ConflictException`,
  même pattern que [BUG-82](82_suppression_marketpricetype_sans_garde_categories.md)) si un
  `count()` sur l'un des 3 champs (`marketPrice.purchasePackaging`, `marketPrice.inventoryPackaging`,
  `menuComponent.inventoryPackaging`) égal au nom du `PackingType`, scopé tenant, est > 0.

L'option structurelle (promotion en FK réelle) reste hors périmètre — non nécessaire une fois la
propagation/garde en place, cohérent avec la note de BUG-83 sur ce même chantier.

## Risque de régression / à surveiller

Revue de code uniquement dans cette session (pas de `pnpm dev` lancé) — validation manuelle requise.
La propagation étant transactionnelle mais potentiellement lourde (3 `updateMany` en plus du rename),
elle doit être testée sur un tenant ayant un nombre non trivial de lignes `MarketPrice`/
`MenuComponent` avant mise en production, pour valider le comportement et le temps de réponse.

## Références

- [`frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md`](../../../frontend/docs/bugs/62_component_taxonomie_fk_resolution_fragile_par_nom.md)
- [`frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md`](../../../frontend/docs/bugs/81_menu_items_fk_taxonomie_resolue_par_nom.md)
- [BUG-83](83_marketprice_goodtype_category_desync_rename_delete.md) — même famille, cas légèrement moins grave (une FK de secours existe encore côté MarketPrice.goodType/category).
