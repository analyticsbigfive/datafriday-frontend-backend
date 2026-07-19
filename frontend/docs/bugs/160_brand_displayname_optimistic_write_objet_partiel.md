# BUG-160 — `Brand`/`DisplayName` : écriture Vuex optimiste avec objet partiel après édition

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes (Configurations — Brand Names/Display Names)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/store/modules/brandNames.js:34` (`UPDATE_BRAND_NAME`)
  - `src/store/modules/displayNames.js:34` (`UPDATE_DISPLAY_NAME`)
  - `src/components/brand-name/drawers/BrandNameFormDrawer.vue:112`
  - `src/components/display-name/drawers/DisplayNameFormDrawer.vue:112`

## Symptôme

Même mécanisme que [BUG-159](159_producttype_optimistic_write_objet_partiel.md) mais sur les
référentiels plats Brand/DisplayName : éditer un nom via le drawer dispatch uniquement `{id, ...
payload}` (soit `{id, name}`), et la mutation `UPDATE_BRAND_NAME`/`UPDATE_DISPLAY_NAME` remplace
l'objet entier au lieu de le fusionner — `createdAt` et tout autre champ non renvoyé disparaissent
de la ligne jusqu'au prochain refetch (TTL 15 min ou navigation).

Sévérité moindre que BUG-159 : ces entités n'ont pas de relation imbriquée type "N catégories"
affichée à l'écran, donc l'effet visible se limite à la colonne "Créé le".

## Cause racine

Même famille que [BUG-149](149_taxonomie_evenements_optimistic_write_objets_partiels.md) — le
correctif (fusion ou dispatch de la réponse API complète) n'a jamais été porté sur `brandNames.js`/
`displayNames.js`.

## Correction

Reste à faire : même correctif que BUG-149/BUG-159.

## Risque de régression / à surveiller

Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement.

## Références

- [BUG-149](149_taxonomie_evenements_optimistic_write_objets_partiels.md) — correctif de référence.
- [BUG-159](159_producttype_optimistic_write_objet_partiel.md) — même famille, impact plus visible (chip "N catégories").
