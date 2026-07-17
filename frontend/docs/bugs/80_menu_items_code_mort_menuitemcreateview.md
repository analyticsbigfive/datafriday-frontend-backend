# BUG-080 — Volume important de code mort dans MenuItemCreateView.vue

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:704-706,739-745,845-914,954-989,1288-1290,2207,2862,2875-2933`

## Symptôme

Aucun impact utilisateur direct, mais un piège pour un futur lecteur/éditeur du fichier — plusieurs
blocs laissent croire à un comportement actif qui ne l'est pas.

## Cause racine

Vérifié par recherche d'occurrences (chaque symbole n'apparaît qu'à sa propre déclaration) :
- `spacesLoading`, `typesLoading`, `categoriesLoading` (data) : jamais lus ni jamais mis à
  `true`/`false` — état totalement inerte.
- `brandOptions`, `discountTypeOptions` : jamais référencés dans le template.
- Computed `spaceOptions`, `typeOptions`, `categoryOptions`, `filteredCategoryOptions`,
  `productTypeNames`, `filteredCategoryNames`, `marginPercentage`, `marginColor`, `pricingCalc` :
  jamais utilisés — remplacés dans le template par les variantes `...WithCreate`/
  `effectiveBasePrice`/`getGroupMargin`, mais l'ancien code n'avait pas été retiré.
- Méthode `onTypeChange()` : jamais appelée (le handler réellement branché est
  `onTypeSelectChange`).
- Bloc CSS `.mic-pricing-summary`/`.mic-pricing-row`/`.mic-pricing-label`/`.mic-pricing-value`/
  `.mic-pricing-sep` (~15 règles + variantes dark) : aucune classe utilisée dans le template —
  vestige d'un ancien bloc "récap pricing" retiré du template mais pas du style.
- `.mic-suffix-symbol` dupliqué à l'identique à deux endroits (avec leurs variantes `.mic--dark`).

## Correction

Tous les éléments listés ci-dessus supprimés : data/computed/méthode morts, blocs CSS non
référencés, duplication CSS fusionnée en une seule règle.

## Risque de régression / à surveiller

Revérifier le rendu visuel du formulaire (light + dark) après suppression du CSS mort, au cas où
une classe aurait été mal identifiée comme non utilisée (faux négatif de recherche texte sur une
classe générée dynamiquement).

## Références

- [[67_component_methode_t_dupliquee_dead_code]] (même type de nettoyage sur `/components`).
