# BUG-325-02 — ComponentCreateView.vue : mapping des sous-composants (children) sur des champs inexistants

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue` (méthode `loadComponentData`)

## Symptôme

Aucun rapport utilisateur direct — trouvé en implémentant la colonne Supplier des sous-composants
(un composant ayant lui-même des sous-composants aurait affiché un id et un nom incorrects/absents
pour ces lignes en mode édition). Non visible sur les captures fournies par l'utilisateur car les
composants testés n'avaient que des ingrédients, pas de sous-composants.

## Cause racine

`loadComponentData()` mappait `component.children` (le tableau brut Prisma `ComponentComponent`,
forme `{ id, parentId, childId, quantity, unit, cost, child: {...MenuComponent} }`) comme s'il
s'agissait déjà d'un objet aplati :

```js
this.form.children = component.children.map(child => ({
  componentId: child.componentId || child.id,   // child.componentId n'existe pas → fallback sur
                                                   // child.id, l'id de la LIGNE DE JOINTURE, pas
                                                   // du sous-composant référencé
  itemName: child.itemName || child.name || "-", // ni l'un ni l'autre n'existe → toujours "-"
  ...
```

Les vrais champs sont `child.childId` (id du sous-composant) et `child.child.name`/`child.child.*`
(données du sous-composant, imbriquées sous la relation `child`). Même famille de bug que
[BUG-322-02](322_02_combo_item_picker_liste_toujours_vide.md) (frontend, résolution `childId` vs
`componentId`) et le bug équivalent côté backend sur `MenuItemCombo`
([BUG-127-02](../../../backend/docs/bugs/127_02_spacemenus_combo_item_no_recipe_indisponible.md)) :
confondre l'id de la ligne de jointure avec l'id de l'entité référencée.

## Correction

Mapping corrigé pour lire `child.childId`/`child.child.*` avec les bons fallbacks. Fait dans le même
passage que l'ajout de la résolution des fournisseurs des sous-composants (voir
[BUG-326-02](326_02_composants_colonne_supplier_jamais_peuplee.md)), puisque c'était le même bloc de
code.

## Risque de régression / à surveiller

À vérifier en réel : ouvrir en édition un composant qui a réellement des sous-composants (pas
seulement des ingrédients) et confirmer que le nom, l'id, la catégorie et le coût affichés
correspondent au bon sous-composant. Pas de test automatisé existant sur ce fichier.

## Références

- [`322_02_combo_item_picker_liste_toujours_vide.md`](322_02_combo_item_picker_liste_toujours_vide.md)
- [`326_02_composants_colonne_supplier_jamais_peuplee.md`](326_02_composants_colonne_supplier_jamais_peuplee.md)
