# BUG-058 — Component : ajouter deux fois le même ingrédient/sous-composant crée un doublon, et le supprimer en efface deux

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (perte de données silencieuse)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue` (`onIngredientsAdded`, `onComponentsAdded`, `onRemoveSubItem`)

## Symptôme

Sur `/components/new` et `/components/edit/:id`, ajouter deux fois le même ingrédient ou
sous-composant (réouverture accidentelle du tiroir, double-clic) créait deux lignes distinctes dans
le tableau des sous-items. Cliquer sur "supprimer" sur l'une des deux lignes supprimait les **deux**
d'un coup, sans avertissement — l'utilisateur perdait deux fois le coût qu'il pensait retirer une
seule fois.

## Cause racine

`onIngredientsAdded`/`onComponentsAdded` concaténaient simplement les nouveaux éléments à la liste
existante (`[...(this.form.ingredients || []), ...items]`) sans vérifier si un élément avec le même
`marketPriceId`/`childId` existait déjà. `onRemoveSubItem`, lui, filtre en supprimant **toute** ligne
dont l'id correspond (`this.form.ingredients.filter(i => i?.marketPriceId !== targetId)`) — logique
correcte pour un id unique, mais qui supprime les deux occurrences dès lors qu'un doublon existe.

## Correction

`onIngredientsAdded`/`onComponentsAdded` retirent désormais, avant de concaténer, toute ligne
existante dont l'id figure déjà parmi les éléments qu'on est en train d'ajouter — resélectionner un
ingrédient/composant déjà présent **remplace** sa ligne au lieu de la dupliquer. Aucun doublon ne
peut donc plus exister, ce qui rend le problème de suppression groupée sans objet (pas besoin de
changer `onRemoveSubItem`).

## Risque de régression / à surveiller

Vérifier qu'ajouter un ingrédient déjà présent dans le tableau remplace bien sa ligne (au lieu de la
dupliquer), et que la quantité affichée après remplacement correspond à celle choisie dans le picker
au moment du re-ajout (pas une fusion des deux quantités).

## Références

- Aucune fiche liée.
