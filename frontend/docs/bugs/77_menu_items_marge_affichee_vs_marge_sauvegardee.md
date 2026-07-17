# BUG-077 — La marge affichée par groupe de prix ne correspond pas à la marge sauvegardée en base

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:915-919,1021-1025,1152-1153`

## Symptôme

Chaque carte de prix affiche sa propre marge (`getGroupMargin(group.price)`, basée sur le prix
*réel* de ce groupe), mais le champ `margin` unique envoyé au backend est calculé à partir
d'`effectiveBasePrice`, qui est la **moyenne** de tous les prix TTC des groupes. Dès qu'il y a plus
d'un groupe de prix à des tarifs différents, aucune des marges affichées à l'écran ne correspond à
la valeur réellement stockée.

## Cause racine

```js
// effectiveBasePrice (computed) = moyenne des prix TTC de tous les groupes
// margin envoyé au backend = calculé à partir de effectiveBasePrice
// getGroupMargin(group.price) affiché par carte = calculé à partir du prix RÉEL du groupe
```

`MenuItem.basePrice`/`margin` est un champ unique au niveau article (`docs/modules/
04_MENU_CATALOGUE.md`), alors que le prix réel varie par espace via `SpaceMenuItem.priceTtc`. Le
modèle de données actuel ne permet pas de stocker une marge différente par groupe/espace.

## Correction

**Non corrigé** : deux options possibles, toutes deux nécessitant une décision produit —
(a) stocker une marge par groupe de prix côté backend (changement de modèle), ou (b) clarifier
explicitement dans l'UI que le champ marge global affiché ailleurs est une **moyenne**, pas la
marge d'un groupe spécifique. Un fix purement front qui masquerait la marge par carte donnerait une
information fausse dans l'autre sens — pas fait sans arbitrage.

## Risque de régression / à surveiller

Si l'option (a) est retenue : vérifier l'impact sur `MenuItemPriceHistory` et sur tout rapport qui
lit `MenuItem.margin` comme valeur unique (ex. `MenuItemRevenueDistribution.vue`).

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (SpaceMenuItem, champ `margin`).
