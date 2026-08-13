# Plan — Réarmement : refonte du layout des lignes « Espaces de stockage »

## État d'avancement (2026-08-13)

- [ ] Étape 0 — dossier de chantier + plan/artefact commités
- [ ] **À CODER — un commit chacun, dans cet ordre :**
  1. [ ] Item 1 — layout trois zones (template + grille)
  2. [ ] Item 2 — conditionnement affiché une fois + sur « À commander »
  3. [ ] Item 3 — correctifs de cascade CSS
- [ ] Vérification : `pnpm test:unit` (baseline : échecs préexistants `apiOrMock`,
  `spaceMenusInventory`, `eventDetailsEditor`)
- [ ] PR — cible `staging` (CONTRIBUTING)

Artefact maquettes : `artefact-maquettes.html` (même dossier) — publié :
https://claude.ai/code/artifact/131ef75b-3b6e-4e09-bd86-2614b338aab1

## Contexte

L'onglet « Espaces de stockage » (étape 1 du réarmement, fiche
[BUG-314-01](../../bugs/314_01_rearmement_espaces_de_stockage.md)) réutilise tel quel le gabarit de
ligne conçu pour l'onglet « PDV à stocker ». Ce gabarit suppose une case à cocher, un bloc de
métadonnées (fournisseur, composition) et un curseur en pourcentage. Une ligne de réserve n'a rien
de tout ça : un nom, un tampon, un restant, un curseur en valeur absolue. Le gabarit tient donc mal.

Mesures relevées en direct (page à 1447 px, ligne à 982 px) :

| Constat | Mesure |
| --- | --- |
| Colonne du nom | 664 px alloués pour ~200 px de texte |
| Piste du curseur | 183 px, coincée dans une colonne de 280 px |
| Équivalent conditionnement | répété 3 fois par ligne (curseur, tampon, nécessaire) |
| Équivalent sur le curseur | tronqué dès que « Reset » apparaît (« 132 packs de 2… ») |
| Gouttière entre lignes | 0 px — `.sr-storage-group` ne pose ni `display:flex` ni `gap` |

Quatre défauts de cascade, invisibles à la relecture, dans la zone retouchée :

1. `.sr-setting-info span` (`SpaceRestockView.vue:7240`, spécificité 0,1,1) écrase la couleur des
   badges d'alerte : `.sr-storage-alert--min` (`:6032`) et `--max` (`:6036`) sont **morts** — gris
   `--sr-muted` sur fond rose/orange, `font-size` forcée de `.72rem` à 12 px. Même cause pour
   `.sr-setting-supplier` (`:6046`).
2. `.sr-storage-group` (`:6005`) ne pose qu'un padding → lignes collées.
3. `.sr-value-buy { margin-left:auto }` (`:6441`) est annulé par `@media (max-width:1400px)`
   (`:6550`) : « À commander » cesse d'être ancré à droite sur la plupart des portables.
4. Le `@media (max-width:760px)` de `:6875-6927` est dupliqué à l'identique en `:7706-7726` — les
   quatre règles de la première copie sont du poids mort.

**Décisions produit (JLH, 2026-08-13)** :

