# BUG-094 — RecipeImportDrawer : échecs de mise à jour `readyForSale` totalement invisibles

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/RecipeImportDrawer.vue:226-232`

## Symptôme

À l'import, si `updateMenuItem(menuItemId, { readyForSale })` échoue pour certains plats, rien ne
le signale à l'utilisateur — ni compteur, ni message, ni log.

## Cause racine

```js
catch (e) { /* noop */ }  // ligne 231
```

Contrairement à la boucle des ingrédients juste en dessous (`catch (e) { fail += 1 }`) qui, elle,
compte et affiche les échecs. Le résultat affiché (`rfsOk`) ne reflète que les succès. Or
`readyForSale` pilote l'éclatement `components[]` dans Event Predict/Logistics
(`docs/modules/04_MENU_CATALOGUE.md`) — un échec silencieux peut laisser un article avec un
`readyForSale` obsolète sans que personne ne le sache, avec un impact direct sur le réarmement
logistique.

## Correction

Les échecs sont désormais comptés (`rfsFail`) et inclus dans `result` et dans le payload émis
(`this.$emit('imported', { ok, fail, rfsOk, rfsFail })`) ; un message d'erreur liste les plats en
échec.

## Risque de régression / à surveiller

Vérifier que le composant appelant (`MenuItemView.vue`, où ce drawer est monté) affiche bien ce
nouveau détail d'échec plutôt que de l'ignorer silencieusement à son tour.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` (champ `readyForSale`, impact Event Predict/Logistics).
