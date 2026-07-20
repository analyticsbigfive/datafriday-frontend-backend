# BUG-160 — `Brand`/`DisplayName` : écriture Vuex optimiste avec objet partiel après édition

- **Statut** : 🟢 Corrigé
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

- `src/store/modules/brandNames.js:34` (`UPDATE_BRAND_NAME`) : remplacement complet
  (`b.id === updated.id ? updated : b`) remplacé par une fusion (`{ ...b, ...updated }`).
- `src/store/modules/displayNames.js:34` (`UPDATE_DISPLAY_NAME`) : même fusion
  (`{ ...d, ...updated }`).

Même pattern que `eventTypes.js:39` (correctif de référence BUG-149) et que BUG-159
(`productTypes.js`). `BrandNameFormDrawer.vue:112`/`DisplayNameFormDrawer.vue:112` n'ont pas eu
besoin d'être modifiés pour dispatcher la réponse API complète : la fusion dans la mutation suffit
à préserver `createdAt` (et tout autre champ) même avec le payload partiel `{id, name}` déjà
dispatché.

## Risque de régression / à surveiller

Vérifié seulement par lecture de code (`node --check` sur les deux fichiers store, OK) — pas de
reproduction live en navigateur (interdiction de lancer `pnpm dev` dans cette session). À valider
manuellement : renommer une Brand Name / Display Name et vérifier que la colonne "Créé le" reste
correcte immédiatement après l'édition, sans attendre le TTL de 15 min.

## Références

- [BUG-149](149_taxonomie_evenements_optimistic_write_objets_partiels.md) — correctif de référence.
- [BUG-159](159_producttype_optimistic_write_objet_partiel.md) — même famille, impact plus visible (chip "N catégories").
