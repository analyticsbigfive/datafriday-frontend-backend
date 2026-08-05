# BUG-267-01 — Menu item : stepper quantité au pas de 1 et coûts arrondis à « 0 € »

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-02
- **Fichiers** : `MenuItemCreateView.vue:95-124,146-160,466-474`, `useFormatters.js:6`

## Symptôme

Sur `/menu-fb/menu-items/edit/:id` (« Modifier le menu item »), tableau « Composants &
Ingrédients », deux problèmes distincts sur le même écran :

1. **Colonne QUANTITÉ** — le stepper `− [ 0,04 ] +` incrémente **par pas de 1**. Sur des
   ingrédients saisis au kg (0,04 kg de salade iceberg, 0,12 kg de viande hachée, 0,01 kg de
   pickles), un seul clic fait passer 0,04 → 1,04, soit 26× la quantité réelle. Les boutons sont
   donc inutilisables sur la majorité des lignes d'une recette, et dangereux : un clic accidentel
   fausse le coût de revient sans que rien ne l'indique.

2. **Colonnes COÛT UNITAIRE / COÛT TOTAL et bloc de résumé** — tous les montants sont arrondis à
   l'entier. Sur la recette « Burger 25/26 (Aux) » : Salade Iceberg à 0,04 € → « 0 € », Cheddar →
   « 0 € », Pickles → « 0 € », Sauce burger → « 0 € », et « Coût total : 2 € » pour 2,15 €. Quatre
   composants sur sept affichent « 0 € » sur un écran dont **la finalité même est le calcul du
   coût de revient** : l'information affichée n'a plus aucune valeur décisionnelle.

## Cause racine

1. Pas codé en dur à `1` dans les deux handlers inline du stepper, alors que l'`<input>` voisin
   déclare pourtant `step="0.001"` :
   ```
   MenuItemCreateView.vue:100  @click="item.quantity = Math.max(0, +((+item.quantity || 0) - 1).toFixed(3))"
   MenuItemCreateView.vue:113  @click="item.quantity = +((+item.quantity || 0) + 1).toFixed(3)"
   ```
   Aucune méthode nommée : l'arithmétique était directement dans le template, ce qui explique
   qu'elle n'ait jamais été relue.

2. `useFormatters.js:6` — `formatCurrency(value, currency, locale, digits = 0)`. Le défaut à
   0 décimale vient de la « Décision UI 2026-07-12 : tous les prix affichés SANS décimales ». Cet
   arrondi est pertinent sur les écrans d'analyse (CA, revenus, agrégats), mais pas sur des coûts
   unitaires d'ingrédients qui sont structurellement < 1 €. BUG-101, qui avait justement remplacé
   les implémentations locales de cette page par le helper partagé, avait anticipé le cas mot pour
   mot dans sa section « Risque de régression ».

## Correction

Branche `feat/debugMenuItems`.

1. **Stepper** — les deux `<button class="mic-qty-btn">` sont supprimés ; seul l'`<input
   type="number" step="0.001">` subsiste, dans son wrapper `.mic-qty-stepper` (conservé pour la
   bordure et l'alignement vertical des cellules). Le clamp `@change`
   (`Math.max(0, +(+item.quantity || 0).toFixed(3))`) est inchangé. CSS mort retiré :
   `.mic-qty-btn`, `.mic-qty-btn:hover`, `.mic--dark .mic-qty-btn(:hover)` ; `.mic-qty-input` perd
   ses `border-left`/`border-right` (qui doublaient désormais la bordure du wrapper) et passe de
   48 à 72 px de large pour rester lisible sur 3 décimales.

2. **Décimales** — nouveau helper partagé `formatCostCurrency` dans
   `useFormatters.js`, qui délègue à `formatCurrency(value, currency, locale, 2)` (le 4ᵉ paramètre
   `digits` existait déjà). Aucune `Intl.NumberFormat` réimplémentée, aucun défaut global modifié :
   `formatCurrency` et `formatCurrencyDetailed` restent à 0 décimale pour leurs ~30 consommateurs.
   `MenuItemCreateView.vue` bascule ses **7** sites d'appel sur le nouveau helper — colonnes COÛT
   UNITAIRE et COÛT TOTAL, résumé (« Coût total », « Coût par pièce ») et panneau de droite
   (HT, TVA, Coût). Le prix de vente de ce panneau utilisait déjà `.toFixed(2)` : la page devient
   homogène.

C'est l'« exception explicitement documentée » que réclamait BUG-101 plutôt qu'un retour
silencieux à une implémentation locale. Le commentaire d'en-tête de `formatCostCurrency` renvoie
ici, et la règle est consignée dans `docs/modules/04_MENU_CATALOGUE.md`.

## Risque de régression / à surveiller

- **Le clamp `@change` est désormais le seul garde-fou** contre une quantité négative ou non
  numérique : les boutons ne peuvent plus « rattraper » une saisie invalide. Tester `-3`, `abc`
  et un champ vidé puis blur.
- Vérifier qu'**aucun autre écran** n'a basculé à 2 décimales : seul `MenuItemCreateView.vue`
  change de helper. Contrôler `/menu-fb/analyse`, `/menu-fb/space-menus` et l'inventaire, qui
  doivent rester à 0 décimale.
- Ne **pas** « ré-uniformiser » cette page à `formatCurrency` lors d'un futur passage de
  cohérence : l'écart est intentionnel. C'est précisément pour ça qu'il est écrit ici et dans la
  page module.
- La page sœur `/menu-fb/components` (`ComponentCreateView.vue:648-652`) affiche toujours 2
  décimales via un `toLocaleString` local — voir BUG-060 ; elle pourrait maintenant consommer
  `formatCostCurrency` au lieu de sa réimplémentation.
- Aucun test unitaire ne couvre ce fichier ; `pnpm test:unit` sert seulement de garde-fou contre
  une régression d'import sur `useFormatters.js`.

## Références

- [[101_menu_items_formatcurrency_incoherent_multi_fichiers]] — même page, même helper ; sa section
  « Risque de régression » décrivait exactement ce symptôme par anticipation.
- [[60_component_formatcurrency_incoherent_3_implementations]] — même classe de dette sur
  `/components`, candidat naturel à `formatCostCurrency`.
- [[78_menu_items_validations_numeriques_manquantes]] — validations numériques de cet écran.
- `docs/modules/04_MENU_CATALOGUE.md` § « MenuItem — l'article vendable ».
