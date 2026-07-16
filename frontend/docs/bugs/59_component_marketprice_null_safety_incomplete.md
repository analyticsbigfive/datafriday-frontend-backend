# BUG-059 — Null-safety incomplète sur `ingredient.marketPrice` (ingrédient sans fournisseur lié)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (chemin d'erreur systématique absorbé silencieusement, pas de crash visible)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/componentListView.vue` (`loadSubItemsData`)

## Symptôme

Dans le tiroir "sub-items" de `/components` (liste des ingrédients/sous-composants d'un composant),
afficher un composant contenant un ingrédient saisi manuellement (sans `MarketPrice` lié — cas
explicitement supporté par le modèle, `Ingredient.marketPriceId` est nullable) déclenchait une
exception systématique, absorbée par le `catch` : la ligne retombait sur les données brutes, mais un
log d'erreur trompeur ("Error fetching ingredient...") apparaissait en console à chaque affichage,
alors qu'aucune requête n'avait réellement échoué.

## Cause racine

`ingredientDetails?.marketPrice.supplierItem` protège l'accès à `ingredientDetails` (`?.`) mais pas à
`.marketPrice` lui-même : si `ingredientDetails.marketPrice` est `null` (ingrédient sans
`marketPriceId`, cas documenté dans `docs/modules/04_MENU_CATALOGUE.md`), `.supplierItem` sur `null`
lève une `TypeError`, capturée par le `catch` englobant qui journalise l'erreur et retombe sur un
fallback — masquant qu'il ne s'agissait pas d'un vrai échec réseau/API.

## Correction

`ingredientDetails?.marketPrice.supplierItem` → `ingredientDetails?.marketPrice?.supplierItem`
(chaînage optionnel complet). Le `console.log("Log ingredient data:", ...)` de debug et le
`console.log("Nous avons une erreur:", ...)` redondant avec le `console.error` juste en dessous ont
été retirés au passage (voir [[65_component_logs_debug_laisses_en_production]]).

## Risque de régression / à surveiller

Ouvrir le tiroir sub-items d'un composant contenant un ingrédient sans fournisseur lié, confirmer
qu'aucune erreur n'apparaît en console et que la ligne s'affiche normalement (nom de repli affiché
si `supplierItem` est absent).

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"Ingredient / Packaging — les composants d'achat" (`marketPriceId` nullable).
- [[65_component_logs_debug_laisses_en_production]]
