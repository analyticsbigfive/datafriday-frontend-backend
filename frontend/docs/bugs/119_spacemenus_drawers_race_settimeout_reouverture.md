# BUG-119 — Tiroirs Space Menus : race locale sur réouverture rapide (setTimeout non annulé vide le formulaire)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/drawers/SpaceMenuEditShopDrawer.vue:174-176`,
  `src/components/menu-fb/views/space-menus/drawers/ShopMenuItemsDrawer.vue:201-205`

## Symptôme

Fermer puis rouvrir rapidement (moins de 300ms) le tiroir d'édition de shop, ou le tiroir de
sélection d'items — sur le même shop ou un shop différent — peut afficher le tiroir visuellement
ouvert mais complètement vide (formulaire null / liste d'items à 0), jusqu'à ce que l'utilisateur
le referme et le rouvre une nouvelle fois. Purement côté client, aucun réseau nécessaire pour
reproduire.

## Cause racine

Les deux tiroirs nettoient leur état interne dans un `setTimeout(..., 300)` déclenché à la
fermeture (`SpaceMenuEditShopDrawer.vue:174-176` : `this.form = null` ; `ShopMenuItemsDrawer.vue:201-205` :
`this.allMenuItems = []; this.selectedMenuItemIds = []`), sans jamais annuler ce timer si le
tiroir est rouvert avant son échéance. Une réouverture dans la fenêtre de 300ms initialise
correctement le nouvel état (`form`/`allMenuItems`), puis le timer périmé de la fermeture
précédente se déclenche et l'efface.

## Correction

L'identifiant du `setTimeout` est stocké et annulé (`clearTimeout`) au moment où le tiroir se
rouvre, dans les deux fichiers — le nettoyage différé ne s'applique plus que s'il n'a pas été
préempté par une réouverture.

## Risque de régression / à surveiller

- Fermer/rouvrir rapidement (clics successifs) chacun des deux tiroirs plusieurs fois de suite :
  le contenu doit toujours refléter le shop actuellement sélectionné, jamais un état vide.

## Références

- Aucune.
