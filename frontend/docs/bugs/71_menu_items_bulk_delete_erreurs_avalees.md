# BUG-071 — Suppression en masse de MenuItem : erreur individuelle totalement avalée

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue:938-960`

## Symptôme

Quand la suppression d'un article échoue en masse (403, conflit FK 409, réseau...), aucune
information n'est conservée sur la cause — ni console, ni UI, seul un compteur générique du type
"N article(s) n'ont pas pu être supprimés." est affiché.

## Cause racine

```js
for (const id of menuItemIds) {
  try {
    await deleteMenuItem(id);
  } catch (e) {
    failed.push(id); // e est jeté, jamais lu
  }
}
```

À comparer avec `confirmDelete` (suppression unitaire) qui, lui, propage correctement
`e?.userMessage || e?.message`.

## Correction

Chaque échec logue désormais `console.error` avec l'id et le message d'erreur
(`e?.userMessage || e?.message`), et `bulkDeleteError` reprend le message de la première erreur
rencontrée (en plus du compteur) pour donner un signal actionnable (droits insuffisants vs conflit
vs réseau) plutôt qu'un message générique muet.

## Risque de régression / à surveiller

Vérifier avec un item volontairement en conflit FK (ex. référencé par un `SpaceMenuItem`) que le
message affiché est bien lisible et ne casse pas la mise en page du bandeau d'erreur pour une
sélection nombreuse.

## Références

- Aucune.
