# BUG-064 — `component.api.js` : client MenuComponent dupliqué, utilisé par `useSpaceData.js`, non couvert par le fix de pagination BUG-054

- **Statut** : 🟢 Corrigé (le 2026-07-17, via [[105_menu_items_usespacedata_mauvais_client_component_api]]
  — fix fait lors de l'audit `/menu-items`, sans lien identifié avec cette fiche au moment du fix ;
  lien établi a posteriori le 2026-07-17)
- **Sévérité** : 🟢 Mineur
- **Domaine** : Menu & recettes / Espaces & builder
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/api/endpoints/component.api.js`, `src/composables/useSpaceData.js:17`

## Symptôme

`component.api.js` expose 4 fonctions (`getMenuComponents`, `createMenuComponent`,
`updateMenuComponent`, `deleteMenuComponent`) qui dupliquent exactement celles de `menu.api.js` — le
client réellement utilisé par la page `/components` (liste, création, édition, suppression, store
`menuComponents.js`). `component.api.js` n'est **pas** du code totalement mort : il a un consommateur
réel, `useSpaceData.js:17` (`getMenuComponents` importé de `component.api.js`), utilisé pour charger
les données d'un espace. Sa version de `getMenuComponents()` n'accepte aucun paramètre `page`/`limit`
(contrairement à celle de `menu.api.js`, voir [[54_menu_components_get_plafond_silencieux_100_lignes_mirror]]),
donc `useSpaceData.js` reste plafonné à 100 composants par le défaut backend — non aggravé ni corrigé
par ce lot de fixes.

## Cause racine

Deux clients API distincts pour la même entité MenuComponent, l'un (`menu.api.js`) devenu la version
vivante pour `/components`, l'autre (`component.api.js`) conservé pour un besoin différent
(`useSpaceData.js`, hors du périmètre de cette page) sans jamais être consolidé ni synchronisé quand
`menu.api.js` a évolué (ajout du support `page`/`limit`).

## Correction

`useSpaceData.js` importe désormais `getMenuComponents` depuis `menu.api.js` (paginé) au lieu de
`component.api.js`, avec la même boucle de pagination que `menuComponents.js`
(cf. [[105_menu_items_usespacedata_mauvais_client_component_api]], fait lors de l'audit
`/menu-items` du 2026-07-17). Conséquence directe non anticipée à l'époque : `component.api.js`
n'a plus **aucun** consommateur dans le repo (`grep` confirmé le 2026-07-17) — totalement mort,
plus seulement "quasi-mort". À supprimer si une future passe de nettoyage de code mort couvre ce
fichier (non fait ici, hors scope de ce fix ponctuel).

## Risque de régression / à surveiller

Vérifier que le contrat de retour paginé de `menu.api.js#getMenuComponents` (avec `meta.total`)
est bien consommé partout où `useSpaceData.js` l'utilise — déjà vérifié une fois lors du fix, à
revérifier en navigateur (non fait, `pnpm dev` interdit dans cette session).

## Références

- [[54_menu_components_get_plafond_silencieux_100_lignes_mirror]]
- [[105_menu_items_usespacedata_mauvais_client_component_api]] (le fix réel)
- `docs/modules/04_MENU_CATALOGUE.md` §"⚠️ Le piège architectural n°1 de ce domaine : 3 clients API
  se disputent MenuItem/MenuComponent".
