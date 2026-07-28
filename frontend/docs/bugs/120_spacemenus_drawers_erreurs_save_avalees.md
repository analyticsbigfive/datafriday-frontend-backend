# BUG-120 — Erreurs de sauvegarde des tiroirs d'édition shop avalées sans feedback utilisateur

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/drawers/ShopDetailEditDrawer.vue:216-233`,
  `src/components/menu-fb/views/space-menus/drawers/SpaceMenuEditShopDrawer.vue:200-216`

## Symptôme

Si la sauvegarde d'un shop échoue (réseau, 500, etc.) après que l'utilisateur a fermé le tiroir
(clic sur le fond ou le bouton X — ni l'un ni l'autre n'est désactivé pendant `saving`), l'erreur
n'est visible nulle part : elle est stockée dans une variable locale (`saveError`) d'un composant
dont le corps est caché par `v-if`. Sur `ShopDetailView.vue`, il n'existe même aucun mécanisme de
snackbar pour ce genre de retour — l'échec est totalement invisible. Sur `SpaceMenuView.vue`, un
snackbar existe déjà et fonctionne pour d'autres flux (ex. `ShopMenuItemsDrawer.attachMenuItems`),
mais `SpaceMenuEditShopDrawer` n'émet jamais d'événement d'erreur pour l'alimenter.

## Cause racine

`ShopDetailEditDrawer.vue:216-233` et `SpaceMenuEditShopDrawer.vue:200-216` catchent l'échec
uniquement en local (`this.saveError = ...`), sans `console.error` ni `$emit`. Contraste avec
`ShopMenuItemsDrawer.attachMenuItems()` (`ShopMenuItemsDrawer.vue:280-315`), qui émet toujours
`attached` avec l'erreur même si le tiroir a déjà été fermé — le pattern que les deux autres
tiroirs auraient dû suivre.

## Correction

Les deux tiroirs émettent désormais un événement d'erreur (`@save-error`) même après fermeture, sur
le modèle de `ShopMenuItemsDrawer`. `SpaceMenuView.vue` relie cet événement à son snackbar existant
(`onShopSaved`/`onChildError`). `ShopDetailView.vue`, qui n'avait aucun mécanisme de snackbar, en
reçoit un minimal (bannière d'erreur réutilisant le pattern `.sdv-error` déjà présent pour l'état de
chargement).

## Risque de régression / à surveiller

- Simuler un échec réseau pendant la sauvegarde d'un shop (couper la connexion juste après avoir
  cliqué "Save Changes" puis fermé le tiroir) : un message d'erreur doit apparaître sur l'écran
  parent.

## Références

- [BUG-113](113_spacemenus_shopdetailview_orpheline_attach_factice.md) — même problème de feedback
  d'erreur silencieux, sur l'action "Attacher" de `ShopDetailView.vue`.
