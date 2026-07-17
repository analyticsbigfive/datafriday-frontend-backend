# BUG-060 — `formatCurrency` : 3 implémentations incohérentes dans component-library

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (cosmétique)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/drawers/IngredientPickerDrawer.vue:387-390`

## Symptôme

Un même montant pouvait s'afficher différemment selon l'écran de la page `/components` :
`componentListView.vue`, `ComponentCreateView.vue` et `ComponentPickerDrawer.vue` affichaient
`"12,50 €"` (`toLocaleString('fr-FR', {style:'currency', currency:'EUR'})`), tandis que
`IngredientPickerDrawer.vue` affichait `"€12.50"` (`` `€${n.toFixed(2)}` `` codé en dur — virgule vs
point décimal, symbole avant vs après le montant).

## Cause racine

Chaque fichier réimplémente sa propre méthode `formatCurrency` (pas de fonction partagée dans ce
domaine) ; `IngredientPickerDrawer.vue` avait divergé avec un format différent des trois autres
fichiers du même dossier.

## Correction

`IngredientPickerDrawer.vue::formatCurrency` aligné sur l'implémentation des trois autres fichiers
(`toLocaleString('fr-FR', {style:'currency', currency:'EUR'})`). Pas de factorisation en util
partagé — chaque fichier du domaine duplique déjà ce petit helper, on garde ce pattern existant pour
un diff minimal ; seule l'implémentation divergente a été alignée.

## Risque de régression / à surveiller

Aucune vraie régionalisation ici (le format reste `fr-FR` codé en dur indépendamment du `locale` de
l'app) — cosmétique uniquement, cohérence visuelle entre écrans.

## Références

- [[61_component_i18n_contourne_localstorage_manuel_et_textes_en_dur]] — même famille de dette
  (localisation non branchée sur le vrai `locale` réactif).
