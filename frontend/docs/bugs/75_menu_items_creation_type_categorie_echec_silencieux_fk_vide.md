# BUG-075 — MenuItemCreateView : échec silencieux de création type/catégorie → sauvegarde avec FK vide

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:1122-1149`

## Symptôme

Quand l'utilisateur choisit de créer un nouveau type/catégorie à la volée (au lieu d'en sélectionner
un existant) et que l'appel `createProductType`/`createProductCategory` échoue (réseau, doublon —
voir [[87_menu_items_creation_type_categorie_doublon_500_generique]] côté backend), l'utilisateur
ne voit aucune erreur : `onCreate` continue et appelle `createMenuItem`/`updateMenuItem` avec
`typeId`/`categoryId` vide.

## Cause racine

```js
catch (e) { console.error("Error creating type:", e); }      // ligne 1132, n'interrompt pas le flux
catch (e) { console.error("Error creating category:", e); }  // ligne 1147, idem
```

Aucun `throw`, aucune écriture dans `this.saveError` — l'exception est juste loguée en console.

## Correction

Les deux `catch` propagent désormais l'erreur (`throw`) pour tomber dans le `catch` global de
`onCreate`, qui affiche déjà `saveError` à l'utilisateur et interrompt la sauvegarde — au lieu de
continuer silencieusement avec une FK vide.

## Risque de régression / à surveiller

Vérifier que l'utilisateur peut bien corriger et resoumettre après un échec de création de
type/catégorie (le formulaire ne doit pas rester bloqué dans un état incohérent après l'erreur).

## Références

- [[87_menu_items_creation_type_categorie_doublon_500_generique]]
