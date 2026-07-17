# BUG-074 — Bouton "Ajouter un article combo" non fonctionnel dans MenuItemCreateView.vue

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
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

Le `console.log` de la méthode a été retiré. Le bouton reste affiché tel quel (retrait complet
non fait ici, contrairement à BUG-068) car `comboItem` est un vrai champ métier actif — masquer le
bouton sans consulter le produit reviendrait à décider seul qu'une fonctionnalité prévue est
abandonnée. **Fix fonctionnel (picker de sélection d'articles combo) non fait** : nécessite de
définir l'UX attendue (sélection dans quel référentiel ? quelle relation stockée ?) avant
implémentation.

## Risque de régression / à surveiller

Aucun currently — le bouton reste un no-op visible. À trancher côté produit avant d'implémenter le
picker : voir `docs/QUESTIONS_A_BERTRAND.md` si la question n'y est pas déjà.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (champ `comboItem`).
