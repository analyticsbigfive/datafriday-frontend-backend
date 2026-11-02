# Commandes : retours Bertrand du 02/11

Source : slides « Pre et Post event Inventory cycle » (Google Slides, section Commandes) et réponses
de Bertrand du 02/11 relayées par Ulrich. Page concernée :
`src/components/space-workspace/restock/views/SpaceRestockView.vue` (étape 1 « Éléments à stocker »).

## Règles validées (Bertrand, 02/11)

1. Section ÉVÉNEMENTS : uniquement les matchs futurs. Aucune référence aux matchs passés, les
   ventilations passées se retrouvent dans VENTILATIONS SAUVEGARDÉES.
2. S'il n'y a aucune prédiction sur un match futur : lien vers Event Predict pour en faire une.
3. Barre de recherche de l'étape 1 : une icône filtre. Au clic, une ligne apparaît avec Type,
   Catégorie, Fournisseur, Ajustement global.
4. Colonne de gauche : elle doit défiler sur tous les écrans. Le menu déroulant doit s'afficher partout.
5. « RÉSUMÉ STOCKAGE » est renommé « RÉSUMÉ COMMANDE ».
6. En-tête du résumé : CA = CA prédit HT des versions sélectionnées, Marge, Coût = coût de la commande.
7. Case « Inclure le stock » : ajoute au coût ce qu'il faut racheter pour l'onglet STOCK (remise à
   niveau des stocks tampons des stockages). Coût et marge recalculés. Décochée par défaut (maquette).
