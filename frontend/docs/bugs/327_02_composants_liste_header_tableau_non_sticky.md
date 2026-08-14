# BUG-327-02 — Composants : header du tableau (colonnes) non sticky au scroll

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/components/menu-fb/views/component-library/views/componentListView.vue`

## Symptôme

Signalé par l'utilisateur (captures à l'appui) : sur la page "Components Library", le bandeau rouge
(`.cl-header--sticky`) et la barre de recherche/filtres (`.cl-searchbar--sticky`) restent bien
visibles en scrollant, mais la ligne d'en-tête du tableau (COMPONENT NAME / CATEGORY / TYPE / UNIT /
...) disparaît dès qu'on scrolle vers le bas — on ne sait plus à quoi correspond chaque colonne au
milieu de la liste.

## Cause racine

`.cl-table :deep(.v-data-table__th)` n'avait aucun `position: sticky` — seuls le bandeau et la barre
de recherche l'avaient (`top: 0` et `top: 81px` respectivement), pas les cellules d'en-tête du
`v-data-table`.

## Correction

**Tentative 1 (ratée, revertie)** : `position: sticky; top: 141px;` posé directement sur
`.cl-table :deep(.v-data-table__th)`. A cassé le rendu du tableau (header affiché après les lignes de
données au lieu d'avant, ligne vide en tête) — cause : `.v-table__wrapper` (CSS interne Vuetify) a
déjà `overflow: auto` par défaut, ce qui en fait le contexte de positionnement `sticky` le plus
proche (au lieu du scroll de la page) ; sans hauteur bornée sur ce wrapper, le calcul de position
`sticky` devient incohérent. Reverté immédiatement après retour utilisateur (capture à l'appui).

**Tentative 2 (mécanisme officiel Vuetify)** : ajout des props `fixed-header` et
`height="calc(100vh - 200px)"` sur le `<v-data-table>`. C'est l'implémentation supportée par
Vuetify lui-même (`VTable.css` : `.v-table--fixed-header > .v-table__wrapper > table > thead {
position: sticky; top: 0; z-index: 2; }`), qui ne fonctionne QUE si le tableau a une hauteur bornée
(sinon `.v-table__wrapper` grandit pour contenir tout le contenu et ne scrolle jamais lui-même). Le
tableau devient sa propre zone scrollable indépendante (au lieu de scroller avec toute la page) ;
`calc(100vh - 200px)` est une estimation (80px bandeau + 60px searchbar + ~48px padding
`.cl-content`, arrondi) — pas de recalcul dynamique.

## Risque de régression / à surveiller

**`calc(100vh - 200px)` non vérifié visuellement** — contrairement à la tentative 1, un écart de
quelques pixels ici ne devrait dégrader que la densité d'affichage (tableau un peu trop court/haut),
pas casser le rendu, car le mécanisme de stickiness lui-même est celui, testé, de Vuetify — mais à
confirmer quand même. Si un layout de page englobant (app bar globale au-dessus de cette page)
réserve déjà de l'espace non compté dans `100vh`, la valeur peut nécessiter un ajustement. Le
bandeau/la searchbar restent `position: sticky` par CSS custom (page-level) — désormais
probablement des no-op inoffensifs puisque la page elle-même ne devrait plus avoir besoin de
scroller (le tableau scrolle maintenant en interne), sauf si le contenu total dépasse légèrement
`100vh`.

## Références

- Aucune.
