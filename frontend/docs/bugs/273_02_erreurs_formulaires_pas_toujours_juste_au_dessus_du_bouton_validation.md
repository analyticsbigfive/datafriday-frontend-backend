# BUG-273-02 — Messages d'erreur de formulaire pas toujours juste au-dessus du bouton de validation

- **Statut** : 🟢 Corrigé (2026-08-02)
- **Sévérité** : 🟡 Mineur (UX, aucun impact données)
- **Domaine** : Transverse (tous les domaines avec drawers/dialogs/vues de formulaire)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-02 (règle UX explicite demandée par l'utilisateur : "les erreurs
  doivent toujours être juste au-dessus du bouton de validation")
- **Fichiers** : 45 fichiers (41 repositionnement + `HrDeleteDialog.vue`,
  `HrSuppliersView.vue`, `HrPositionsView.vue`, `i18n/translations.js` pour le gap
  plomberie d'erreur), voir liste par domaine ci-dessous

## Symptôme

Sur la quasi-totalité des drawers/dialogs/vues de création-édition de l'app, le message d'erreur
(validation locale ou échec API au submit) était codé en dur **en haut du corps scrollable** du
formulaire, alors que le bouton "Enregistrer"/"Créer"/"Sauvegarder" vit dans un footer séparé,
souvent des dizaines à plusieurs centaines de lignes plus bas. Sur un formulaire long, l'utilisateur
qui clique "Enregistrer" en bas ne voit jamais le message d'erreur qui apparaît tout en haut, hors
champ — cas d'origine confirmé : `EventFormDrawer.vue` (1252 lignes), erreur affichée avant même le
premier champ, bouton dans un footer fixe à part.

## Cause racine

Anti-pattern copié-collé à travers ~40 composants indépendants (aucune primitive UI partagée pour
l'affichage d'erreur) : `<div v-if="error">`/`<v-alert v-if="error">` systématiquement placé comme
premier élément du corps du formulaire, jamais repositionné une fois le formulaire devenu long.
Deux composants partagés existaient déjà (`EventDrawerShell.vue`, consommé par 8 drawers/dialogs du
domaine Événements ; `FlatReferentialFormDrawer.vue`/`FlatReferentialDeleteDialog.vue`, consommés
par 8 wrappers brand-name/display-name/industrial/packing-type) mais ne centralisaient pas non plus
la position de l'erreur — chaque consommateur la rendait lui-même en haut de son propre slot corps.

## Correction

**Principe appliqué partout** : le bouton de validation vit presque toujours dans un footer
structurellement séparé du corps scrollable (`flex-shrink: 0` hors de `overflow-y: auto`, pattern
déjà présent dans tout le code). L'erreur est désormais rendue comme **sibling entre le corps
scrollable et ce footer** — donc toujours visible sans scroll, juste au-dessus des boutons — plutôt
qu'à l'intérieur de la zone qui scrolle.

- **`EventDrawerShell.vue`** (composant partagé) : nouvelle prop `errorMessage`, rendue dans une
  barre fixe (`.eds-error-bar`) entre `.eds-body` (scrollable) et `.eds-footer` (fixe). Cascade
  automatiquement à ses 5 consommateurs migrés : `EventFormDrawer.vue`, `EventTypeDialog.vue`,
  `EventCategoryDialog.vue`, `EventSubcategoryDialog.vue`, `EventDeleteDialog.vue` — chacun passe
  désormais `:error-message="..."` au lieu de rendre son propre `<div>` en haut du corps ; CSS
  scoped mort (`.xxx-error`, dupliqué dans chaque fichier) supprimé après migration.
- **`FlatReferentialFormDrawer.vue`** / **`FlatReferentialDeleteDialog.vue`** (composants partagés,
  8 wrappers consommateurs sans modification nécessaire de leur côté — l'erreur est déjà pilotée par
  le composant partagé) : erreur déplacée en sibling juste avant le footer.
- **`TaxonomyImportDrawer.vue`** / **`CsvImportDrawer.vue`** (wizards d'import multi-étapes,
  domaine Événements) : **non touchés** — vérifiés à part, leur erreur de fichier (`fileError`) est
  déjà scopée à l'étape 1 (courte, dropzone + carte d'info, pas de risque de scroll), pattern
  différent de l'anti-pattern principal.
- **~34 formulaires indépendants** (aucun composant partagé, un fix par fichier), traités par lots
  via 5 agents en parallèle avec le même principe (erreur = sibling juste avant le footer fixe,
  CSS scoped minimal ajusté pour l'inset/marges) :
  - Market prices : `MarketPriceCategoryFormDrawer.vue`, `MarketPriceTypeFormDrawer.vue`,
    `MarketPriceCreateDrawer.vue`, `MarketPriceEditDrawer.vue`, `MarketPriceEditSupplierDrawer.vue`
  - Products : `ProductCategoryFormDrawer.vue`, `ProductTypeFormDrawer.vue`
  - Component library (menu-fb) : `ComponentCategoryFormDrawer.vue`, `ComponentTypeFormDrawer.vue`,
    `ComponentPickerDrawer.vue`, `IngredientPickerDrawer.vue`, `ComponentCreateView.vue` (vue
    routée pleine page, pattern calqué sur `MenuItemCreateView.vue` déjà correct)
  - Menu items (menu-fb) : `RecipeImportDrawer.vue`, `ComponentPickerDrawer.vue`,
    `PackagingPickerDrawer.vue`, `IngredientPickerDrawer.vue` (fichiers distincts de leurs
    homonymes component-library, dossiers différents)
  - Suppliers : `SupplierFormDrawer.vue`
  - Departments : `DepartmentFormDrawer.vue`, `DepartmentSubtypesDrawer.vue` (pas de bouton submit
    unique — édition inline par ligne — erreur placée au-dessus du seul footer fixe existant,
    contenant juste "Fermer")
  - Permission/Role/User : `PermissionFormDrawer.vue`, `RoleFormDrawer.vue`, `UserEditDrawer.vue`,
    `UserCreateView.vue` (voir note ci-dessous)
  - HR : `HrSupplierFormDrawer.vue`, `HrRoleFormDrawer.vue`, `HrValueFormDrawer.vue`
  - Spaces : `SpaceCreateDrawer.vue` (builder multi-étapes, un seul footer partagé par les 4 étapes)
  - Logistics : `LogisticMovementDialog.vue`, `LogisticSimulateSaleDialog.vue`
  - Wizard Data Integration : `CreateEventDialog.vue`, `StepMapSpace.vue`, `StepMapShops.vue`,
    `StepMapMenuItems.vue` — cas particulier : le bouton de ces 3 derniers vit dans un
    `<Teleport :to="footerTarget">` vers le footer fixe du wizard parent (`IntegrationWizard.vue`,
    `.iw-footer`). L'erreur est désormais téléportée **dans le même Teleport** que le bouton
    (conteneur flex-colonne ajouté), pas seulement déplacée dans le corps — sinon elle restait
    dans la zone scrollable `.iw-body` et le problème d'origine persistait malgré le déplacement.

**Note UserCreateView.vue** : ce fichier a DEUX zones d'erreur distinctes pilotées par DEUX boutons
différents — `saveError` (bouton "Enregistrer tout", dans le header en haut de page) et `formError`
(bouton du formulaire de saisie, en bas à droite). Un premier passage automatisé avait placé les
deux ensemble en bas ; corrigé manuellement après coup : `saveError` reste une bannière juste sous
le header (son vrai bouton), `formError` reste au-dessus du footer du formulaire (son vrai bouton) —
chacun adjacent à SON bouton plutôt que groupés au même endroit.

**Erreurs volontairement non déplacées** : les erreurs scopées à des mini-dialogs/mini-formulaires
imbriqués (ex. "créer un type/catégorie à la volée" depuis un `<v-select>`) étaient déjà adjacentes
à leur propre bouton local — non touchées pour éviter tout risque de régression sur des flux qui
fonctionnaient déjà correctement.

## Risque de régression / à surveiller

- **Aucun test navigateur effectué** (règle stricte de ce projet : ne jamais démarrer/arrêter le
  serveur dev depuis une session agent) — seule vérification possible : parsing/compilation propre
  des 41 fichiers via `@vue/compiler-sfc` (aucune erreur) + suite de tests unitaires Jest complète
  (651 tests, 3 suites en échec **préexistantes et confirmées sans rapport** via `git stash` :
  `apiOrMock.spec.js`, `spaceMenusInventory.spec.js`, `eventDetailsEditor.spec.js` — même échec
  avant et après ce correctif). **À valider visuellement dans le navigateur avant déploiement**,
  en particulier : dark mode sur chaque composant migré, comportement du wizard Data Integration
  (Teleport le plus risqué du lot), et `LogisticSimulateSaleDialog.vue` (pas de footer réellement
  fixe — limitation documentée, pas une garantie totale d'absence de scroll).
- **Gaps découverts en marge, corrigés dans un second passage (2026-08-02)** :
  - `src/components/hr/dialogs/HrDeleteDialog.vue` : la classe CSS `.hdd__error` existait mais
    n'était jamais référencée — un échec de suppression n'affichait aucune erreur. Corrigé : nouvelle
    prop `error` (même pattern que `loading`, piloté par le parent), rendue juste au-dessus du
    footer. Ses 2 appelants (`HrSuppliersView.vue`, `HrPositionsView.vue`) n'avaient par ailleurs
    aucun try/catch autour de l'appel de suppression (échec = promesse rejetée non gérée,
    totalement silencieux) — ajouté dans les deux, avec un nouvel état `deleteError` remonté au
    dialog. Nouvelle clé i18n `hrDeleteError` ("Delete failed" / "Échec de la suppression").
  - `MarketPriceTypeCategoriesDrawer.vue`, `ProductTypeCategoriesDrawer.vue`,
    `ComponentTypeCategoriesDrawer.vue` : revérifiés en détail — ce sont des **viewers en lecture
    seule** (affichent `marketPriceType.categoryList`/équivalent depuis une prop, un seul bouton
    "Fermer", aucun appel API dans leurs `methods`). Il n'y a structurellement rien qui puisse
    échouer ici — confirmé que ce n'est **pas** un gap, l'absence de gestion d'erreur est correcte
    pour ce type de composant. Aucune modification.
- **Formulaires courts déjà "OK" non touchés** (single champ ou dialog de confirmation sans scroll,
  ex. `EventTypeDialog.vue` migré vers le shell par cohérence mais la plupart des "New X"
  quick-create dialogs et delete-confirm dialogs à travers market-prices/component-library/
  menu-items/products/permission/role/user/supplier n'ont pas été touchés) : erreur déjà
  visible sans scroll dans ces cas, non prioritaire — à revoir si une stricte identité pixel-perfect
  de position est souhaitée au-delà de la garantie fonctionnelle "toujours visible sans scroll".

## Références

- Pattern de référence pré-existant déjà correct : `MenuItemCreateView.vue` (erreur juste avant le
  footer d'actions).
