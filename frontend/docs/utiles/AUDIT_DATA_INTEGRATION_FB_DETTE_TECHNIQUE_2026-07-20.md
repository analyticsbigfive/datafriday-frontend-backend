# Audit `/data-integration/fb` — dette technique, code mort, a11y, i18n (2026-07-20)

> Compagnon de [`../modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md).
> Les bugs fonctionnels concrets et actionnables issus de cet audit sont documentés
> individuellement dans [`../bugs/`](../bugs/00_INDEX.md) sous **BUG-193 à BUG-221**. Ce document
> liste tout le reste : dette technique, code mort supplémentaire, accessibilité, incohérences
> i18n, duplication — des points réels mais de moindre priorité, groupés ici plutôt qu'en fiches
> individuelles pour ne pas noyer le tracker de bugs.
>
> Méthode : 8 agents en lecture intégrale, un par fichier/groupe de fichiers du domaine
> (`DataIntegrationView.vue`, wizard shell, les 4 étapes, les dialogs de l'étape 4,
> `SyncProgressDialog`/`SyncJobFloatingWidget`, couche API/store + contrat frontend-backend),
> chacun avec citation `fichier:ligne` vérifiée. Rien listé ici n'est un bug bloquant — pour la
> vue d'ensemble priorisée, voir `docs/bugs/00_INDEX.md`.

---

## `DataIntegrationView.vue` (2934 lignes)

- `:1088-1090` `closeDrawer()` — secrets (`cfClientSecret`/`cfWebhookSecret`) jamais nettoyés à la
  fermeture du drawer, restent en mémoire réactive jusqu'à la prochaine ouverture (composant
  `keepAlive`). Hygiène sécurité, 🟡.
- `:1153,1189` — `console.error(msg, err)` logue l'objet Axios complet, qui peut contenir le secret
  en clair soumis (`err.config.data`) plutôt que juste `err.message`. 🟡.
- `:79,124,197,225,229,233,237,317,438,756,767` — chaînes hardcodées éparses en plus de BUG-199 (le
  dialog de suppression), coexistant avec des `t()` sur les éléments voisins. 🟡.
- Aucun `aria-label` sur les boutons icône-seule dans tout le fichier (fermer, retour,
  afficher/masquer secret, copier) — vérifié par grep, 0 occurrence. 🟡.
- `:726-753` — CSV vide/header-seul : `ordersDetected=0` et `rejectedRows=[]` (rien à rejeter) ne
  déclenchent PAS la bannière d'erreur "mapping probablement faux" (condition exige
  `rejectedRows.length`), l'utilisateur voit juste un rapport à zéro sans explication. 🟡.
- `:1245-1246` — pas de détection d'encodage à la lecture du header CSV (`Blob.text()` décode
  toujours en UTF-8 ; un export Excel/Windows en Latin-1 peut produire du mojibake sur les en-têtes
  accentués). 🟡.
- `:1245` — header CSV tronqué à 8 Ko fixes, pas de re-lecture si la ligne d'en-tête dépasse. 🟢.
- `:1365-1554` — `handleSync` : méthode de ~190 lignes cumulant routage legacy/job, gestion des
  étapes, polling 5s en direct, boucle de retry 409 imbriquée (jusqu'à 3 niveaux) — forte
  candidate à décomposition. 🟡.
- `:1128-1194` / `:827-890` — duplication quasi totale entre les paires
  `handleSaveConfig`/`handleSaveDigifoodConfig` et `toCard`/`toDigifoodCard`. 🟢.
- `:980-982,1239,1293` — logique `Array.isArray(csvFile) ? csvFile[0] : csvFile` dupliquée 3 fois,
  extractible en un computed unique. 🟢.
- `:1468` — `console.log` laissé dans le chemin de succès du sync, à chaque sync réussi en
  production. 🟢.
- `:1343-1349` — nettoyage d'état incomplet à la suppression d'une intégration : `syncFromDates`,
  `syncToDates`, `syncJobsMap`, `jobStatsMap`, `receptionMap` ne sont jamais purgés (seuls
  `syncingMap`/`expandedCards` le sont) — sans risque de collision d'id, mais état réactif mort qui
  s'accumule sur la durée de vie du composant `keepAlive`. 🟡.
- `:1015-1020` — `activated()` ne rafraîchit que les mappings ; `integrations`, `syncJobsMap`,
  `receptionMap` restent périmés si modifiés ailleurs pendant que l'utilisateur était sur une autre
  route. 🟡.
- `:1097-1167` — validation côté client minimale (présence seule, pas de format) sur le
  formulaire de config. 🟢.
- `:7` — item de sidebar `<button class="sidebar-item active">` sans `@click`, purement décoratif.
  🟢.

## Wizard shell (`IntegrationWizard.vue`, `WizardOverview.vue`, `WizardSuccess.vue`)

- `IntegrationWizard.vue:17` — badge d'en-tête toujours "X/**4**" même pour Digifood (3 étapes
  réelles) — seul endroit où le branchement `isDigifood` n'est pas appliqué (la navigation
  elle-même est correcte). 🟡.
- `IntegrationWizard.vue:237-266` — les coches "terminé" de la barre de progression ne sont jamais
  invalidées : revenir à l'étape 1 et changer de Space laisse les étapes 2/3 affichées comme
  "terminées" alors qu'elles n'ont pas été revérifiées contre le nouveau Space. 🟡.
- `WizardSuccess.vue:26-29` — tuile "Événements: 0" affichée même pour Digifood (pas d'étape 4),
  lit comme un échec plutôt que "non applicable" ; contraste avec `WizardOverview.vue:120-123` qui
  filtre correctement par provider. 🟡.
- `WizardOverview.vue:11`, `WizardSuccess.vue:10` — guillemets français `« »` codés en dur dans le
  template, hors i18n (rendus aussi en anglais). 🟢.
- `WizardOverview.vue:62-87` — champ `icon` des définitions d'étapes jamais lu par le template
  (UI a changé pour des cercles numérotés sans que le champ soit retiré). 🟢.
- `IntegrationWizard.vue:37-49` — cercles de progression cliquables sans `role="button"`,
  `tabindex`, ni gestion clavier — inaccessibles au clavier. 🟡.
- `IntegrationWizard.vue`, `WizardOverview.vue`, `WizardSuccess.vue` — dupliquent chacun le
  boilerplate locale (`data(){locale...}` + listener `locale-changed` + cleanup) au lieu d'utiliser
  le composable existant `useI18n()` (déjà utilisé par les étapes voisines en `setup()`,
  `StepMapMenuItems.vue:796-799`). 🟢.
- `IntegrationWizard.vue:180,200` — la chaîne de fallback de thème
  (`datafriday:theme`/`appTheme`/`dataFridayLight`) est dupliquée mot pour mot deux fois dans le
  même fichier. 🟢.
- `IntegrationWizard.vue` — aucun `onErrorCaptured`/garde autour des 4 étapes enfants ; une erreur
  synchrone non catchée dans une étape laisserait l'utilisateur sur un écran cassé sans recours
  autre que le bouton fermer. 🟡 (probabilité non déterminée).

## `StepMapSpace.vue` (étape 1, 945 lignes)

- `:574,582-605` — seuil fixe `0.4` sans garde de longueur minimale : deux noms courts (ex. "P1"
  vs "P2") peuvent dépasser le seuil et suggérer un rapprochement non pertinent. 🟡.
- `:498-500,607-632` — aucune protection contre les doublons de nom de Space à la création, et le
  sélecteur natif n'affiche que le nom (aucun disambiguateur si doublon). 🟡.
- `:455,459-460,614-617` — branche morte "Autre" type de space (`spaceTypeOther`) : jamais
  sélectionnable dans `spaceTypeOptions`, aucun champ de saisie dans le template. 🟡 (code mort).
- `:529-535,568-580` — la suggestion est calculée une seule fois à `mounted()`, jamais recalculée
  si la liste de spaces change ensuite (ex. après `closePostCreate()` qui refetch avec
  `forceRefresh:true`). 🟡.
- `:622` — gestion défensive de deux formes de réponse possibles (`space.id ?? space.data?.id`)
  sans confirmation de laquelle le backend renvoie réellement — symptôme d'un contrat API non
  clarifié. 🟡 (aggrave BUG-202 si la mauvaise branche est prise).
- `:145-159` — champ "département" en `type="number"`, incompatible avec les codes corses "2A"/"2B".
  🟢.
- `:58-71,82-97` — lacunes d'accessibilité : select sans `<label for>`, bouton clear sans
  `aria-label`, disclosure "créer un space" sans `aria-expanded`/`aria-controls`. 🟢.
- `:568-605` vs `composables/useSpaceMapping.js:100-142` — logique de matching forkée
  (comparaison octet-à-octet confirmée identique) au lieu d'être partagée comme à l'étape 3
  (`utils/menuItemMatching.js`) — le composable partagé existe mais est mort, jamais utilisé. 🟢.
- `:574,482-490,656-672,708` — nombres/chaînes magiques non centralisés (seuil `0.4`, dimensions
  d'étage par défaut, littéral `'weezevent import'` comparé en dur avec un nom de config
  backend — couplage fragile, cf. commentaire "A2" du code lui-même). 🟢.
- `:457-478` vs `:699-705` — objet par défaut `newSpace` dupliqué entre `data()` et
  `closePostCreate()` au lieu d'une factory partagée. 🟢.
- `:455` — `spaceTypeOptions` hardcodé en dehors de l'i18n, mélange FR/EN, valeur persistée telle
  quelle dans `Space.spaceType`. 🟢.
- `:572-573` — pas de garde nulle sur `space.name` dans la boucle de matching (`TypeError`
  potentiel si un enregistrement a un nom null — probabilité non déterminée). 🟢.
- Aucun mécanisme de retry sur les 4 surfaces API du fichier (liste, création space, mapping,
  configuration) — cohérent avec le reste du projet, pas une régression de ce fichier
  spécifiquement. 🟢.

## `SyncProgressDialog.vue` / `SyncJobFloatingWidget.vue`

- `SyncProgressDialog.vue:396-403` — `jobData` n'est pas réinitialisé au changement de `jobId`
  (contrairement au widget, qui le fait correctement à `activate()`) : un nouvel id peut afficher
  brièvement les données `COMPLETED` de l'ancien job. 🟡.
- `:233-253,312-316` vs `DataIntegrationView.vue:598` — section "Emplacements détectés" et son CTA
  "Configurer les emplacements" sont du code mort : le parent passe toujours `:unmapped-
  locations="[]"` en dur. 🟡 (code mort).
- Duplication de logique de progression (`jobCollectPct`/`jobInsertPct` vs `collectPct`/
  `insertPct`, formules identiques) et de normalisation de réponse de poll entre le dialog et le
  widget, sans source commune — c'est cette duplication qui explique pourquoi seul le widget a le
  bon comportement de reset (`jobData`, point ci-dessus). 🟡.
- `:205,209,213` vs `:219,223` — incohérence de fallback null sur les stats du mode legacy
  (certaines coalescées à `?? 0`, d'autres non) → "0" vs case vide pour la même absence de donnée.
  🟢.
- `:2-7` — `persistent` + handler `@update:model-value` sur `cancel` : le handler est
  quasi-inatteignable via interaction normale (Vuetify bloque ESC/clic-extérieur en `persistent`).
  🟢.
- `SyncJobFloatingWidget.vue` — 0% de couverture i18n, tout le texte est en français hardcodé,
  alors que `SyncProgressDialog.vue` voisin est entièrement traduit. Contredit directement la règle
  "no hardcoded user-facing text in templates" de `CLAUDE.md`. 🟡.
- `SyncJobFloatingWidget.vue:23-30` — bouton de fermeture icône-seule sans `aria-label`. 🟢.
- `SyncJobFloatingWidget.vue:148-153` — `dismiss()` abandonne un job en cours sans confirmation ;
  le job continue côté serveur mais l'utilisateur perd toute visibilité dessus depuis le widget.
  🟢.

## `StepMapShops.vue` (étape 2, 2587 lignes)

- `:1801-2006` — `appliedFloorDims`, cache de dimensions d'étage maintenu à la main avec 3 règles
  de fusion indépendantes et subtilement différentes — même anti-pattern que la cause racine de
  BUG-208/BUG-003. 🟡.
- `:1245-1249` vs `:1315` — zone morte de scores 51-69% : calculés par `findBestElementMatch` mais
  jamais affichés (ni auto-appliqués à 100%, ni suggérés à ≥70%) — écart entre le doc (">0.5 auto
  / >0.3 candidats") et le comportement réel à 3 paliers (100/70-99/<70). 🟡.
- `:1276-1355` — `findBestElementMatch`/`findTopElementMatches` redéfinissent des closures
  `normalize`/`tokenize` quasi identiques ; aucune extraction partagée façon
  `utils/menuItemMatching.js` (étape 3) n'existe pour l'étape 2. 🟡.
- `:1066-1076` — le matching complet (O(locations × shops)) est recalculé à chaque mutation de
  `elements` (ex. un seul ajout via quick-create), alors que le résultat (`matchScore`/`_matchId`)
  n'est presque jamais lu (voir code mort ci-dessous). 🟡.
- **Cluster de code mort** (UI antérieure à colonne "score de match" jamais nettoyée) :
  `headers` computed (932-938), `topMatchesMap` computed (1093-1099), `findTopElementMatches`
  (1323-1355, seul appelant = `topMatchesMap`), `quickCreateSortedFloors` (966-975),
  `floorDialogFloorOptions` (991-1022) + son seul consommateur `floorOptionIconColor()` (771-783),
  champ `_elementConfigMap` (857, jamais lu/écrit), `locationRows.matchScore`/`._matchId`
  (1071-1074, jamais rendus), CSS `.sms-suggestions`/`.sms-suggestion-pill*`/`.sms-match*`
  (2250-2266). 🟡.
- `:894-897` vs `:939-942` — clé `anchorLocationName` dupliquée dans le même objet `computed{}` ;
  la 1ère définition est silencieusement masquée par la 2nde (piège de relecture). 🟢.
- `:1415-1461` — `applyAutoSuggestions` : échec partiel marqué ligne par ligne mais jamais
  remonté en bannière globale (contrairement à `executeBulk`, qui le fait). 🟡.
- `:1448-1460` — échec total du bulk : `autoSuggestions` déjà vidé avant l'appel n'est jamais
  restauré dans le `catch` — les pastilles de suggestion disparaissent définitivement côté client
  même si rien n'a été écrit côté serveur. 🟡.
- `:1474-1491` — `handleSave` ignore les lignes restées en `savingRows==='error'` avant de marquer
  l'étape terminée. 🟡.
- `:1479-1488` — boucle de poll de sauvegarde (200ms) non annulée par son propre timeout de
  sécurité (5s) — auto-terminale en pratique mais pattern fragile, un `watch` serait plus sûr. 🟢.
- `:135-143` — aucun verrou/`disabled` par ligne contre une re-sélection rapide (deux
  `createLocationShopMapping` concurrents possibles pour la même location, ordre de résolution non
  garanti). 🟡.
- `space.api.js:390-403` (`assignShopsFloor`) — seule fonction du fichier sans try/catch/
  `console.error`, contrairement à toutes ses voisines. 🟢.
- `:1146` — `getLocationShopMappings(..., {limit:1000})` sans boucle de pagination (contrairement
  à `getWeezeventLocations`) — au-delà de 1000 mappings, les locations excédentaires
  s'afficheraient à tort comme non mappées. 🟡.
- `:1023-1041,1932-1950,297` — libellés d'étage/zone hardcodés en anglais alors que les clés i18n
  correspondantes existent déjà et sont utilisées correctement ailleurs dans le même fichier
  (`quickCreateFloorOptions`). 🟡.
- `:1315,1349,1245,1247` — seuils de score `0.5`/`0.3`/`100`/`70` non nommés. 🟢.
- `:83,224,578,687` — boutons icône-seule sans `aria-label`/`title` (contraste avec les boutons
  accepter/refuser/créer, qui en ont). 🟢.
- Fichier candidat à découpage : le dialog d'attribution d'étage (~750 lignes, éditeur de plan
  drag-and-drop inclus) et les dialogs quick-create/bulk-confirm sont des blocs autonomes
  extractibles en composants séparés, comme déjà fait pour les dialogs de l'étape 4. 🟡
  (architectural).

## `StepMapMenuItems.vue` + `utils/menuItemMatching.js` (étape 3, 2597 + 167 lignes)

- `menuItemMatching.js:64-65,128` — une correspondance de nom exacte est rejetée par un simple
  écart de prix >1 centime, avant même que l'égalité de nom soit vérifiée (affecte
  `findTopMatches`, non utilisé aujourd'hui — voir code mort). 🟡.
- `menuItemMatching.js:62-104` — O(produits × menu items) sans mémoïsation par menu item,
  amplifié par `menuItemsList` chargé sans scoping par space (`getAllMenuItems()` sans `spaceId`,
  `:1109`). 🟡 perf.
- `:1310-1352` + backend `menu-items.service.ts` — application individuelle et application en
  masse du prix n'ont aucune exclusion mutuelle (ni côté client ni via verrou DB côté serveur) :
  risque de doublons dans `MenuItemPriceHistory` en cas de clic concurrent (état final du prix
  reste correct). 🟢.
- `:1331-1352` — les lignes traitées par `applyAllPrices` n'obtiennent jamais le badge "À jour"
  (seul `applyPrice` individuel le pose) — incohérence visuelle post-bulk. 🟢.
- `:1994-2006` — `handleSave` : busy-poll ad hoc à 200ms avec timeout dur de 5s qui peut laisser
  `$emit('completed')` partir avant la fin réelle des sauvegardes sur réseau lent. 🟡.
- **Code mort** : `headers` computed (922-928, ancien tableau Vuetify jamais utilisé),
  `topMatchesMap` computed (892-898, calculé pour chaque ligne mais jamais lu — coût non nul),
  `priceHt` calculé dans `productRows` (938-946, formule dupliquée et divergente de la formule
  partagée `htFromTtc` réellement utilisée par le template en `:1261-1263`). 🟡/🟢.
- `:1114` et `:1808` — filtre `p.productType !== 'VARIANT'` dupliqué mot pour mot après deux appels
  séparés à `getWeezeventProducts`. 🟢.
- `:1729-1992` — `bulkCreateAndMap`, méthode de 263 lignes cumulant 5 phases distinctes
  (patch spaceIds, resync catalogue, dédup par nom, création types/catégories, création+mapping+
  prix en masse) — forte candidate à extraction en composable phasé. 🟡.
- Fichier de 2597 lignes hébergeant 6 dialogs sans dépendances croisées entre eux (quick-create
  menu item, création type/catégorie produit, progression bulk-create, aperçu suggestions,
  historique de prix) — même pattern monolithique que `StepMapShops.vue`, candidat à
  extraction. 🟡 (architectural).
- `aggregation.api.js:148-197` (`getWeezeventProducts`) — plafond dur de 2000 items
  (`MAX_PAGES=4 × PER_PAGE=500`), signalé uniquement par `console.warn`, jamais dans l'UI — un
  space avec plus de 2000 produits vendus perd silencieusement les produits excédentaires de
  l'écran de mapping. 🟡.
- `mapping.api.js:110-137` (`getProductMappings`) — fan-out parallèle non plafonné sur les pages
  suivantes (`Promise.all` sans limite de concurrence). 🟢.
- `:669,725,334,506,542` — boutons de fermeture (X) des dialogs sans `aria-label`/`title`,
  contrairement aux boutons d'action de ligne qui en ont. 🟡.
- `:190-198` — select de mapping menu item sans `<label for>`/`aria-label`. 🟢.
- i18n : couverture complète des 146 clés `smm*` utilisées ; seules les erreurs backend brutes
  remontées telles quelles dans les bannières restent non traduites — pattern déjà présent
  ailleurs dans le projet, pas spécifique à ce fichier.

## `StepProcessTimeline.vue` + dialogs de l'étape 4

- `:860-875` (poll ~2min, per-event) et `:977-991` (poll 2.5s/10min, sync final) — deux mécanismes
  de poll indépendants et non coordonnés pour le même besoin conceptuel ("attendre un job
  backend"), avec des cadences/timeouts différents et aucune protection au démontage sur le
  premier (le second est couvert par BUG-218). Consolidable en un seul composable de poll partagé.
  🟡.
- `MapEventToExistingDialog.vue:21` + `useTimelineProcessing.js:74-83` — le sous-titre de date de
  chaque événement candidat affiche toujours "—" : le composable expose `startDate`/`endDate`, le
  dialog lit un champ `eventDate` qui n'existe pas. 🟡.
- `CreateEventDialog.vue:44,48,227,496` — aucune validation de présence/ordre sur les dates
  (date de fin antérieure à la date de début possible, champs vides silencieusement envoyés). 🟡.
- `StepProcessTimeline.vue:817-828` / `MapEventToExistingDialog.vue:69-75` — logique de formatage
  de date dupliquée à l'identique entre les deux fichiers. 🟢.
- `EnrichEventDialog.vue:32-38` — select "catégorie" avec libellés français hardcodés
  (`['sport','musique','festival','conference','autre']`), juste à côté d'un select "type
  d'événement" correctement traduit via `t()`. 🟡.
- `EnrichEventDialog.vue:12-19,21-29` — champs horaire (`doorsOpening`/`showTime`) en texte libre
  sans validation de format `HH:MM`. 🟢.
- **Code mort supplémentaire** (au-delà de BUG-221, qui couvre les 3 pans majeurs) : computed
  `dfEventSelectItems`, `futureEventsCount`, `uncoveredDateHeaders`/`registeredEventHeaders`
  (anciens en-têtes `v-data-table`), `showRegisteredEvents`, `toIsoDateBoundary`,
  `handleSkipEvent`/`skippedEventIds` (jamais appelé → le filtre `unprocessedEvents` qui en dépend
  est de fait inerte). 🟡.
- `CreateEventDialog.vue` — labels sans `for`/`id` associé sur les champs natifs. 🟢.
- Constantes magiques éparses sans regroupement (`INTERVAL_MS`, `MAX_WAIT_MS`, `MAX_POLLS`,
  `PATCH_BATCH=10`, `BATCH=5`, retry `5000`, `CHUNK_SIZE=50` dans `useTimelineProcessing.js`). 🟢.

## Couche API / stores Vuex / contrat frontend-backend

- **`store/modules/weezeventProducts.js` est en réalité mort**, contrairement à ce qu'affirmait
  `05_INTEGRATIONS_VENTES.md` (§"Stores Vuex" — corrigé dans ce même audit, voir la mise à jour de
  ce fichier). Les consommateurs Analyse/Predict lisent en fait `store.state.analyse.
  weezeventProducts`, un champ homonyme mais sans rapport du module `analyse` — pas ce module
  namespacé. Le seul vrai consommateur (`useMenuMapping.js`) est lui-même mort. 🟡 (doc-drift +
  dead-code).
- `store/modules/weezeventProducts.js:51` (`fetchForLocation`) — bug interne à ce code mort :
  passe `locationId` dans le paramètre `integrationId` de `getWeezeventProducts`, qui structurellement
  ne peut jamais matcher. Sans impact aujourd'hui (0 appelant vivant), à corriger seulement si le
  module est un jour réactivé. 🟢.
- **62 des 147 clés i18n `di*`** (≈42%) sont orphelines (définies dans `translations.js`, jamais
  référencées dans le code — ex. `diMapped`, `diMatchScore`, `diForecourt`, `diBasements`,
  `diApplySuggestions`). Aucune clé manquante trouvée en contrepartie (couverture des 85 clés
  réellement utilisées : 100%). Probablement des vestiges d'anciennes itérations de l'UI ou des 3
  composants confirmés morts. 🟢.
- Convention de casse de pagination incohérente entre `aggregation.api.js` (`meta.total_pages`,
  snake_case, aligné sur `weezevent.controller.ts`) et `mapping.api.js` (`meta.totalPages`,
  camelCase, aligné sur `mappings.controller.ts`) — aucune incohérence aujourd'hui (chaque fichier
  frontend est cohérent avec son propre backend), mais un futur helper de pagination partagé entre
  les deux devra en tenir compte. 🟡.
- Aucune autre incohérence de contrat frontend/backend trouvée (CRUD Weezevent/Digifood, masquage
  du secret Digifood, pagination locations/produits/product-menu) — vérifications positives
  détaillées dans le rapport d'agent, non reproduites ici.

---

## Comment utiliser ce document

- Un item ici qui s'avère plus impactant qu'estimé (ex. un utilisateur le rencontre en production)
  mérite d'être promu en fiche `BUG-NNN` individuelle dans `docs/bugs/`.
- Le "code mort" listé ici (en plus de celui déjà répertorié dans
  `05_INTEGRATIONS_VENTES.md`) est candidat à suppression pure — vérifier par un grep frais avant
  de supprimer, au cas où quelque chose l'aurait référencé depuis cet audit.
- Rien dans ce document n'a été corrigé — c'est un état des lieux, pas un changelog.
