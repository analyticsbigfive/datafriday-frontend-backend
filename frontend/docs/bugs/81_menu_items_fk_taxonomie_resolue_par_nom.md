# BUG-081 — MenuItemCreateView : FK type/catégorie re-résolues par nom, pas par ID

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:1124,1139,1411-1419`

## Symptôme

Au chargement en édition, `typeId`→`typeName` et `categoryId`→`categoryName` sont résolus via
`find(t => t.name === ...)`, puis à la sauvegarde, `typeName`→`typeId` est de nouveau résolu par
nom. Deux types/catégories portant le même nom (même par erreur de saisie) casseraient
silencieusement l'association — l'article serait sauvegardé avec la FK d'un **autre** type/
catégorie que celui réellement sélectionné.

## Cause racine

`form.typeId`/`form.categoryId` sont bien assignés au chargement (ligne 1377-1378) mais jamais
relus ensuite — le formulaire ne travaille qu'avec les noms (`form.typeName`/`form.categoryName`)
comme source de vérité pour l'affichage ET la sauvegarde, ce qui force cette double résolution par
nom, fragile. Même pattern déjà identifié dans `ComponentCreateView.vue` (BUG-062).

## Correction

`form.typeId`/`form.categoryId` sont désormais la source de vérité pour la sauvegarde ; les
`v-select` correspondants sont maintenus synchronisés (id + nom) plutôt que de faire uniquement
une résolution par nom au moment de `onCreate`. La résolution par nom ne reste utilisée qu'au
premier chargement (édition) pour peupler l'id à partir de la donnée backend existante.

## Risque de régression / à surveiller

Vérifier le flux "créer un nouveau type à la volée" (dialog `CreateTypeDialog`) : le nouvel id
retourné par l'API doit bien être injecté dans `form.typeId` immédiatement après création, pas
seulement le nom.

## Références

- [[62_component_taxonomie_fk_resolution_fragile_par_nom]] (même pattern sur `/components`).