8. Lignes du résumé : affichage actuel conservé (quantité en gras, montant en dessous).
9. Composants :
   - Type système « Composant » à l'étape 1 (ils n'ont pas de type aujourd'hui).
   - Ils n'apparaissent PAS dans RÉSUMÉ COMMANDE (ils ne s'achètent pas à un fournisseur).
   - Leurs ingrédients y apparaissent et entrent dans le coût total. Un même ingrédient tient sur
     une seule ligne (ail du Chimichurri + ail d'une autre recette).
   - Nouvelle section « COMMANDE COMPOSANTS » sous le résumé : composant, cuisine, unités à
     commander (= « À commander » de l'étape 1), coût calculé depuis la recette du composant.
10. Prix : le Market Price indiqué dans la recette du Menu Item.

## Ce que le code fait déjà (vérifié)

- Prix (règle 10) : déjà respecté. Une ligne d'ingrédient de l'étape 1 a pour identité le
  `marketPriceId` de la ligne de recette (`menuItemExpansion.js:202` via `componentIngredientId`).
  Deux recettes sur le même Market Price = une ligne ; sur deux Market Prices différents = deux
  lignes, chacune à son prix. Le résumé retrouve le prix par cet id (`findStockReference`), le nom
  n'est qu'un repli pour les lignes sans id.
- Coût d'un composant : `MenuComponent.unitCost`, recalculé depuis la recette par le Cost tracking
  (105/106 remplis en base locale). Coût = `unitCost` x « À commander ».
- Cuisine d'un composant : `resolveComponentKitchen` (`utils/componentKitchenOrders.js`).
- Liste des composants à commander : `collectComponentOrders` (même fichier), déjà utilisé par
  l'onglet « Composants par cuisine » de l'étape 3.
- Ingrédients d'un composant : `flattenComponentDef` (`utils/inventoryUtils.js:48`), feuilles
  `{ id (= marketPriceId), unit, qtyFactor }`. Quantité d'ingrédient = À commander x qtyFactor.
- Lignes de l'onglet STOCK : `liveStorageRestockRows` (`buildStorageRestockLines`), quantité
  arrondie au colis, `marketPriceId` porté par la ligne de stockage.
- Article sans prix : compte 0 € (`orderAmount`). Comportement gardé.

## Écarts constatés

- `predictedEvents` (SpaceRestockView ~L2606) garde les matchs passés (commentaire « doit rester
  exploitable », désormais contraire à la règle 1). Tri croissant, défaut = premier = le plus ancien.
- La présence d'une prédiction est lue dans le `localStorage` du navigateur ; la base n'est
  interrogée que pour l'event sélectionné (`syncBddVersions`). Un match prédit sur un autre poste
  n'apparaît pas.
- L'en-tête du résumé affiche « CA » alors que la valeur est le coût de la commande.
- Le résumé ne compte que l'onglet PDV (pas l'onglet STOCK) et liste les composants comme des achats.
- Colonne gauche : `.sr-sidebar` est une colonne flex bornée en hauteur ; ses `v-card` ont
  `overflow: hidden`, donc elles rétrécissent au lieu de déborder et la colonne n'a rien à faire
  défiler sur un écran peu haut. Hypothèse à confirmer au navigateur.
- Menu déroulant invisible : cause non trouvée à la lecture. À reproduire en 1280x720 et 1366x768.

## Découpage

Une branche d'intégration `feat/commandes-retours-0211` depuis `develop`, trois branches de tâche
avec leur worktree. Les tâches A et B sont indépendantes et peuvent tourner en parallèle. C touche
le résumé et la vue : elle part après A et B pour limiter les conflits dans SpaceRestockView.vue.

### Tâche A : événements futurs

Fichiers : nouveau `src/utils/restockUpcomingEvents.js` (+ spec), SpaceRestockView.vue,
RestockEventScenarioPicker.vue, translations.js.

1. Fonction pure `upcomingPredictedEvents({ events, predictedIds, now, timeZone })` : events non
   terminés (`isEventOver`, `utils/eventLifecycle.js`), présents dans `predictedIds`, triés par date
   croissante (le plus proche d'abord).
2. Au chargement : `getEventIdsWithPredictVersions(ids des events futurs)` (`eventPredict.api.js`,
   endpoint `/predict-versions/summary`), résultat dans une donnée `predictedEventIds`. Repli sur le
   localStorage seulement si l'appel échoue. Puis `syncBddVersions` sur ces ids pour avoir les
   versions et le CA prédit de chaque carte.
3. `predictedEvents` passe par la fonction. Retirer le commentaire « doit rester exploitable ».
4. Sélection par défaut et restauration : ne garder que des ids présents dans la liste ; défaut =
   premier de la liste (prochain match). `?event=` d'un match passé ignoré. Le mode « ventes /
   event de référence » (masqué, `v-if="false"`) n'est pas touché.
5. Aucun match futur prédit : message + lien vers `{ name: 'space-predict', params: { spaceId } }`.
6. Tests : passé exclu, match en cours gardé jusqu'à sa fin réelle, tri, liste vide.

### Tâche B : icône filtre + colonne gauche

Fichiers : nouveau `components/space-workspace/restock/components/RestockFilterToggle.vue` (ou
équivalent), SpaceRestockView.vue (bloc AppSearchBar L349-374), restockStep1.css, CSS colonne gauche.
`AppSearchBar` n'est PAS modifié (partagé par toute l'app).

1. Icône filtre à droite de la barre de recherche (slot `filters`). Au clic, ligne sous la barre
   avec `RestockStockFilters` + `RestockGlobalAdjustMenu` sur une ligne (réutilisés tels quels).
   Fermée par défaut. Icône en couleur primaire si un filtre est actif (sinon on ne voit pas que la
   liste est filtrée).
2. Colonne gauche : `.sr-sidebar > * { flex-shrink: 0 }` (cartes Ventilations sauvegardées et
   Événements). Vérifier que la colonne défile.
3. Recette navigateur en 1280x720 et 1366x768 : colonne gauche, ouverture des 4 menus.

### Tâche C : RÉSUMÉ COMMANDE + COMMANDE COMPOSANTS

Fichiers : `src/utils/restockStorageSummary.js` (+ spec), nouveau
`src/utils/restockComponentOrders.js` (+ spec) si la logique composants dépasse quelques fonctions,
RestockStorageSummary.vue, nouveau `RestockComponentOrdersPanel.vue`, SpaceRestockView.vue,
translations.js.

1. Renommage du titre : « RÉSUMÉ COMMANDE ».
2. Type « Composant » : dans `stockItemMetaByItem`, une ligne reconnue comme composant
   (`resolveComponentDef`, même test que `collectComponentOrders`) reçoit `typeName` = libellé i18n
   « Composant ». Le filtre Type le propose alors automatiquement.
3. `buildStorageSummary` :
   - exclut les lignes composant ;
   - ajoute les ingrédients des composants : pour chaque composant, À commander x `qtyFactor` de
     chaque feuille, fusionné avec la ligne directe de même `marketPriceId` et même unité ; le colis
     est recalculé sur la quantité totale (`packagingFor`) ;
   - option `includeStorage` : ajoute les lignes de l'onglet STOCK (`liveStorageRestockRows`, ou
     lignes `elementType === 'storage'` d'un plan chargé), fusionnées par `marketPriceId` ;
   - renvoie `{ total, lines, ... }` ; le total ne compte que ce qui est affiché.
4. En-tête : CA (CA prédit HT, `storagePredictedRevenue`), Marge (`marginPercent(CA, coût)`), Coût.
   Case « Inclure le stock » sous le sous-titre, décochée par défaut, état d'affichage seulement
   (non sauvegardé dans le plan).
5. COMMANDE COMPOSANTS (nouvelle carte sous le résumé, étape 1) : `collectComponentOrders` +
   `resolveComponentKitchen` ; par ligne : nom, cuisine, unités à commander (libellé `buyInfo`),
   coût = `unitCost` x À commander. Total de la carte en en-tête. Masquée s'il n'y a aucun composant.
6. Hydratation des recettes de composants dès l'étape 1 : extraire de `loadMissingRecipes` la partie
   `hydrateSubComponents` dans une méthode appelable seule ; utiliser `hydratedComponents` si rempli,
   sinon `components`.
7. Tests : composant exclu du résumé, ingrédient de composant fusionné avec la ligne directe,
   colis recalculé sur la somme, `includeStorage` on/off, coût composant = unitCost x quantité,
   marge recalculée.

Point d'attention : unités. Une feuille de composant peut être en g quand la ligne directe est en
kg. Fusion seulement à unité identique ; sinon deux lignes. Ne pas convertir sans règle.

## Hors périmètre

- Ouverture du drawer Stockage depuis l'onglet Stock de l'étape 1 : détail attendu de Bertrand.
- La feuille de course en mode Ingrédients (étape 3) part de la demande brute des plats, pas du
  « À commander » de l'étape 1 : les quantités peuvent différer du résumé. Signalé, pas traité ici.

## Règles d'exécution

- Sous-agents Sonnet, un worktree par tâche, budget 130k / 150k, surveilleur
  `python3 scripts/agent-token-watch.py` lancé avant de déléguer.
- Jest : uniquement `scripts/test-serial.sh frontend <un fichier spec>`, un à la fois.
- Pas de build, pas de serveur de dev lancé par les agents.
- Design : tokens de la charte (`docs/CHARTE_GRAPHIQUE.md`), contrôles existants réutilisés, pas de
  texte coupé, pas de tiret cadratin dans les textes.
- Logique dans des fichiers utilitaires ou composants dédiés, pas dans SpaceRestockView.vue.
- Pas de commit, pas de merge, pas de push sans accord explicite d'Ulrich.

## Recette (à faire par Ulrich)

1. Aix Arena : la colonne Événements ne montre que les matchs à venir, le prochain est sélectionné.
2. Navigateur neuf (ou navigation privée) : les mêmes matchs prédits apparaissent.
3. Espace sans prédiction future : lien vers Event Predict.
4. Icône filtre : la ligne s'ouvre, les 4 menus s'ouvrent, icône colorée si un filtre est actif.
5. Fenêtre 1366x768 : la colonne gauche défile.
6. Résumé : titre RÉSUMÉ COMMANDE, CA = CA prédit de la version, Coût, Marge.
7. Cocher « Inclure le stock » : Agitateur bois passe de 10 à 10 + réassort stockage, coût et marge
   bougent.
8. Plat avec Chimichurri : l'ail du Chimichurri est additionné à l'ail direct ; le Chimichurri est
   dans COMMANDE COMPOSANTS avec sa cuisine et son coût, pas dans le résumé.
