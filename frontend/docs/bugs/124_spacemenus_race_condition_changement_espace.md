# BUG-124 — SpaceMenuView.vue : race condition sans garde de spaceId après changement rapide d'espace

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:523-545,604-623`

## Symptôme

Changer rapidement de sélection dans le menu déroulant Espace (ex. A puis B en moins d'une seconde)
peut afficher les configurations/shops de l'espace A alors que le sélecteur affiche déjà B, si la
réponse réseau de A arrive après celle de B (réseau lent sur A, rapide sur B — scénario courant sur
un réseau mobile ou un backend sous charge inégale).

## Cause racine

`loadMenuItemsForSpace()` (`:556-558`) a une garde explicite après son `await` :
`if (String(this.selectedSpaceId) !== String(spaceId)) return;` — qui ignore une réponse arrivée
après un changement d'espace. `loadConfigurationsForSpace()` (`:523-545`) et
`loadShopsForSpace()` (`:604-623`) n'ont **aucune** garde équivalente : elles écrivent
`this.configurations`/`this.selectedConfigId`/`this.rawShops` inconditionnellement après leur
`await`, même si `selectedSpaceId` a changé entre-temps.

## Correction

Même garde ajoutée à `loadConfigurationsForSpace()` et `loadShopsForSpace()` : la réponse est
ignorée (sans effet de bord) si `selectedSpaceId` a changé pendant l'attente réseau.

## Risque de régression / à surveiller

- Simuler une réponse réseau plus lente sur un espace (throttling devtools) et changer rapidement
  vers un autre espace plus léger : vérifier que les configurations/shops affichés correspondent
  toujours à l'espace actuellement sélectionné dans le menu déroulant.

## Références

- Aucune.
