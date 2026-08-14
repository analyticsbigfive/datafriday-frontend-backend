# BUG-074 — Bouton "Ajouter un article combo" non fonctionnel dans MenuItemCreateView.vue

- **Statut** : 🟢 Corrigé (picker implémenté depuis, suite du diagnostic dans BUG-322-02)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:41-42,1258-1260`

## Symptôme

L'utilisateur clique sur "+ Ajouter un article combo" (visible en permanence dans la barre
d'actions du formulaire) et rien ne se passe.

## Cause racine

```js
onAddComboItem() {
  console.log("Add Combo Item");
},
```

Aucun drawer/dialog n'est câblé (contrairement à `onAddIngredient`/`onAddComponent`/
`onAddPackaging`), et aucun composant de type "ComboItemPickerDrawer" n'existe dans le domaine.
`comboItem` est bien un champ MenuItem documenté (marque un article réutilisable tel quel comme
ligne d'un item catégorie "Menu" composé, cf. `docs/modules/04_MENU_CATALOGUE.md`), mais aucun
picker pour sélectionner ces articles combo n'a jamais été implémenté côté front.

## Correction

Le `console.log` de la méthode a été retiré à l'époque. Depuis, un vrai picker
(`ComboItemPickerDrawer.vue`) a été implémenté et câblé sur ce bouton — le no-op documenté ici n'est
plus d'actualité.

**Mise à jour 2026-08-14** : le picker s'ouvrait bien mais affichait toujours "No menu items
found" (liste jamais peuplée) et ne filtrait pas par espace — bug distinct, diagnostiqué et corrigé
dans [BUG-322-02](322_02_combo_item_picker_liste_toujours_vide.md).

## Risque de régression / à surveiller

Voir BUG-322-02 pour le risque de régression du picker lui-même.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (champ `comboItem`).
- `docs/bugs/322_02_combo_item_picker_liste_toujours_vide.md` — suite de ce diagnostic.
