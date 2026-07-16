# BUG-055 — `subComponents: {}` écrasé à chaque sauvegarde d'un Component (viole la consigne "champ legacy mort, ne plus l'alimenter")

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue` (payloads `onCreate`/`onUpdate`)

## Symptôme

`docs/modules/04_MENU_CATALOGUE.md` documente `MenuComponent.subComponents` comme "champ legacy
mort — reliquat du portage Figma. Encore lu par `repair()` (endpoint quasi mort), ne plus
l'alimenter." Or le formulaire `/components/new` et `/components/edit/:id` envoyait
`subComponents: {}` dans **chaque** payload de création et de mise à jour — donc à chaque
sauvegarde d'un composant existant qui aurait encore un JSON `subComponents` utile pour l'ancien
endpoint `repair()`, ce champ était silencieusement vidé.

## Cause racine

Le formulaire ne lit ni n'affiche jamais `subComponents` (il n'existe pas dans `form`), mais
`onCreate()`/`onUpdate()` incluaient tout de même la clé `subComponents: {}` en dur dans le payload
— probablement un reliquat du portage React/Figma mentionné ailleurs dans la doc du domaine, jamais
retiré.

## Correction

Suppression de la clé `subComponents: {}` des deux payloads (`onCreate`, `onUpdate`). Le champ
n'est plus envoyé du tout par ce formulaire, conformément à la consigne du module doc.

## Risque de régression / à surveiller

Vérifier que l'endpoint `POST /menu-components/repair` (backend) ne dépend pas d'une valeur
explicitement présente (même vide) dans le payload de création/update — a priori non, puisqu'il lit
le champ en base au moment de son propre appel, indépendamment de ce que ce formulaire envoie.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"MenuComponent — la sous-recette (composant)", champ `subComponents`.
