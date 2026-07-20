# BUG-170 — Suppression bloquée (BUG-79/81/82) sans moyen de retrouver les lignes dépendantes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (UX bloquante)
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web` + `api-datafriday-staging`
- **Découvert le** : 2026-07-19 (retour utilisateur en test live, le jour même de l'audit Configurations)
- **Fichiers** :
  - Backend : `src/features/menu-items/menu-items.service.ts` (`deleteProductType`/`deleteProductCategory`), `src/features/menu-components/component-taxonomy.service.ts` (`deleteType`/`deleteCategory`), `src/features/market-prices/market-price-taxonomy.service.ts` (`deleteType`/`deleteCategory`)
  - Frontend : `src/components/products/dialogs/ProductDeleteDialog.vue` (dialog partagée par les 6 écrans), `src/components/products/views/{ProductTypeList,ProductCategoryList}.vue`, `src/components/menu-fb/views/component-library/views/{ComponentTypeList,ComponentCategoryList}.vue`, `src/components/market-prices/views/{MarketPriceTypeList,MarketPriceCategoryList}.vue`, `src/components/menu-fb/views/menu-items/views/MenuItemView.vue`, `src/components/menu-fb/views/component-library/views/componentListView.vue`, `src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue`

## Symptôme

Retour utilisateur direct pendant les tests de BUG-79 : "je peux pas supprimer [un Product Type],
[...] j'ai supprimé la category, mais comment je peux trouver le bon menu item lié s'il y a des
milliers ? 3 endroits différents pour enfin pouvoir supprimer." Les gardes de suppression ajoutées
par BUG-79/81/82 (bloquer si des `ProductCategory`/`ComponentCategory`/`MarketPriceCategory` ou des
`MenuItem`/`MenuComponent`/`MarketPrice` dépendent encore de l'entité) sont correctes sur le fond —
mais le message d'erreur se contentait d'un compte ("N article(s) de menu en dépendent encore"),
sans aucun moyen de naviguer vers les lignes concernées. Avec des centaines/milliers de lignes dans
l'écran cible, l'utilisateur n'avait aucun moyen pratique de les retrouver pour les réassigner —
la garde de protection, correcte en soi, devenait un mur sans porte.

## Cause racine

Les `ConflictException` levées par les 6 méthodes de suppression ne contenaient qu'un `message`
texte libre — aucune donnée structurée exploitable par le front pour proposer une action de suivi.

## Correction

**Backend** : les 6 `ConflictException` (levées quand le blocage vient de la dépendance "feuille" —
`MenuItem`/`MenuComponent`/`MarketPrice`, pas du blocage "a encore des catégories enfants" qui reste
un message texte simple) portent désormais un payload structuré en plus du message :
```
{ message, blockedBy: 'menuItems'|'menuComponents'|'marketPrices', count, filterField: 'type'|'category', filterValue: <name> }
```
`filterValue` est le nom (pas l'id) de l'entité qu'on tente de supprimer, pour correspondre au
filtre par nom déjà utilisé par les écrans cibles. Le blocage combiné "catégories ET marketPrices"
de `MarketPriceTaxonomyService.deleteType` a été scindé en deux vérifications séquentielles (comme
les 5 autres méthodes) pour que chaque cause de blocage ait son propre message/payload précis.

**Frontend** :
- `ProductDeleteDialog.vue` (dialog partagée par les 6 écrans de taxonomie) accepte une nouvelle
  prop `actionLink` (`{label, to}`), rendue comme lien cliquable sous le message d'erreur.
- Les 6 écrans (`confirmDelete`) détectent `e.response.data.blockedBy` et, quand présent,
  construisent `deleteActionLink` avec un lien vers l'écran cible déjà filtré :
  ProductType/Category → `/menu-items?type=|category=<name>` ; ComponentType/Category →
  `/components?type=|category=<name>` ; MarketPriceType/Category →
  `/market-prices?type=|category=<name>`. Le matching par substring fragile
  (`msg.includes('linked')`/`'used'`/`'in use'`) est retiré au passage — trop large, il pouvait
  classer à tort une vraie erreur serveur comme "bloqué par des catégories".
- `MenuItemView.vue`, `componentListView.vue`, `MarketPriceListView.vue` lisent désormais
  `$route.query.type`/`$route.query.category` au montage pour préremplir leur filtre existant
  (`typeFilter`/`categoryFilter` ou `selectedType`/`selectedCategory` selon l'écran — tous déjà
  des filtres par nom, aucune nouvelle mécanique de filtrage introduite).
- 12 nouvelles clés i18n (`xxxList.viewLinkedItems`, en/fr) ajoutées à `translations.js`, une par
  écran, réutilisant le namespace déjà établi par BUG-166.

## Risque de régression / à surveiller

Non testé en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement dès que
possible, en particulier :
- Déclencher un blocage réel (type/catégorie encore référencé) sur les 6 écrans et vérifier que le
  lien "Voir les N ... concernés" navigue bien vers l'écran cible avec le filtre déjà appliqué.
- Vérifier que le filtre par nom reste fiable si deux entités taxonomiques différentes partagent le
  même nom (edge case déjà connu, non spécifique à ce fix — cf. BUG-62/81/162).
- Confirmer que retirer les branches `'linked'`/`'used'`/`'in use'` du matching de secours ne fait
  pas regresser un cas d'erreur backend existant qui dépendait de ce matching large (le seul cas
  légitime restant, "cannot delete global ..."/"categor...", est conservé).

## Références

- [BUG-79](../../../backend/docs/bugs/79_suppression_producttype_category_sans_garde_dependances.md), [BUG-81](../../../backend/docs/bugs/81_suppression_componenttype_category_sans_garde_dependances.md), [BUG-82](../../../backend/docs/bugs/82_suppression_marketpricetype_sans_garde_categories.md) — les gardes que ce fix rend utilisables en pratique.
- Retour utilisateur direct en session de test live, 2026-07-19.
