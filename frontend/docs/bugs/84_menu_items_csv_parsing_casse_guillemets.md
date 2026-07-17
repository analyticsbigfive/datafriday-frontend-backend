# BUG-084 — Import CSV MenuItem : parsing cassé sur champ entre guillemets contenant un saut de ligne

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue:276-298`

## Symptôme

Un champ `description` ou `name` contenant un retour à la ligne à l'intérieur de guillemets (cas
fréquent en export Excel/Google Sheets) coupe la ligne CSV en deux lignes distinctes, désalignant
toutes les colonnes suivantes pour cette ligne et la suivante. Un guillemet échappé (`""`) à
l'intérieur d'un champ casse aussi le parsing (bascule incorrecte de l'état `inQ`).

## Cause racine

`parseCsv` découpe le texte entier en lignes AVANT tout parsing quote-aware
(`const lines = text.split(/\r?\n/).filter(l => l.trim())`), et `parseCsvLine` ne gère pas
l'échappement `""`. Le fichier jumeau `RecipeImportDrawer.vue` (avant son propre fix, voir
[[93_menu_items_recipeimportdrawer_parseur_virgule_uniquement]]) illustre le tokenizer correct :
parser sur le texte brut complet (pas pré-splitté par `\n`), avec gestion de `""`.

## Correction

`parseCsv`/`parseCsvLine` réécrits en tokenizer caractère par caractère sur le texte brut complet
(pas de split préalable par ligne), avec gestion de l'échappement `""` à l'intérieur d'un champ
entre guillemets — même approche que celle portée dans `RecipeImportDrawer.vue`.

## Risque de régression / à surveiller

Tester avec un CSV réel exporté depuis Google Sheets/Excel contenant une description multi-lignes
et un guillemet échappé, avant et après le fix, pour confirmer l'alignement des colonnes.

## Références

- [[93_menu_items_recipeimportdrawer_parseur_virgule_uniquement]]