- Layout **trois zones** : identité + chips à gauche, curseur au centre, « À commander » en encart
  accentué à droite. On garde une carte par ligne (cohérence avec l'onglet PDV) plutôt qu'un tableau.
- Conditionnement affiché **une seule fois** par ligne (« 1 pack = 24 Pc ») **plus** la conversion
  complète sur « À commander » (« 42 packs de 24 Pc »), seule valeur qu'on achète.
- Les quatre défauts de cascade sont corrigés **dans ce chantier**, en commit séparé du redesign.

## Règles repo (frontend/CLAUDE.md)

Jamais `pnpm build`, jamais toucher au dev server, jamais commit sans demande explicite, pas de
`Co-Authored-By`. i18n obligatoire (`translations.js` FR+EN, clé au même index dans les 2 blocs).
Flux données : composant → composable → store Vuex → `api/endpoints/*.api.js`.

---

## Item 1 — Layout trois zones

`frontend/src/views/SpaceRestockView.vue` (template `:499-577`, CSS storage `:6372-6378` +
`:6467-6470`, section d'override `:7379-7390`).

1. **Template** — trois enfants de grille, l'usage de `.sr-values` disparaît côté storage (il reste
   au PDV) :
   - Zone 1 `.sr-storage-id` : `strong` (nom) puis `.sr-storage-chips` — badge d'alerte
     (`srStorageNearMin`/`srStorageNearMax`), `srStorageBuffer` + valeur, `srStorageRemaining` +
     valeur, format du colis (item 2).
   - Zone 2 `.sr-slider-wrap` : label `srStorageAdjustLabel`, `input.sr-slider`,
     `span.sr-slider-value`, bouton reset `v-if="row.adjusted"` — structure conservée.
   - Zone 3 `.sr-storage-buy` : label `srStorageToOrder`, valeur
     `storageBuyInfoByKey[row.key].main` (classe `.sr-value-ok` si `covered`), et l'infobulle
     `v-tooltip` existante (`:562-575`) déplacée ici.
   - Les chips sortent de `.sr-setting-info` : c'est ce qui rend leurs couleurs au badge d'alerte
     (item 3, défaut 1). **Ne pas réintroduire de `span` nu sous `.sr-setting-info`.**
2. **Grille** — écrire les règles storage **dans la section d'override, après `:7390`**, pas dans le
   bloc de base : celui-ci est déjà largement mort (`:6360`, `:6361`, `:6363`, `:6365`, `:6366` sont
   écrasés par `:7379-7390`) et y ajouter des règles entretient la confusion. Sélecteur
   `.sr-setting-row.sr-storage-row` (0,2,0 — bat le `.sr-setting-row` d'override) :
   - défaut : `grid-template-columns: minmax(0,1fr) minmax(200px,260px) 148px`,
     `align-items:center`, `gap:10px 14px` ;
   - `@media (max-width:1400px)` : 2 colonnes, zone 3 en rang 2 (`grid-column:1/-1`,
     `justify-self:end`) ;
   - `@media (max-width:760px)` : une colonne, les trois zones en `grid-column:1` (adapter la règle
     existante `:7722-7726` aux nouvelles classes).
3. **Encart « À commander »** — fond `var(--sr-primary-soft)`, texte `var(--sr-primary)`, radius 8,
   `padding:6px 10px`, `white-space:nowrap`, `font-variant-numeric:tabular-nums`. Pas d'ombre.
4. **Ne pas toucher** : `storageRestockGroups` (`:2047`), `storageBuyInfoByKey` (`:2134`),
   `setStorageAdjustment`/`clearStorageAdjustment`, ni l'onglet PDV (`:344-464`).
5. **i18n** : aucune clé nouvelle — `srStorageBuffer`, `srStorageRemaining`, `srStorageRequired`,
   `srStorageToOrder`, `srStorageAdjustLabel`, `srStorageNearMin/Max`, `srReset`,
   `srValuesHelpTitle` existent déjà.

## Item 2 — Conditionnement affiché une fois

1. Supprimer les `span.sr-pack-equiv` inline (`:531` curseur, `:546` tampon, `:551` restant, `:556`
   nécessaire) — source de la répétition et de la troncature.
2. Nouvelle méthode `storagePackFormat(row)` à côté de `storagePackedEquivalent` (`:4450`) : renvoie
   « 1 pack = 24 Pc » depuis `storagePackagingByKey[row.key]`, chaîne vide si le conditionnement ne
   se résout pas. **Réutiliser** `packSizeForPackaging` (importé `:1526`), `pluralizePackLabel` et
   `depositPackSizeLabel` (`:5091`) — ne pas réécrire la mise en forme.
3. Affiché comme dernier chip de la zone 1, en `var(--sr-muted)`.
4. `storagePackedEquivalent` devient inutilisée côté template → supprimée. `storagePackagingByKey`
   (`:2149`) reste nécessaire pour `storagePackFormat`.
5. « À commander » garde `storageBuyInfo` (`:4408`), qui produit déjà « 42 packs de 24 Pc » et
   arrondit au colis supérieur — voulu, un achat n'est pas un état.
6. **i18n** : `srStoragePackFormat` — FR `1 {pack} = {size}`, EN `1 {pack} = {size}`.

## Item 3 — Correctifs de cascade

1. **Couleur des badges** — l'item 1 sort les chips de `.sr-setting-info`, ce qui ressuscite `:6032`
   / `:6036`. Vérifier au navigateur (couleur calculée) ; si un `span` reste sous
   `.sr-setting-info`, monter la spécificité plutôt qu'un `!important`.
2. **Gouttière** — `.sr-storage-group` (`:6005`) : `display:flex; flex-direction:column; gap:6px`,
   padding horizontal aligné sur `.sr-settings-list` (12 px, `:7375`) au lieu de 16 px.
3. **Ancrage « À commander »** — la zone 3 étant une colonne de grille, `.sr-value-buy` (`:6441`) et
   son annulation `@media` (`:6550`) ne concernent plus que le PDV : **les garder**, commentées
   comme spécifiques PDV.
4. **Media query dupliquée** — supprimer `:6889-6892`, `:6894-6898`, `:6901-6903`, `:6905-6909`,
   identiques à `:7706-7726` qui gagnent par position. Vérifier qu'aucune règle du premier bloc
   n'est unique avant de couper.
5. **Infobulle rétrécissable** — `.sr-values-help` (`:6521`) n'a jamais `flex:none` contrairement à
   `.sr-deposit-help` (`:6529`) : l'ajouter.
6. **Dark mode** — aucune règle sombre pour `.sr-storage-alert*`, `.sr-values`, `.sr-slider-*` (les
   seules sont `:8191-8199`). Ajouter les tokens sombres de `.sr-storage-chips` et
   `.sr-storage-buy`.

## Fichiers critiques

- `frontend/src/views/SpaceRestockView.vue` — template `:499-577`, méthodes `:4408-4463`, computeds
  `:2047-2160`, CSS `:6005-6470` + `:7196-7475` + `:7640-7809` + dark `:8191-8199`
- `frontend/src/i18n/translations.js` — bloc EN ~`:3202-3210`, bloc FR ~`:7603-7611`

## Vérification

1. Navigateur (page `?step=stock`, onglet « Espaces de stockage ») : nom sur une ligne, curseur
   nettement plus large, « À commander » en encart, aucun texte tronqué. Mesure scriptée :
   `scrollWidth === clientWidth` sur chaque zone, piste du curseur > 240 px à 1447 px de page.
2. Curseur : la valeur suit, « Reset » apparaît sans rien pousser hors cadre, « À commander » se
   recalcule. **Remettre le curseur à sa valeur d'origine après le test.**
3. Badges d'alerte : texte rouge sur fond rose (min), orange sur fond crème (max) — contrôler la
   couleur calculée, pas seulement à l'œil.
4. Conditionnement : « 1 pack = 24 Pc » une seule fois par ligne ; « À commander » en colis ; une
   ligne sans conditionnement résolu affiche les unités brutes sans chip vide.
5. Responsive 1400 px et 760 px : pas de chevauchement, zone 3 repliée puis colonne unique.
6. Dark mode : chips, encart et curseur lisibles.
7. Non-régression PDV : onglet « PDV à stocker » strictement inchangé (case, curseur %, fournisseur,
   composition, pagination).
8. `pnpm test:unit` — baseline des 3 échecs préexistants inchangée.
