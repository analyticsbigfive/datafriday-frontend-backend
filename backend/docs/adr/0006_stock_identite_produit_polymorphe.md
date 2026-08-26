# ADR-0006 — Adopter une identité produit polymorphe `(itemKind, itemRefId)` pour le domaine Stock

- **Statut** : Accepté
- **Date** : 2026-08-26
- **Domaine** : Stock / Logistic / Inventaire / Réarmement

## Contexte

`StockLevel`, `StockMovement` et `StockTransferLoss` identifient une ligne de stock par `itemKey`
(String) : le NOM du référentiel d'inventaire, sans FK réelle (`itemName` d'un `MarketPrice`, ou
nom d'un `Ingredient`/`Packaging`/`MenuComponent`/`MenuItem`). C'est documenté comme "Piège n°1" du
domaine (`frontend/docs/modules/06_STOCK_INVENTAIRE.md`) : un renommage d'entité côté catalogue
casse silencieusement le rapprochement avec le stock déjà suivi sous l'ancien nom, et deux articles
homonymes (aucun des 5 référentiels produit n'a de contrainte d'unicité sur son nom, cf. audit
2026-08-26) fusionnent silencieusement dans les vues agrégées.

Côté Inventaire/Réarmement/Stock-up, une convergence partielle a eu lieu début août 2026
(BUG-288-01, BUG-292-01, BUG-299-01) vers une identité "l'id prime, le nom est un repli"
(`componentIngredientId` : `marketPriceId → sourceId → id`) — jamais formalisée en ADR, jamais
étendue à Logistic, et elle-même fragilisée par un bug de propagation (`menuItemNormalize.js`,
corrigé le 2026-08-26) qui faisait perdre `marketPriceId` en route.

Un audit complet (session 2026-08-26, cf. fiche de chantier associée) confirme qu'aucun identifiant
unique n'existe : un article peut légitimement être la vérité de l'une de 5 tables différentes
(`MarketPrice`, `Ingredient`, `Packaging`, `MenuItem`, `MenuComponent`), aucune n'étant elle-même
unique sur son nom, et aucune ne référençant les autres de façon systématique.

**Alternative sérieusement envisagée et écartée** : créer une nouvelle table `CatalogItem`/`Product`
canonique unique, avec migration de `Ingredient`/`Packaging`/`MenuItem`/`MenuComponent` pour tous y
référencer une entrée. Écartée pour ce chantier car elle exige de restructurer le domaine recette/
catalogue entier (Menu Items, Ingredients, Packagings, Components) avant même de pouvoir toucher au
Stock — un chantier bien plus large, sans bénéfice supplémentaire pour le problème actuel (le
référentiel `itemRefsForMenuItem` calcule déjà, à la volée, un id stable et correct par kind ; il
manque seulement un endroit où le persister comme clé).

## Décision

`StockLevel`, `StockMovement` et `StockTransferLoss` gagnent deux colonnes additives et nullables :
`itemKind` (`'marketPrice' | 'ingredient' | 'packaging' | 'menuItem' | 'menuComponent'`) et
`itemRefId` (l'id réel dans la table correspondante). Cette paire remplace progressivement `itemKey`
comme clé de jointure/lecture, `itemKey` restant en place indéfiniment comme libellé d'affichage et
filet de sécurité pour les lignes non (encore) résolues. Migration en double-écriture puis
double-lecture (voir la fiche de chantier), jamais de bascule brutale.

## Conséquences

- Permet enfin : renommer un article côté catalogue sans casser son suivi de stock ; distinguer deux
  articles homonymes au lieu de les fusionner silencieusement dans les vues agrégées.
- N'unifie PAS l'identité produit à travers tout le domaine recette (Réarmement mode "ingrédients",
  Event Predict, feuille de course) dans l'immédiat — seul Logistic est couvert par ce chantier. Les
  autres modules gardent leurs propres chaînes de résolution (`bomPlanning.js`, `stockNetting.js`)
  tant qu'un chantier dédié ne les aligne pas sur cette même paire.
- La contrainte unique `StockLevel.uniq_stock_level` reste bâtie sur `itemKey` (texte) tant que la
  phase de bascule des lectures n'est pas stabilisée en prod — ne pas la retirer prématurément.
- L'historique déjà écrit en JSON (`StockReconciliation.lines`, `InventorySnapshot.inventoryCounts`,
  `RestockPlan.recipeCoeffs`) reste au format `itemKey`=nom pour toujours ; aucune tentative de le
  réécrire rétroactivement.
- Un futur chantier peut étendre cette même paire `(itemKind, itemRefId)` aux autres modules du
  domaine Stock (Réarmement, Event Predict) plutôt que de réinventer une convention — c'est le
  candidat naturel si l'unification est un jour élargie au-delà de Logistic.

## Références

- Audit complet et plan de chantier : `frontend/docs/chantiers/377_logistic_identite_produit_stable/PLAN.md`
- `frontend/docs/modules/06_STOCK_INVENTAIRE.md` (Piège n°1)
- `frontend/docs/QUESTIONS_A_BERTRAND.md` Q39 (question ouverte adjacente, taille de paquet)
- Fiches : BUG-032, BUG-033, BUG-049, BUG-239, BUG-260-02, BUG-288-01, BUG-291-01, BUG-292-01,
  BUG-299-01, BUG-352-01
