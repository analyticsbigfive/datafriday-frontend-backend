# BUG-098 — MenuItemDeleteDialog : pas de `persistent`, fermable pendant une requête en cours

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/dialogs/MenuItemDeleteDialog.vue:2-6`

## Symptôme

Contrairement aux 3 dialogs de création (`CreateCategoryDialog`, `CreatePackingTypeDialog`,
`CreateTypeDialog`, tous `persistent`), `MenuItemDeleteDialog` ne l'est pas. Un clic sur le fond ou
`Échap` pendant que `loading=true` (requête `deleteMenuItem` en vol) ferme le dialog. Si la
suppression échoue ensuite, `deleteError` est bien positionné côté parent mais n'est plus jamais
affiché puisque le dialog est déjà masqué — l'utilisateur croit l'action terminée sans
confirmation, dans un sens ou dans l'autre.

## Cause racine

`<v-dialog :model-value="modelValue" @update:model-value="..." max-width="480">` — pas d'attribut
`persistent`.

## Correction

Ajout de `:persistent="loading"` — le dialog reste fermable normalement au repos, mais ne peut
plus être fermé (clic extérieur/Échap) tant qu'une suppression est en cours.

## Risque de régression / à surveiller

Vérifier que le dialog reste bien fermable via le bouton "Annuler" pendant `loading` si un
mécanisme d'annulation existe, ou que ce bouton est désactivé pendant la requête (sinon
l'utilisateur pourrait se sentir bloqué).

## Références

- Aucune.
