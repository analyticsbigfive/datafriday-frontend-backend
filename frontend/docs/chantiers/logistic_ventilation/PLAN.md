# Chantier : Ventilation Logistique, feuille « à déposer » et QR logisticiens (demande Bertrand du 2026-10-08)

Statut (2026-10-09) : **parties 1 à 4 codées** sur `feat/logistic-ventilation` (créée depuis
`production` `402e0252`), **non commitées**. Migrations `20261008180000_stock_movement_reason_ventilation`,
`20261009090000_ventilation_guest_access` et `20261009120000_stock_movement_reversal_unique` appliquées sur la base **locale** uniquement. Toutes les
questions (#72 à #82) sont tranchées (§3.5, §4.5). Reste : test navigateur par Ulrich, relecture,
commit et déploiement sur demande explicite.

Source : message de Bertrand du 2026-10-08 et 3 captures annotées (onglet By Item de Logistique, un
article déplié, fiche du stockage Container HK).

---

## 1. Ce que demande Bertrand

1. **QR code sur la page Logistique** qui ouvre la feuille de réarmement des logisticiens, **par
   article**, avec **seulement les éléments à déposer** sur les PDV (les articles sans rien à déposer
   n'apparaissent pas). Colonnes : nombre à déposer, nombre de PDV concernés.
2. **Article déplié** : chaque destination avec le nombre requis et un bouton qui **valide le dépôt**
   en ouvrant un drawer à droite (quantité déposée modifiable, bouton « Confirmer »).
3. **Fiches des PDV dans Logistique** : remplacer « Besoin prédit » par le **nombre à déposer**, tant
   que le dépôt n'est pas fait.
4. **Bouton « Ventilation »** à côté du QR code : montre dans Logistique les mêmes informations que
   la page ouverte par le QR.
5. **Bug** : la liste des utilisateurs semble s'arrêter à 20.

## 2. Constat dans le code (avant chantier)

| Sujet | Constat |
|---|---|
| Onglet By Item | `LogisticByItemView.vue` mélange PDV et stockages, toutes lignes confondues. La colonne « 0 Pc / 654 Pc vrac » est le **stock actuel**, pas ce qu'il faut déposer. « N PDV concernés » compte toutes les lignes. |
| « Besoin prédit » | `SpaceLogisticView.fetchPredictedNeed` : priorité à la feuille de réarmement du match (`RestockPlan.restockLines.restockQuantity`, packs natifs `packaging.packedCount`), sinon repli sur la prévision brute Event Predict. |
| Corrections manuelles | **Bug latent** : Logistique lisait `restockLines` sans appliquer `lineOverrides` (l'écran Réarmement les applique via `applyPlanEdits`). Sans effet en prod au 2026-10-08 : 0 plan sur 6 a des corrections. |
| Dépôt déjà fait | Il existe déjà une case « réarmé » par ligne dans l'écran Réarmement (`RestockPlan.restockedRows`, booléen par `rowKey`). Aucune trace de **quantité** déposée. |
| QR existants | `/login/pin/:slug` lié à **une fenêtre d'inventaire × un élément** (PDV ou stockage). Rien au niveau espace. |
| Utilisateurs | `GET /users` paginé côté serveur (`limit` 20 par défaut, 100 au plus) ; le front n'envoyait ni page ni limite, donc seuls les 20 plus récents s'affichaient. |

**Vérifié en base prod (lecture seule, 2026-10-08)** : sur la dernière feuille de La Beaujoire
Nantes (« Nantes-Nancy - 1 », 179 lignes), les destinations sont 14 éléments dont **Container HK**
(15 lignes) et « Océane Brassés Container ». Les destinations de la feuille de réarmement font donc
foi pour « à déposer » ; pas besoin de filtrer PDV contre stockages. Question retirée de la liste
Bertrand.

## 3. Règle « à déposer » (partie 1)

Calcul unique dans [`src/utils/restockDepositSheet.js`](../../../src/utils/restockDepositSheet.js),
lu par la vue Ventilation, les fiches article et By Item :

1. Feuille de réarmement dont `selectedEventIds` contient le match visé (`?event=` ou prochain match
   de l'espace), comme avant.
2. Corrections manuelles appliquées (`applyPlanEdits(restockLines, lineOverrides)`).
3. Lignes à quantité 0 retirées, lignes cochées « réarmé » (`restockedRows`) retirées.
4. Quantité affichée : packs décidés au réarmement (`packaging.packedCount`) en priorité, sinon
   quantité dans l'unité de l'article.

Une feuille **entièrement déposée ne retombe plus sur la prévision Event Predict** (avant : index
vide, donc repli sur la prévision brute).

## 4. Livré dans la partie 1 (sans attendre Bertrand)

| # | Changement | Fichiers |
|---|---|---|
| 1 | Bug 20 utilisateurs : `getUsers` parcourt toutes les pages (`limit=100`). | `src/api/endpoints/user.api.js` |
| 2 | Calcul « à déposer » (règle §3) + test unitaire (5 cas). | `src/utils/restockDepositSheet.js`, `tests/unit/restockDepositSheet.spec.js` |
| 3 | Bouton **Ventilation** après les onglets, vue par article dépliable, uniquement ce qui reste à déposer, avec le nom de la feuille source. Messages : « Aucune feuille de réarmement enregistrée pour ce match » et « Tout a été déposé ». | `LogisticVentilationView.vue` (nouveau), `SpaceLogisticView.vue`, `i18n/translations.js` |
| 4 | Fiche article et By Item : libellé **« À déposer »** quand le chiffre vient de la feuille de réarmement ; « Besoin prédit » conservé pour le repli prévision. | `LogisticItemCard.vue`, `LogisticByItemView.vue` |
| 5 | Corrections manuelles de la feuille désormais prises en compte dans Logistique (bug latent §2). | `SpaceLogisticView.vue` via `restockDepositSheet.js` |

## 4 bis. Livré dans la partie 2 (après les réponses de Bertrand)

| # | Changement | Fichiers |
|---|---|---|
| 1 | Message d'attente « En attente de la feuille de ventilation pour cet événement » + lien « Ouvrir Event Predict pour cet événement » (utilisateurs connectés ayant `front.fb.eventPredict`). | `LogisticVentilationView.vue`, `SpaceLogisticView.vue` (`eventPredictRoute`) |
| 2 | Nouvelle raison de mouvement **`VENTILATION`** : ajout seulement, `eventId` obligatoire et enregistré sur le mouvement. Migration d'enum seule. | `prisma/schema.prisma`, migration `20261008180000_…`, `logistics.dto.ts`, `logistics.service.ts` |
| 3 | `GET /logistics/:spaceId/ventilation-deposits?eventId=` : cumul des dépôts du match par élément × article (index existant `tenantId, spaceId, eventId`). | `logistics.controller.ts`, `logistics.service.ts` |
| 4 | Reste à déposer = feuille − dépôts : packs convertis avec la taille de pack Logistic (repli : conditionnement de la ligne), dépôt partiel = ligne réduite et packs recalculés, surplus reporté sur la ligne suivante du même couple. | `utils/restockDepositSheet.js` |
| 5 | Bouton « + » sur chaque ligne de la Ventilation, drawer « Confirmer le dépôt » (packs et vrac pré-remplis, modifiables), mouvement `VENTILATION` sur la destination, puis recalcul. Drawer sans dépendance au store, réutilisable par la page invitée. | `drawers/LogisticDepositConfirmDrawer.vue`, `LogisticVentilationView.vue`, `SpaceLogisticView.vue` |
| 6 | Libellé « Ventilation » dans l'historique des mouvements. | `LogisticHistoryDrawer.vue`, `translations.js` |
| 7 | **Décision Ulrich** : un dépôt `VENTILATION` après la fin réelle du match déclenche, comme une livraison, l'arrêt du post-event et le démarrage du pre-event suivant (il remplit les PDV, un comptage post-event fait ensuite serait faussé). | `inventory-cycle.cron.ts` (+ spec) |

Tests : `restockDepositSheet.spec.js` 9/9 ; `logistics.service.spec.ts` 4 nouveaux tests verts (13 échecs
**préexistants**, identiques sur le code d'origine, sur `itemRefsForMenuItem`/`getStock`) ;
`inventory-cycle.cron.spec.ts` 12/12 ; `tsc --noEmit` backend propre.

Limites connues :
- La quantité de la feuille est dans l'unité de la ligne de réarmement ; le dépôt est en packs/vrac
  Logistic. On suppose la même unité de base (déjà le cas du netting Réarmement ↔ Logistic).
- Dépôts lus pour le match visé seulement ; une feuille multi-match impute tout à ce match.

## 5. Reste à faire

### Partie 3 : accès PIN des logisticiens (réponse #72 : PIN, sans login DataFriday)

Analyse détaillée du 2026-10-08 (code lu, rien de modifié).

#### 3.1 Ce que fait le PIN aujourd'hui

| Brique | Comportement | Référence |
|---|---|---|
| Fenêtre | `InventoryWindow` par espace × match × phase (`pre-event`/`post-event`), un PIN partagé par fenêtre (HMAC unique global + copie chiffrée). | `schema.prisma` (InventoryWindow), `assignPin` |
| QR | `/login/pin/:slug`, slug porté par **l'élément** (`SpaceElement.slug`). L'espace n'a pas de slug. | `resolveElementBySlug`, `GuestPinQrDialog.vue` |
| Login | Le slug désigne l'élément, le PIN désigne la fenêtre (`findFirst` par `spaceId` + `pinLookupHash`), une ligne `GuestPinAccess` (fenêtre × élément) est créée au premier login, JWT `sub = access.id` (TTL 1 j). | `login` |
| Jeton | `JwtGuestPinStrategy` relit l'accès à chaque requête (révocation immédiate) et expose `phase`, `elementId`, `eventId`. | `jwt-guest-pin.strategy.ts` |
| Routes invitées | `catalog`, `inventory`, `inventory/counts`, `element-complete`, `submit` : toutes supposent un comptage d'inventaire. | `guest-pin-auth.controller.ts` |
| Front | `PinLoginView` route vers `guest-pre-inventory` ou `guest-inventory` selon `result.phase` ; session dans `store/modules/guestPin.js`, garde `requireGuestPinSession`. | `PinLoginView.vue:205`, `router/index.js` |

#### 3.2 Risques si l'on ajoute une phase « ventilation » sans précaution

1. **`isElementReachable` et `login` ne filtrent pas la phase** : une fenêtre ventilation ouverte
   rendrait « actif » le QR de **chaque PDV**, et le PIN ventilation saisi sur un QR de PDV ouvrirait
   une session sur ce PDV avec la phase `ventilation`.
2. **Les routes d'inventaire invitées ne vérifient pas la phase** (`saveCount` force
   `user.phase as 'pre-event' | 'post-event'`) : un jeton ventilation pourrait écrire des comptages.
3. **`getStatusBoard`** liste toutes les fenêtres du match : la ventilation apparaîtrait dans le
   tableau de bord de l'inventaire.
4. Les crons (`inventory-cycle`, `inventory-window-lifecycle`), `stopOtherPhase`, `startElement`
   et la clôture (`closeInventoryWindows`) filtrent déjà la phase : pas de risque.

#### 3.3 Conception proposée (décisions techniques Ulrich)

- **Fenêtre** : `InventoryWindow` de phase `ventilation` (même PIN, même anti brute force, même
  révocation). Un PIN par match, comme l'inventaire.
- **QR stable par espace** : nouveau `Space.ventilationSlug` unique (préfixé, par exemple
  `ventil-<nom>`), un seul QR à afficher en zone logistique, valable de match en match ; seul le PIN
  change. `resolveElementBySlug` est complété par une résolution « slug d'espace ».
- **Accès** : une ligne `GuestPinAccess` par fenêtre ventilation, `elementId` = id de l'espace
  (pas de clé étrangère sur ce champ ; valeur sentinelle documentée), ce qui garde l'unicité
  `(windowId, elementId)` et la stratégie JWT telles quelles.
- **Verrous de phase** (obligatoires, couvrent les risques 1 à 3) : `isElementReachable`, `login`
  (QR d'élément) et `getStatusBoard` limités à `pre-event`/`post-event` ; garde `phase` sur chaque
  route d'inventaire invitée ; routes ventilation refusées hors phase `ventilation`.
- **Routes invitées ventilation** :
  - `GET /guest-pin/ventilation` : lignes restant à déposer pour `user.eventId`, calculées **côté
    serveur** (feuille du match, `lineOverrides`, `restockedRows`, dépôts `VENTILATION`). Le calcul
    de `restockDepositSheet.js` est porté en TypeScript et le front connecté passe aussi par cette
    route, pour garder une seule source de vérité.
  - `POST /guest-pin/ventilation/deposits { rowKey, packed, loose }` : le serveur retrouve la ligne
    dans la feuille, en déduit destination et article (nom Logistic par correspondance normalisée),
    crée le mouvement `VENTILATION`. **Un invité ne peut déposer que ce qui figure sur la feuille**,
    jamais un mouvement libre. `createdBy = guest:<accessId>`.
- **Front** : route `guest-ventilation` (`/pdv/ventilation`), page mobile réutilisant
  `LogisticVentilationView` et `LogisticDepositConfirmDrawer`, sans lien Event Predict, message
  « En attente de la feuille de ventilation pour cet événement ». `PinLoginView` route selon la phase.
- **Logistique** : bouton QR à côté de « Ventilation » (dialogue réutilisant `GuestPinQrDialog`,
  avec le PIN du match, boutons Générer / Reset / Arrêter).

#### 3.4 Lacune trouvée au passage

Aucun moyen d'**annuler ou corriger un dépôt** aujourd'hui (connecté ou invité) : un dépôt saisi en
trop reste compté dans « déjà déposé ». Un retrait manuel corrige le stock mais pas le reste à
déposer. À traiter avec la partie 3 (question 76).

#### 3.5 Décisions (partie 3), tranchées ou déduites le 2026-10-08

| # | Question | Décision |
|---|---|---|
| 75 | Quand l'accès ventilation est-il ouvert et fermé ? | Ouverture manuelle (bouton QR de Logistique) ; fermeture automatique à la **fin réelle du match** (on dépose aussi pendant le match) ; ouvrir le match suivant ferme le précédent ; arrêt manuel possible. |
| 76 | Qui peut annuler un dépôt saisi par erreur ? | Annuler = mouvement inverse « Ventilation » (registre jamais effacé). Le logisticien sur ses propres dépôts tant que son accès est ouvert ; un utilisateur Logistique sur tout dépôt. |
| 77 | Un QR fixe par espace ou un QR par match ? | QR fixe, seul le PIN change (règle « un seul lien par PDV »). |
| 78 | Le logisticien saisit-il son prénom ? | Oui, une fois à la connexion, gardé sur l'appareil, enregistré sur chaque dépôt (PIN partagé). |

Estimation : 2 à 3 jours (backend 1,5 j avec tests, front 1 j, recette).

### Partie 4 : stockages dans le réarmement (réponse #4)

Analyse détaillée du 2026-10-08 (code lu, base prod en lecture seule, rien de modifié).

#### 4.1 Ce qui existe déjà

- L'étape 1 « Éléments à stocker » (`srItemsToStock`) a **deux onglets** : « PDV à stocker » et
  « Espaces de stockage » (`SpaceRestockView.vue:369-391`).
- L'onglet stockage calcule déjà un **réassort par stockage × article** (`storageRestockGroups`,
  `:2342`) : tampon = `ElementInventory.quantity` (saisi dans le Builder, par config), restant =
  stock Logistic du stockage, nécessaire = max(0, tampon − restant) × % (`storagePercents`, %
  global, `effectiveStoragePercent` dans `utils/storageRestock.js`). Décisions JLH du 2026-08-11 :
  [`bugs/314_01_rearmement_espaces_de_stockage.md`](../../bugs/314_01_rearmement_espaces_de_stockage.md).
- Ce réassort ne va **que dans la feuille de course** (`storageRefillLines`, `:2500`, injecté dans
  `nettedShopping`, `:3262`). Il ne produit **aucune ligne `restockLines`**, donc rien dans la
  Ventilation, et il n'est pas figé dans le plan (seuls les réglages, dans `meta.storage`).
- Les lignes de réarmement (étape 2) ne visent que les éléments `shop`/`hospitality`/`kitchen`
  ayant une prévision (`collectFbElements`, `stockPlanning.js:75`).

#### 4.2 Données prod (2026-10-08)

| Constat | Valeur |
|---|---|
| « Container HK », « Océane Brassés Container » (La Beaujoire) | typés **`shop`** : ce sont des PDV avec prévision, pas des stockages |
| « Réserve grotte », « Réserve Oceanne » | typés `storage` |
| Lignes de tampon `ElementInventory` dans toute la base | **8**, dont 6 > 0, sur 4 stockages (Réserve Oceanne : 2, Réserve grotte : 0) |

Conséquence : reprendre le tampon du Builder tel quel ne produirait presque aucune ligne
aujourd'hui. Il faut soit le faire saisir, soit une règle de repli.

#### 4.3 Pièges identifiés

1. **Double comptage dans la feuille de course** : `shoppingSupplierGroups` additionne toutes les
   lignes de réarmement ; y ajouter les lignes stockage ET garder `storageRefillLines` achèterait le
   tampon deux fois. Il faut un seul chemin vers l'achat.
2. **Netting** : le stock des stockages sert déjà à réduire les achats des PDV (`consumeFromPool`).
   Remplir le stockage tout en « prêtant » son stock aux PDV n'est cohérent que si un transfert
   stockage → PDV existe ; or la réponse #74 dit qu'un dépôt crédite le PDV sans sortie de
   stockage. Rejoint la question 54 (restant brut ou après netting), toujours ouverte.
3. **Consommateurs de `restockLines`** à adapter : regroupements et compteurs de l'écran
   Réarmement (une ligne stockage serait classée « non rattachée », faute de menu), CSV,
   `markAllVisibleRestocked`, `buildRecipeCoeffs`, `recomputeShoppingFromOverrides`, et
   `buildRestockNeedIndex` (le « Besoin prédit » des stockages en Inventaire afficherait le
   réassort). La Ventilation, elle, accepte déjà une destination stockage sans changement.
4. `freezeRestockLine` est une liste blanche : il faut un champ `elementType` et un `rowKey`
   distinct (`storage|||elementId|||itemKey`).
5. Incohérence vue au passage : `SHOP_TYPES` du backend Logistic (`logistics.service.ts:35`)
   ignore `hospitality`/`kitchen`, que le Réarmement traite comme des PDV.

#### 4.4 Options

| Option | Principe | Pour | Contre |
|---|---|---|---|
| **A (recommandée)** | Chaque ligne de l'onglet « Espaces de stockage » avec un nécessaire > 0 devient une ligne de réarmement `elementType: 'storage'` (quantité arrondie au colis), figée dans le plan ; le réassort sort de `storageRefillLines` pour passer par le même chemin d'achat que les PDV. | Tout le calcul existe déjà ; frontend seul ; Ventilation inchangée ; corrections « À déposer » possibles sur ces lignes. | Dépend de la saisie du tampon dans le Builder (quasi vide en prod) ; question 54 à trancher. |
| B | Tampon = X % du besoin des PDV servis par le stockage (`storageShopIds`), moins le restant. | Aucune saisie ; suit la prévision. | Répartition si un PDV dépend de plusieurs stockages ; PDV non rattachés exclus ; change le sens des % existants. |
| C | A, avec repli B quand aucun tampon n'est saisi. | Couvre les deux cas. | Plus lourd, deux règles à expliquer. |

Estimation option A : 2 jours (front Réarmement + photo figée + tests), plus la saisie des tampons
par le client.

#### 4.5 Décisions (partie 4), déduites de la réponse #4 de Bertrand le 2026-10-08

| # | Question | Décision |
|---|---|---|
| 79 | D'où vient le stock tampon d'un stockage : uniquement de la saisie dans le Builder (quasi vide aujourd'hui), ou d'un % du besoin des PDV qu'il sert quand rien n'est saisi ? | Builder uniquement (« selon les Éléments à stocker »), option A ; la saisie des tampons est à faire par le client. |
| 80 | (question 54) Le réassort d'un stockage se calcule-t-il sur son stock brut, ou après ce qu'il « prête » aux PDV ? | Stock brut, comportement actuel conservé. |
| 81 | Container HK et Océane Brassés Container sont des PDV dans la configuration. Restent-ils des PDV (ventes + dépôts), ou faut-il les passer en stockage ? | Ils restent des PDV. |
| 82 | Le réassort d'un stockage doit-il être modifiable dans l'étape 2 comme les PDV (« À déposer » corrigé), et figurer dans la feuille de ventilation ? | Oui aux deux. |

## 5 bis. Livré dans les parties 3 et 4 (2026-10-09)

### Verrous de phase PIN (protège aussi l'inventaire actuel)

- `INVENTORY_PHASES` / `isInventoryPhase` / `VENTILATION_PHASE` (`inventory-window-period.ts`).
- `isElementReachable`, `login` (QR d'élément) et `getStatusBoard` ne lisent plus que les fenêtres
  d'inventaire ; `getInventory`, `getCatalog`, `saveCount`, `notifyElementComplete`, `submitCount`
  refusent un jeton qui n'est pas d'inventaire (`assertInventorySession`, testé).
- Front : `requireGuestPinSession` renvoie chaque session vers l'écran de sa phase
  (`guestRouteForPhase`, testé).

### Partie 3 : accès PIN ventilation

| Brique | Fichiers |
|---|---|
| Migration : `Space.ventilationSlug` (unique), `StockMovement.reversesMovementId` | `20261009090000_ventilation_guest_access` |
| Service dédié (ouverture, arrêt, nouveau PIN, slug d'espace `ventilation-<espace>-<6 hex>`, login par slug d'espace, feuille, dépôt par `rowKey`, annulation) | `guest-pin-access/ventilation-access.service.ts` (+ spec 10 tests) |
| Routes Logistique `ventilation-access/{spaces/:id,start,stop,reset-pin}` (droit `front.fb.logistic`) | `ventilation-admin.controller.ts` |
| Routes invitées `GET /guest-pin/ventilation`, `POST /guest-pin/ventilation/deposits`, `POST …/deposits/:id/cancel` ; `context`/`login` essaient d'abord le slug d'espace | `guest-pin-auth.controller.ts`, `dto/ventilation.dto.ts` |
| Briques PIN partagées (limite de tentatives, recherche par PIN, jeton) exposées, pas dupliquées | `guest-pin-access.service.ts` |
| Fermeture automatique à la fin réelle du match (même règle que le pre-event) | `inventory-window-lifecycle.cron.ts` (+ spec) |
| Annulation par mouvement inverse, liste des dépôts, nom Logistic d'un article résolu côté serveur | `logistics.service.ts` (`cancelVentilationDeposit`, `listVentilationDeposits`, `resolveElementItemKey`), routes `ventilation-movements`, `movements/:id/cancel-ventilation` |
| Front Logistique : bouton QR à côté de « Ventilation », dialogue d'accès (démarrer, arrêter, nouveau PIN, QR via `GuestPinQrDialog`), liste « Déjà déposé » avec annulation en deux clics | `dialogs/LogisticVentilationAccessDialog.vue`, `LogisticVentilationDeposits.vue`, `SpaceLogisticView.vue` |
| Front logisticien : `/pdv/ventilation`, prénom demandé une fois, mêmes composants que Logistique, relecture toutes les 30 s | `views/GuestVentilationView.vue`, `composables/useGuestVentilation.js`, `router/index.js`, `PinLoginView.vue` |

Sécurité : un invité ne dépose que sur une ligne de la feuille du match (destination et article lus
côté serveur), n'annule que les dépôts saisis avec son accès, et ne reçoit de la feuille que les
champs utiles (ni prix, ni détail des recettes).

### Partie 4 : stockages dans le réarmement (option A)

- `utils/storageRestockLines.js` (+ spec 8 tests) : chaque ligne de l'onglet « Espaces de stockage »
  avec un nécessaire > 0 devient une ligne d'étape 2 `elementType: 'storage'`, arrondie au colis.
- `SpaceRestockView.vue` : lignes ajoutées à l'étape 2 (`liveStorageRestockRows`), exclues de la
  feuille de course tirée des lignes (`shoppingSupplierGroups`), achat toujours via le réassort
  injecté après netting, qui lit désormais la quantité arrondie de ces lignes ; jamais classées
  « non rattachées » ; hors du compteur de PDV.
- Photo figée : `elementType` conservé, `storageRefill` / `fromStorageOnly` figés sur les articles de
  feuille de course, coefficients `refill` (`storageRefillCoeffs`) : une correction « À déposer » sur
  une ligne stockage modifie le réassort, jamais le besoin PDV. Corrige au passage une perte du
  réassort au rejeu des corrections (plans enregistrés après ce changement seulement).
- Ventilation : une ligne stockage rejoint le groupe de l'article PDV du même nom, icône entrepôt.

Comportement modifié à signaler : le réassort acheté pour un stockage est désormais arrondi au colis
(avant : quantité exacte), pour que « déposé » et « acheté » coïncident.

## 5 ter. Corrections après revue indépendante (2026-10-09)

| Constat de la revue | Correction |
|---|---|
| Un logisticien pouvait annuler les dépôts des autres (accès PIN partagé) | Auteur d'un dépôt invité = accès + empreinte de l'appareil (`X-Guest-Device-Id`, `utils/guestDeviceId.js`) ; l'annulation exige le même appareil |
| « N PDV concernés » masqué sur téléphone, stockages comptés comme PDV | Pastilles passées sous le nom sur mobile ; PDV et espaces de stockage comptés à part |
| Packs côté invité convertis avec la taille du réarmement | Le serveur renvoie les tailles de pack Logistic (`packSizes`) ; règle unique `depositPrefill` pour Logistique et logisticien ; repli de conversion via `packSizeForPackaging` (unité d'achat comprise) |
| Logique ventilation ajoutée dans la vue hôte | `composables/useLogisticVentilation.js` (vue : 48 lignes ajoutées, 142 retirées) ; backend : `logistics/ventilation-deposits.service.ts`, `LogisticsService` ne garde que `writeReversal` et `getElementItems` |
| Saisie aberrante possible, dépôt sur une ligne cochée « réarmé » | Bornes `@Max` sur le dépôt invité ; refus si la ligne est cochée « réarmé » ou corrigée à 0 |
| Double annulation simultanée | Index unique sur `reversesMovementId` (migration `20261009120000_stock_movement_reversal_unique`), erreur « déjà annulé » |
| Annulation connectée sans contrôle d'espace | `writeReversal` vérifie l'accès de l'utilisateur à l'espace du dépôt |
| Réponses invité trop riches | Dépôt et annulation renvoient `{ ok, movementId }` seulement |
| Liste plafonnée faussant « annulé » | L'état annulé est lu pour chaque dépôt affiché |
| Lignes stockage masquées par le filtre de match | Elles portent les matchs de la feuille |
| Logistique ne relisait pas les dépôts faits par QR | Relus toutes les 10 s en mode Ventilation (même cycle que le stock) |
| Em-dash ajouté, commentaire déplacé | Corrigés |

Assumé (documenté) : en Inventaire, le « Besoin prédit » d'un stockage affiche désormais son réassort
(plans enregistrés après ce chantier), cohérent avec la demande « ce qui doit être ventilé pour les
espaces de stockage ».

## 6. Questions posées à Bertrand (2026-10-08)

| # | Question | Réponse de Bertrand (2026-10-08) |
|---|---|---|
| 72 | Qui scanne le QR : un compte DataFriday ou un code PIN comme l'inventaire ? | **PIN** ; l'interface doit servir à des personnes sans login DataFriday. |
| 73 | Pas de feuille de réarmement pour le match : quoi afficher ? | Page vide, « En attente de la feuille de ventilation pour cet événement » (QR) ; dans Logistique, même message **+ lien vers Event Predict** de l'événement. |
| 74 | Les produits déposés sortent-ils d'un stockage ou sont-ils simplement ajoutés au PDV ? | La raison du dépôt prend la valeur **« Ventilation »**. |
| 4 | « À déposer » seulement pour les PDV ? | Les stockages aussi, selon les « Éléments à stocker » du réarmement : le réarmement doit montrer ce qu'il faut ventiler vers les stockages (stocks tampons). Partie 4. |

## 7. Test manuel (partie 1)

1. Utilisateurs : un client avec plus de 20 comptes, `Settings > Utilisateurs` : tous apparaissent.
2. Logistique La Beaujoire avec `?event=e42ceece-e5de-411a-9599-3268bbff7825` (Nantes-Nancy, feuille
   existante) : bouton « Ventilation », articles groupés, nom de la feuille en en-tête.
3. Cocher une ligne « réarmé » dans l'écran Réarmement, mettre à jour la feuille, recharger
   Logistique : la ligne disparaît de la Ventilation et de la fiche du PDV.
4. Un match sans feuille : Ventilation affiche « En attente de la feuille de ventilation… » et le
   lien Event Predict ; les fiches gardent « Besoin prédit ».
5. Sur une ligne de la Ventilation, « + », confirmer : toast « Dépôt confirmé », la ligne baisse ou
   disparaît, le stock du PDV monte, l'historique montre « Ventilation ». Un dépôt partiel laisse le
   reste.
