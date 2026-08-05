# BUG-297-01 — Réarmement : repli du panneau gauche casse la grille + colonnes non scrollables

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock (écran Réarmement)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-04
- **Fichiers** : `src/views/SpaceRestockView.vue` (CSS uniquement)

## Symptôme

Sur l'écran Réarmement (desktop > 1100px) :

1. Cliquer sur le chevron du header (`WorkspacePanelToggle`, replie le panneau de
   filtres gauche) casse la mise en page : le contenu principal (bandeau rouge +
   wizard + liste « Items to stock ») se retrouve écrasé dans une colonne étroite
   de 292px à gauche, le panneau Fournisseurs occupe la grande colonne du milieu,
   et une large zone vide reste à droite.
2. La colonne de gauche (et en réalité chaque colonne) ne scrolle pas : la liste
   des items est coupée en bas de l'écran, impossible d'atteindre la suite.

## Cause racine

Deux trous dans le CSS de la grille `.sr-body` (`SpaceRestockView.vue`) :

1. **Repli** : le template pose `sr-body--no-aside` quand `showFilters` est faux
   (ligne ~30), mais seules les combinaisons avec `sr-body--no-suppliers`
   avaient une règle `grid-template-columns` — et `sr-body--no-suppliers` n'est
   **jamais posée** dans le template (l'aside Fournisseurs est toujours rendu) :
   règles mortes. `--no-aside` seul retombait donc sur la grille 3 colonnes
   `292px minmax(0, 1fr) 340px` avec seulement 2 enfants : `.sr-main` tombait
   dans la track de 292px, `.sr-suppliers` dans la track centrale, track droite
   vide. Pattern déjà géré correctement côté Logistique
   (`SpaceLogisticView.vue` : `.lg-layout--no-aside { grid-template-columns: 1fr 280px; }`).
2. **Scroll** : le modèle « chaque colonne scrolle » (`.sr-body > *` :
   `max-height: 100%; overflow-y: auto`) suppose une hauteur de ligne bornée. Or
   `.sr-body` ne définissait pas `grid-template-rows` : la ligne implicite `auto`
   se dimensionne au contenu, `max-height: 100%` (relatif à la zone de grille,
   elle-même dimensionnée au contenu) ne borne rien, et le `overflow: hidden` de
   `.sr-body` coupe simplement le bas — aucun scrollbar nulle part.

## Correction

CSS uniquement, dans `SpaceRestockView.vue` :

- `.sr-body.sr-body--no-aside { grid-template-columns: minmax(0, 1fr) 340px; }`
  — le centre récupère la track de gauche quand le panneau est replié.
- `grid-template-rows: minmax(0, 1fr)` ajouté au bloc `.sr-body, .sr-skeleton`
  (fin de feuille, modèle hauteur bornée) — la ligne unique prend exactement la
  hauteur du conteneur, le scroll indépendant par colonne redevient effectif.
- `grid-template-rows: none` dans la media query `@media (max-width: 1100px)` de
  fin de feuille (colonnes empilées, scroll rendu à la page) pour ne pas borner
  la première ligne empilée à la hauteur du viewport.

## Risque de régression / à surveiller

- Repli/dépli du panneau via le chevron : 3 colonnes ↔ 2 colonnes, Fournisseurs
  reste à droite (340px) dans les deux états.
- Scroll indépendant des 3 colonnes avec une longue liste d'items (44+).
- < 1100px : colonnes empilées, scroll page normal (ni double scrollbar, ni
  colonne bornée au viewport).
- Squelette de chargement (`.sr-skeleton`) partage les mêmes règles — vérifier
  qu'il s'affiche toujours correctement.

## Références

- Pattern de référence : `SpaceLogisticView.vue:1291` (`.lg-layout--no-aside`).
- Modèle hauteur bornée / scroll par colonne : commentaire « Layout identique à
  MarketPriceListView » en fin de feuille de `SpaceRestockView.vue`.

---
JLH
