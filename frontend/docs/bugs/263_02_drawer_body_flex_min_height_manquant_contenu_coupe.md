# BUG-263-02 — Corps de tiroir non scrollable (`min-height: 0` manquant) : contenu coupé net au lieu de défiler

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Transverse (RH, Menu & recettes) — tous les tiroirs `<Teleport>` self-contained au chrome `header/body/footer` en colonne flex
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31 (retour utilisateur : "je ne peux plus voir ce qui est dans la zone de sinking… comme si la hauteur utilisée était fixée")
- **Fichiers** : voir liste des 10 fichiers corrigés ci-dessous

## Symptôme

Dans un tiroir dont le corps est censé défiler (header/footer fixes, contenu scrollable entre les
deux), le contenu qui dépasse la hauteur visible est **coupé net** au lieu de devenir accessible via
un ascenseur — aucune barre de défilement n'apparaît, le contenu en trop disparaît silencieusement.
Reproduit sur `HrRoleFormDrawer.vue` : avec la section "Sinking Rules" ouverte + plusieurs lignes,
ou la grille "Subtype" à 9 options (département F&B) + la section "Advanced", le bas du formulaire
(jusqu'au bouton Save inclus, selon les cas) devient inaccessible.

## Cause racine

Le chrome de ces tiroirs suit tous le même patron CSS (copié-collé d'un tiroir à l'autre) :

```css
.xxx-panel { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.xxx__header, .xxx__footer { flex-shrink: 0; }
.xxx__body  { flex: 1 1 0; overflow-y: auto; }  /* ← min-height manquant */
```

Par défaut, un enfant flex a `min-height: auto`, ce qui signifie *"ne jamais rétrécir en dessous de
la hauteur intrinsèque de mon contenu"* — donc `.xxx__body` grandit avec tout son contenu au lieu de
se contraindre à l'espace réellement disponible (`flex: 1 1 0` n'a alors aucun effet réel). C'est le
panel PARENT (`overflow: hidden`, `height: 100%`) qui finit par couper net ce qui dépasse, au lieu
que le `overflow-y: auto` du corps ne s'active jamais réellement puisque le corps ne devient jamais
plus petit que son contenu. Piège flexbox classique et bien documenté (absence de `min-height: 0`
sur un flex item scrollable).

## Correction

Ajout de `min-height: 0;` sur le conteneur du corps scrollable, dans les 10 fichiers partageant ce
patron (identifiés par recherche systématique de `flex: 1 1 0` + `overflow-y: auto` sans
`min-height` à proximité) :

- `frontend/src/components/hr/drawers/HrRoleFormDrawer.vue` (`.hpd__body`)
- `frontend/src/components/hr/drawers/HrSupplierFormDrawer.vue` (`.hsd__body`)
- `frontend/src/components/hr/HrValueFormDrawer.vue` (`.hsd__body`)
- `frontend/src/components/hr/HrSpaceEditDrawer.vue` (`.hsd__body`)
- `frontend/src/components/MarketPriceSelector.vue` (`.mps-content`)
- `frontend/src/components/menu-fb/views/suppliers/drawers/SupplierFormDrawer.vue` (`.sfd__body`)
- `frontend/src/components/menu-fb/views/menu-items/drawers/IngredientPickerDrawer.vue` (`.ipd-body`)
- `frontend/src/components/menu-fb/views/menu-items/drawers/PackagingPickerDrawer.vue` (`.ppd-body`)
- `frontend/src/components/menu-fb/views/component-library/drawers/ComponentPickerDrawer.vue` (`.ccd-body`)
- `frontend/src/components/menu-fb/views/component-library/drawers/IngredientPickerDrawer.vue` (`.ipd-body`)

`frontend/src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue` (`.right-section-scroll`)
avait déjà `min-height: 0` — seul exemple correct trouvé lors de l'audit, servant de référence.

Fix purement additif (une seule propriété CSS, aucun changement de comportement quand le contenu
tient déjà dans l'espace disponible) — vérifié par parsing SFC/Babel sur les 10 fichiers, aucune
erreur de syntaxe.

## Risque de régression / à surveiller

Aucun — `min-height: 0` ne peut que corriger le rétrécissement, jamais le casser. Ne couvre QUE les
10 fichiers identifiés par cette recherche précise (`flex: 1 1 0` + `overflow-y: auto`) ; d'autres
patrons de scroll (ex. `height` fixe en pixels, `max-height`) existent ailleurs dans le repo et
n'ont pas été audités ici — à vérifier au cas par cas si un symptôme similaire est signalé sur un
écran non listé ci-dessus.

## Références

- Aucune (bug CSS transverse, pas de lien avec le chantier CFG-2 RH en cours — découvert en testant
  `HrRoleFormDrawer.vue` après sa généralisation, cf. [`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §11.13)
