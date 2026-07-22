# BUG-030 — margin-analysis gonfle la marge affichée quand des produits ne sont pas mappés

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Modéré — métrique trompeuse sans avertissement fort
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-20
- **Fichiers** : `weezevent-analytics.controller.ts:208-266`

## Symptôme

La marge affichée par `margin-analysis` est artificiellement élevée quand des produits vendus ne
sont pas mappés à un MenuItem.

## Cause racine

La vente est comptée dans le chiffre d'affaires, mais le coût du produit non mappé (sans MenuItem
associé, donc sans coût connu) est exclu du calcul — la marge s'en trouve mécaniquement gonflée.
Seul `mappingRate` signale indirectement le problème, sans avertissement explicite sur la fiabilité
de la marge elle-même.

## Correction

Fix minimal retenu (pas de refactor de calcul — corriger le calcul lui-même supposerait de savoir
quoi faire du coût d'un produit non mappé, une décision produit non tranchée) : ajout d'un champ
`summary.marginWarning` (string | null) dans la réponse, non-null dès que `unmappedItems > 0`
(pas seulement quand `mappingRate` est "bas" — un seul item non mappé suffit à fausser mécaniquement
la marge, donc l'avertissement doit apparaître dès le premier cas, pas à partir d'un seuil arbitraire).
Le message indique explicitement le nombre de lignes non mappées et le taux de mapping actuel.
`mappingRate` (déjà existant) inchangé, juste extrait dans une variable pour éviter de dupliquer le
calcul.

## Risque de régression / à surveiller

- Le front (`margin-analysis` / analyse de marge) n'affiche pas encore ce nouveau champ — à
  brancher côté UI pour que l'avertissement soit réellement visible (pas seulement dans la réponse
  API). Non fait dans cette session (hors périmètre backend).
- La marge elle-même reste surestimée (le fix n'ajoute qu'un avertissement, ne corrige pas le
  calcul) — décision produit à prendre séparément sur ce qu'il faut faire d'un item non mappé
  (l'exclure du CA aussi ? estimer un coût par défaut ?).

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #6
