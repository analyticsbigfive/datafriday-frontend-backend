# BUG-064 — `component.api.js` : client MenuComponent dupliqué, utilisé par `useSpaceData.js`, non couvert par le fix de pagination BUG-054

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix différé — hors périmètre de la page `/components`)
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

Non traité : consolider les deux clients (faire pointer `useSpaceData.js` vers `menu.api.js`, ou
répliquer le support `page`/`limit` dans `component.api.js`) touche un fichier partagé par plusieurs
écrans (Space Menus, Analyse) hors du périmètre "page `/components`" de cette série de corrections, et
mérite un test de non-régression plus large que celui possible ici. Documenté pour visibilité.

## Risque de régression / à surveiller

Si un tenant a plus de 100 `MenuComponent` ET utilise activement un espace dont les données
transitent par `useSpaceData.js`, certains composants resteront invisibles dans ce chemin de
chargement précis (mais pas dans `/components` lui-même, corrigé par BUG-054).

## Références

- [[54_menu_components_get_plafond_silencieux_100_lignes_mirror]]
- `docs/modules/04_MENU_CATALOGUE.md` §"⚠️ Le piège architectural n°1 de ce domaine : 3 clients API
  se disputent MenuItem/MenuComponent".
