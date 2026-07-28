# BUG-241-02 — `CsvImportDrawer.vue` : menu déroulant d'un `v-select` invisible/inatteignable (stacking context piégé sous le drawer)

- **Statut** : 🟡 Corrigé non déployé (2ᵉ correctif, confirmé par lecture directe du code source Vuetify — le 1ᵉʳ correctif ciblait le mauvais élément, cf. « Cause racine »)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, capture d'écran utilisateur (étape 2 "Colonnes", thème clair) : le
  select "Espace" bascule bien son chevron au clic (donc `isActive` Vue passe à `true`) mais
  **aucune option n'apparaît**, en clair comme en sombre — confirmé sans erreur console, et le clic
  atteint bien le bon élément DOM (`v-field`/`v-select`), pas un élément invisible par-dessus.
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`<v-select>` × 6, `menu-props`
  + bloc `<style>` non scoped), `src/components/events/drawers/EventDrawerShell.vue` (z-index
  forcés, non modifiés)

## Symptôme

Sur n'importe quel `v-select` du wizard d'import CSV (mapping colonnes à l'étape 2, mapping valeurs
aux étapes 3-7), cliquer pour ouvrir le menu déroulant fait bien basculer le chevron (le state
interne Vuetify passe à "ouvert"), mais **aucune option n'est visible ni cliquable**.

## Cause racine

`EventDrawerShell.vue` force `.eds-drawer { z-index: 2200 !important; }` et
`.v-navigation-drawer__scrim { z-index: 2199 !important; }` (BUG-148, volontaire, pour battre
d'autres overlays de la page comme EventPredict à z-index 1100).

Le menu d'un `v-select` ouvert **depuis l'intérieur** de ce drawer est un **nouvel** overlay
Vuetify, dont le z-index réel est géré par le composable interne `useStack`
(`node_modules/vuetify/lib/composables/stack.js`) : chaque overlay actif s'empile sur une pile
globale partagée par toute l'app (`globalStack`), et reçoit `z-index = dernier z-index de la pile +
10`. Ce mécanisme est **totalement indépendant** de nos valeurs codées en dur sur le drawer — la
pile ne sait pas que le drawer a été forcé à 2200, elle continue de raisonner sur sa propre base
(~2000+), donc le menu du select hérite d'un z-index proche de 2000-2011, **inférieur** à 2199/2200.

**Point clé, vérifié dans `VOverlay.js:265-303`** : ce z-index dynamique (`stackStyles`) est posé en
style INLINE sur le wrapper **`.v-overlay`** (ligne 275-286 : `"style": [stackStyles.value, ...]`),
**pas** sur `.v-overlay__content` (ligne 299-303, qui ne reçoit que des styles de dimension/position,
sans z-index). Or `.v-overlay` a `position: fixed` **et** ce z-index → il établit sa **propre
stacking context**. Un z-index posé sur son enfant `.v-overlay__content` ne peut **jamais**
s'échapper au-dessus d'éléments extérieurs à `.v-overlay` (notre drawer à 2200), quelle que soit sa
valeur — c'est pourquoi le 1ᵉʳ correctif tenté (`.v-overlay__content.v-select__content { z-index:
2300 !important }`) n'avait strictement aucun effet : il ciblait un élément dont le z-index est
piégé par son propre parent, déjà stacké sous le drawer.

## Correction

1. Chaque `<v-select>` du wizard (colonnes à l'étape 2, + les 5 selects de valeurs aux étapes 3-7)
   passe désormais `menu-props="{ class: 'elv-select-overlay' }"`.
2. Vérifié dans `VMenu.js:137` : `"class": ['v-menu', props.class]` — le `class` passé via
   `menu-props` est appliqué par VMenu **sur le wrapper `.v-overlay` lui-même** (pas sur
   `.v-overlay__content`), exactement l'élément dont le z-index compte réellement pour la
   visibilité.
3. Nouvelle règle CSS non scoped : `.elv-select-overlay { z-index: 2300 !important; }` — au-dessus
   du drawer (2200) et de son scrim (2199).
4. L'ancienne règle sur `.v-overlay__content.v-select__content` est conservée (inoffensive, utile
   pour la couleur en dark mode via une autre règle `.dark`), mais n'a plus de rôle dans la
   visibilité — le vrai fix est la règle `.elv-select-overlay` ci-dessus.
5. Le z-index du drawer/scrim (`EventDrawerShell.vue`) n'est **pas modifié**, pour ne pas risquer de
   régresser BUG-148.

## Risque de régression / à surveiller

- Non revérifié en navigateur par moi-même (contrainte de session) — à confirmer par l'utilisateur :
  recharger complètement la page (cache vidé) puis ouvrir chaque select du wizard (étapes 2 à 7) en
  clair et en sombre, vérifier que le menu s'affiche ET qu'un clic sur une option la sélectionne.
- `elv-select-overlay` est une classe propre à ce composant (passée explicitement via `menu-props`
  sur CES selects précisément) — contrairement au 1ᵉʳ correctif, cette règle n'affecte **aucun**
  autre `v-select` de l'application, donc aucun risque de régression ailleurs.
- Si le symptôme persiste malgré ce correctif : vérifier en devtools que `elv-select-overlay` est
  bien présent sur l'élément `.v-overlay` (pas seulement `.v-overlay__content`) au moment où le menu
  est ouvert — si la classe n'apparaît pas dessus, le mécanisme de forwarding `menu-props.class` a
  pu changer entre versions de Vuetify (version actuelle : `5.22.0`, vérifiée dans
  `node_modules/vuetify/package.json`).

## Références

- [BUG-237-02](237_02_csvimportdrawer_darkmode_menu_select_teleporte_illisible.md) — hypothèse
  initiale (contraste dark mode), incomplète : voir correction apportée à cette fiche
- [BUG-148](00_INDEX.md) — origine du forçage z-index du drawer/scrim (à ne pas régresser)
- `node_modules/vuetify/lib/components/VOverlay/VOverlay.js:265-303` (`stackStyles` posé sur
  `.v-overlay`, pas `.v-overlay__content`)
- `node_modules/vuetify/lib/composables/stack.js` (`useStack`, pile globale `globalStack`, calcul
  `lastZIndex + 10`)
- `node_modules/vuetify/lib/components/VMenu/VMenu.js:137` (`props.class` appliqué sur `.v-overlay`)
