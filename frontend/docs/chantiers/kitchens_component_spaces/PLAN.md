# Chantier : Cuisines, espaces et image des composants (demande Bertrand du 2026-10-08)

Statut (2026-10-08) : **codé sur `feat/kitchens-components-spaces`** (créée depuis `production`
`297f1ddf`), **non commité**. Migration appliquée sur la base locale uniquement. Reste : test navigateur
par Ulrich, relecture par agent, commit puis déploiement sur demande explicite (§8).

Source : mail de Bertrand du 2026-10-08 (« taches pour aujourd'hui ») et 3 captures annotées (fiche
« Modifier le composant », bloc « Informations d'inventaire », « Bibliothèque de composants »).

---

## 1. Ce que demande Bertrand

1. **Settings > Menu F&B > Cuisines**, au-dessus de « Composants ». Formulaire : Image, Nom de la
   cuisine, Nom du responsable, Email responsable, Tél. responsable, Adresse de livraison, Ville, Code
   postal, Espaces rattachés (choix multiple), Note. **Même design et même process que Fournisseurs.**
2. **Fiche Composant** : un champ **Image** tout en haut de la colonne « Détails du composant », un
   champ **Espace** (choix multiple) sous le nom.
3. **Cuisine** : sortir le champ de la condition « Prêt à la vente = Oui », le mettre dans le bloc
   « Informations d'inventaire », avec les options « Cuisine Locale » ou les cuisines de Settings.
   **Supprimer le champ « Prêt à la vente »** de la fiche composant.
4. **Filtre Espace** dans la Bibliothèque de composants.
5. Les utilisateurs à **accès restreint** ne voient que les composants qui les concernent.
6. **Fiche Menu Item** : le champ Cuisine prend les mêmes options que les composants.

## 2. Décisions (validées par Ulrich le 2026-10-08)

| # | Question | Décision |
|---|---|---|
| 1 | L'option « Cuisine Centrale » disparaît : que deviennent les fiches qui l'ont (prod : 6 composants, 2 menu items) ? | **A** : la migration crée par client une cuisine « Cuisine Centrale » rattachée à tous ses espaces et y relie ces fiches. Renommable ensuite. |
| 2 | Composant sans espace face à un compte restreint (prod : 105 composants, aucun n'a d'espace) | **B** : sans espace = **commun**, visible de tous. Un compte restreint voit les communs + ceux de ses espaces. |
| 3 | Liste des cuisines dans la fiche composant | **A** : si le composant a des espaces, seules les cuisines rattachées à l'un d'eux. La valeur déjà choisie reste toujours proposée. |
| 4 | Champs obligatoires | Cuisine : **nom + espaces**, le reste facultatif. Composant : espaces **facultatifs** (cohérent avec 2B). |
| 5 | Droit d'accès à la section Cuisines | Réutilise **`menu.fb.components`** (un droit dédié n'aurait été accordé à aucun rôle existant). Lecture `GET /kitchens` ouverte à tout utilisateur connecté (choix de la fiche Menu Item). |
| 6 | Filtre Espace de la bibliothèque | Un espace sélectionné montre **ses composants + les communs** (même règle que le serveur pour les comptes restreints). |
| 7 | « Prêt à la vente » des composants | Champ retiré de la fiche, **valeur conservée en base** et toujours copiée à la duplication. Aucun calcul ne la lit plus pour un composant (décision Q13 « on ne décompose plus un composant », `logistics.service.ts` BUG-260-02). |
| 8 | Fiche Menu Item | Le champ Cuisine **reste conditionné à « Prêt à la vente = Oui »** (Bertrand n'a demandé que de changer les options). |

## 3. Modèle de données

Migration `backend/prisma/migrations/20261008120000_kitchens_component_spaces/migration.sql` :

- **`Kitchen`** : `name`, `picture`, `contactName`, `email`, `tel`, `address` (livraison), `city`,
  `postcode`, `sites String[]` (ids d'espaces, **même contrat que `Supplier.sites`**), `notes`,
  `tenantId`. Isolation tenant automatique (`PrismaService`, modèle avec `tenantId`).
- **`MenuComponent`** : `picture String?`, `spaceIds String[] @default([])` (vide = commun),
  `kitchenId String?` (FK `Kitchen`, `ON DELETE SET NULL`).
- **`MenuItem`** : `kitchenId String?` (FK `Kitchen`, `ON DELETE SET NULL`).
- **Reprise** : une cuisine `kitchen_central_<md5(tenantId)>` « Cuisine Centrale » par client ayant
  des fiches `kitchenType = 'Central'`, rattachée à tous ses espaces ; ces fiches reçoivent son
  `kitchenId`. Id déterministe et `ON CONFLICT DO NOTHING` : rejouable sans doublon.

**Codage de la cuisine** (inchangé pour l'enum, `KitchenType { Central, Local }`) :

| Choix dans le champ | `kitchenType` | `kitchenId` |
|---|---|---|
| Cuisine Locale | `Local` | `null` |
| Une cuisine de Settings | `Central` | id de la cuisine |
| Vide | `null` | `null` |

Règle unique côté serveur : `backend/src/shared/utils/resolve-kitchen.ts` (`resolveKitchenFields`),
utilisée par les composants **et** les menu items. Une cuisine d'un autre client est refusée (400).
`Central` sans cuisine n'a plus de sens : le champ est vidé. Côté front :
`frontend/src/composables/useKitchenOptions.js` (`kitchenChoiceFrom`, `kitchenPayloadFrom`,
`buildKitchenOptions`, CSV `kitchenCsvLabel` / `kitchenChoiceFromCsv`).

## 4. Backend

- **Module `kitchens`** (`backend/src/features/kitchens/`) : CRUD `/kitchens` calqué sur
  `suppliers`. Écriture sous `menu.fb.components`. Compte restreint : liste filtrée
  `sites hasSome <ses espaces>`, lecture / modification / suppression refusées (403) hors de ses
  espaces, création seulement sur ses espaces. Image : `SupabaseStorageService.resolveImage(...,
  'kitchens')`. **Suppression** : les composants et menu items rattachés perdent leur cuisine
  (`kitchenId` et `kitchenType` à `null`, même transaction), pas de « Central » orphelin.
- **`menu-components`** :
  - DTO : `picture`, `spaceIds`, `kitchenId` (en plus de `kitchenType`).
  - `findAll(tenant, page, limit, user)` : compte restreint = `OR [spaceIds vide, spaceIds hasSome
    <ses espaces>]`. Le périmètre entre dans la **clé de cache Redis**
    (`menu-components:<tenant>:list:<all|s:ids triés>:<page>:<limit>`) ; `invalidateCache` purge
    toujours `menu-components:<tenant>:*`.
  - `findOne` / `update` / `remove` / `PUT :id/ingredients|children` : 403 si le composant n'est
    ni commun ni dans un espace accessible. Création / modification : un compte restreint ne
    rattache un composant qu'à ses propres espaces.
  - Appel interne **sans utilisateur** (catalogue invité PIN, `guest-pin-access.service.ts`) :
    aucun filtre, comportement inchangé.
- **`menu-items`** : `kitchenId` au DTO ; `create`, `bulkCreate` (import CSV) et `update` passent
  par `resolveKitchenFields`.

## 5. Front

- **Section Cuisines** : `components/menu-fb/views/kitchens/` (`KitchensListView`,
  `KitchenFormDrawer`, `KitchenDeleteDialog`), générés depuis les écrans Fournisseurs (mêmes
  classes et styles), store `store/modules/kitchens.js` (même pattern que `suppliers.js`, TTL
  15 min, pagination complète), API `api/endpoints/kitchens.api.js`. Route `/menu-fb/kitchens`
  (lazy), entrée de menu `navKitchens` au-dessus de Composants, en-tête `hdrSecKitchens`.
- **Fiche Composant** (`ComponentCreateView.vue`) : composants extraits plutôt qu'ajoutés au
  fichier (déjà ~1 950 lignes) : `components/menu-fb/common/PictureField.vue`,
  `SpaceMultiSelect.vue`, `KitchenSelect.vue`. « Prêt à la vente » et l'ancien champ Cuisine
  conditionnel retirés ; la cuisine est dans la carte « Informations d'inventaire ».
- **Bibliothèque** (`componentListView.vue`) : filtre « Tous les espaces » avant catégories et
  types ; règle dans `utils/componentSpaces.js` (`componentMatchesSpace`).
- **Fiche Menu Item** (`MenuItemCreateView.vue`) : options = `buildKitchenOptions` (mêmes que
  composants, filtrées par les espaces de l'article), libellé « Cuisine ».
- **CSV menu items** : export de la colonne Kitchen Type = `Local` ou **nom de la cuisine** ;
  import : `Local` / `Cuisine Locale` / nom de cuisine (casse libre), ancien `Central` = la cuisine
  « Cuisine Centrale » de la reprise, inconnu = champ vide.
- **Duplication** : composant (image, espaces, cuisine) et menu item (`kitchenId`) copiés.

## 6. Tests

- Backend (un fichier à la fois, `--runInBand`) : `kitchens/kitchens.service.spec.ts` (7),
  `menu-components/menu-components.spaces.spec.ts` (12), `shared/utils/scoped-spaces.spec.ts` (4), `menu-components.service.spec.ts` (4),
  `menu-items.bulk-create.spec.ts` (5) ; `tsc --noEmit -p tsconfig.build.json` sans erreur.
  `menu-items.product-categories.spec.ts` : 2 échecs **préexistants** (aussi sur `production`, sans
  rapport).
- Front : `tests/unit/kitchensComponents.spec.js` (16).

## 7. Points d'attention

- **Comptes restreints** : la règle 2B rend tout composant sans espace visible de tous. Pour
  qu'un composant soit réservé, il faut lui renseigner ses espaces.
- **`Supplier.sites` vide** est interprété « aucun espace » (réservé aux accès complets), alors
  que **`MenuComponent.spaceIds` vide** veut dire « commun ». Contrats volontairement différents
  (décision 2B), à ne pas confondre.
- **Image** : envoyée en data URI, posée sur Supabase Storage par le serveur
  (`SUPABASE_STORAGE_BUCKET`). Sans Storage configuré, l'enregistrement d'une nouvelle image échoue
  (400), comme pour les fournisseurs.

## 7 bis. Relecture par agent (2026-10-08) et corrections

Les 6 points de la demande sont confirmés faits. Corrigé à la suite :

1. **Composant partagé par plusieurs espaces** (bloquant) : un compte restreint à A ne pouvait plus
   enregistrer un composant A + B (403), et le champ affichait l'id brut de B. Désormais : il
   n'**ajoute** que ses espaces, ceux qu'il ne voit pas sont **conservés** côté serveur
   (`shared/utils/scoped-spaces.ts`, `mergeScopedSpaces`, aussi pour les cuisines) et masqués mais
   gardés dans la valeur côté front (`SpaceMultiSelect.vue`). La duplication ne recopie que ses
   espaces (`buildComponentDuplicatePayload`, option `allowedSpaceIds`).
2. **Cuisine hors de la liste chargée** : composant et menu item renvoient `kitchen { id, name }` ;
   le champ affiche le nom au lieu de l'id (`buildKitchenOptions`, paramètre `currentKitchen`).
3. **Suppression d'une cuisine** : purge des caches Redis `menu-components:<tenant>:*` et
   `menu-items:<tenant>:*`.
4. **Création de cuisine par un compte restreint** : tous les espaces doivent être les siens (avant,
   un seul suffisait).
5. **CSV menu items** : l'export et l'import attendent la liste des cuisines ; le store `kitchens`
   partage le chargement en cours (un second appel attend au lieu de rendre la main à vide).

Laissé tel quel (conforme à la décision 2B) : un compte restreint peut enregistrer un composant
sans espace, qui devient commun. À confirmer par Bertrand (question #71).

## 8. Reste à faire

1. Test navigateur par Ulrich (Settings > Cuisines, fiche composant, bibliothèque, compte restreint,
   fiche menu item, import / export CSV).
2. Commit, puis merge `develop` → `staging` → `production` sur demande explicite.
3. En production, la migration s'applique au démarrage (`prisma migrate deploy`, `render.yaml`).
   Vérifier ensuite : une cuisine « Cuisine Centrale » par client concerné, 6 composants et 2 menu
   items reliés.
