# BUG-003 — Taxonomie croisée Market Price / Menu Item

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Market Price)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-14

## Symptôme

Trois bugs liés dans les formulaires Supplier/Market Price :
1. Le champ packaging du formulaire Market Price lisait/écrivait dans la taxonomie **Menu Item**
   au lieu de la taxonomie **Market Price**.
2. `goodType` bloquait la création d'Ingredient/Packaging dans le référentiel Market Price.
3. La création d'un Type/Category depuis le formulaire produisait une entrée factice.

## Cause racine

Réutilisation par erreur des endpoints/stores de taxonomie Menu Item dans les formulaires Supplier
— les deux référentiels (Menu Item vs Market Price) sont proches historiquement, d'où la
confusion. Voir aussi `datafriday-web/docs/bugs/04_dropdown_packaging_mauvaise_taxonomie.md` pour
le détail du crash silencieux associé côté front (import manquant en Edit Supplier).

## Correction

Les 3 points corrigés côté BE+FE le 2026-07-14, buildés, testés et déployés.

## Risque de régression / à surveiller

Tester la création ET l'édition de Type/Category Market Price ; vérifier qu'aucune écriture ne
retombe encore sur la taxonomie Menu Item ; tester Create ET Edit Supplier sans erreur console.

## Références

- `datafriday-web/docs/bugs/04_dropdown_packaging_mauvaise_taxonomie.md`
