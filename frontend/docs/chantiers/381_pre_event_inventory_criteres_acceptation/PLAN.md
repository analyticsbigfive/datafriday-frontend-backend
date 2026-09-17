# Plan : Pre-event Inventory, critères d'acceptation du 2026-09-14

Branche : `feat/pre-event-inventory-acceptance` (base `production`). Non commité, non déployé.

## Critères reçus (verbatim, scénario de test)

1. Tous les comptes sont à 0 pour tous les items à compter (PDV et Storage).
2. Chaque item a sous le champ 0 la valeur du compte attendu (= valeur Logistique).
3. Bouton pour générer un PIN qui rend l'inventaire pre-event accessible aux managers de PDV sans login.
4. Le PIN est affiché dans un popup ; popup fermé, le PIN est retrouvable sous le bouton "Reset PIN".
5. Scan du QR → écran de login PIN → comptage du PDV correspondant au QR.
6. Côté manager : tout à 0, **aucune indication de valeur attendue**.
7. "Compté" met à jour la colonne de droite pour les personnes loguées ; valeurs modifiables après "Compté".
8. Réconciliation générée automatiquement (a) quand tous les éléments d'un PDV sont comptés, (b) à Doors Open ;
   la Logistique est mise à jour avec toutes les valeurs saisies, même si tout n'est pas compté.
9. Pendant les 30 minutes après Doors Open, les utilisateurs avec login peuvent modifier ; Logistique et
   feuille de réconciliation mises à jour.

Décisions prises avec Ulrich le 2026-09-14 :
- "Doors Open" = `eventStartDate ?? eventDate` (aucun champ dédié sur `Event`, même proxy que le cron live-init).
- Les critères 4 et 6 reviennent sur deux décisions produit du 2026-09-08 (PIN one-shot, attendu toujours montré
  au manager) : on suit les critères.

## État avant (vérification du 2026-09-14)

| Critère | État | Détail |
|---|---|---|
| 1 | OK | `getCount` normalise à 0 |
| 2 | Partiel | attendu = chip total "Attendu : N" à côté du nom, plus sous chaque champ (retiré le 2026-08-27) ; gaté par `front.fb.preInventoryExpected` |
| 3 | Partiel | il faut d'abord "Démarrer pré-event" (ouverture de la fenêtre), puis "Générer le PIN" |
| 4 | KO | PIN one-shot : seul le hash HMAC était stocké |
| 5 | OK | |
| 6 | KO | attendu Logistic toujours chargé et affiché au manager |
| 7 | Partiel | sauvegarde OK, mais aucun rafraîchissement côté staff (ni polling ni websocket) |
| 8 | KO | (a) toast seulement ; (b) le cron faisait un `logistics.reset` depuis le **snapshot** pre-event (créé seulement par le Save manuel), sinon repli sur le post-event du match précédent ; aucune feuille générée |
| 9 | KO | aucune logique de 30 min ; modifications sans limite ; feuille jamais régénérée |

## Ce qui a été fait

### Backend

- `PreEventInventoryFlowService` (nouveau, `features/inventory/pre-event-inventory-flow.service.ts`) :
  - `saveCount` : point d'entrée unique des écritures de comptage (staff et invité). Phase `pre-event` +
    `now > doorsOpen + 30 min` → 403. Après Doors Open, chaque écriture pose un marqueur KvStore
    `pre-event-reco-dirty:{space}:{event}`.
  - `regenerate` : UNE feuille pre-event par match. Lit les comptages vivants (`InventoryCount`, jamais un
    snapshot), crée la feuille via `createPreEventReconciliation` (qui recale la Logistique), supprime les
    feuilles pre-event précédentes du match (le besoin prédit archivé est reporté), pose le snapshot
    `kind='pre-event'` (cycle pre↔post, BUG-237).
  - `runDoorsOpen` : idempotent (marqueur `live-pre-event-init:{space}:{event}`, même clé qu'avant). Clôt la
    fenêtre invité pre-event (`closedBy: system-doors-open`, PIN effacé), régénère.
  - `flushDirty` : régénère si une écriture a eu lieu depuis la dernière feuille (marqueur retiré avant,
    reposé en cas d'échec).
- `InventoryLiveInitCronService` : réécrit sur le service ci-dessus, cadence `EVERY_MINUTE`
  (`runDoorsOpen` dans `[doorsOpen, end + 3h]`, `flushDirty` jusqu'à `doorsOpen + 32 min`).
  `InventoryService.autoInitLiveStockFromPreEventInventory` supprimé (et son spec).
- `CreateInventoryCountDto.phase` (optionnel) ; `InventoryCountsController` et
  `GuestPinAccessService.saveCount` passent par `PreEventInventoryFlowService.saveCount`.
- `POST /inventory/:spaceId/pre-event-reconciliations/regenerate` (staff) et `POST /guest-pin/element-complete`
  (invité) : déclencheur "tous les articles du PDV comptés" (le serveur ne connaît pas la liste explosée,
  c'est le front qui détecte).
- `createPreEventReconciliation` accepte `extraMeta` (trigger, feuille remplacée, PDV) archivé dans `meta`.
- PIN retrouvable : `InventoryWindow.pinCiphertext` (migration `20260914100000_guest_pin_retrievable`),
  AES-256-GCM avec clé dérivée de `GUEST_PIN_HMAC_SECRET` (`guest-pin-crypto.ts`, pas de nouvelle variable
  d'env). Le status board renvoie `pin` en clair (permission `front.fb.guestPinManage`). Effacé à la clôture.
  Les fenêtres ouvertes avant la migration ont `pin: null` : régénérer une fois.
- Suppression de `GET /guest-pin/inventory/baseline` et de `getBaseline` (aucun attendu côté invité).
- Tests : `pre-event-inventory-flow.service.spec.ts` (nouveau), `inventory-live-init.cron.spec.ts` (réécrit),
  mocks obsolètes de `inventory.service.spec.ts` réparés (7 tests échouaient déjà avant ce chantier).

### Frontend

- `store/modules/inventory.js` : `currentPhase` envoyé avec chaque comptage ; `loadInventory({ silent })` ;
  `refreshInventorySilently` (saute si une saisie locale date de < 5 s) ; message 403 serveur relayé.
- `composables/useInventoryLivePolling.js` (nouveau) : tick toutes les 20 s quand une fenêtre PIN est ouverte
  pour la phase courante (comptages + status board + feuilles), pause onglet caché.
- `utils/preEventEditWindow.js` + `composables/usePreEventEditWindow.js` (nouveaux) : miroir front du verrou
  (`parseEventDateTime` garde l'heure d'un ISO, `parseEventDate` la tronquait au jour). Bandeau
  "Portes ouvertes : modifications possibles jusqu'à HH:MM" puis "Verrouillé", champs en lecture seule.
- `SpaceInventoryView.vue` : `markCounted` détecte "PDV complet" et appelle la régénération (staff :
  endpoint regenerate + toast + rechargement des feuilles ; invité : `element-complete`) ; plus d'attendu
  passé en mode invité ; `expectedFor`/`expectedDetailFor` rebranchés.
- `InventoryCountingInterface.vue` : hint "Quantité attendue : N cartons de 40" / "N Pc en vrac" restauré
  sous chaque champ (props `expectedFor`, `expectedDetailFor`), en plus du chip total.
- `GuestPinAccessPanel.vue` : UN SEUL bouton "Générer le PIN" (ouvre la fenêtre pré/post-event si besoin, puis
  génère), qui devient "Régénérer le PIN" ; PIN en cours affiché dessous (+ copier). Le bouton "Démarrer" séparé
  disparaît (décision Ulrich 2026-09-14, "comme la spec le demande").
- Verrou par article pendant les 30 min (critère 9, décision Ulrich 2026-09-14) : un article déjà compté à
  l'ouverture des portes est figé (champs et boutons désactivés, 403 serveur `isCountedRow`), seuls les non
  comptés restent modifiables ; passé 30 min, tout est verrouillé.
- `InventoryReconciliationView.vue` : bandeau "Auto (PDV entièrement compté / ouverture des portes /
  modification après l'ouverture)" depuis `meta.trigger`.
- `useGuestInventorySession.js` : plus de baseline, `notifyElementComplete`.
- Tests : `tests/unit/preEventEditWindow.spec.js`.

## Ce qui reste / à valider en test

- La régénération auto ne recalcule pas le besoin prédit (Event Predict vit côté front) : elle reporte celui
  de la feuille précédente, sinon colonnes vides.
- Le polling live ne s'active que si le status board PIN est chargé (panneau `GuestPinAccessPanel`, permission
  `front.fb.guestPinManage`) et signale une fenêtre ouverte. Un staff sans cette permission ne voit pas les
  comptages des managers bouger sans recharger (l'endpoint status board lui est interdit).
- Migration à appliquer (`prisma migrate deploy`) ; aucune variable d'env à ajouter.
- Cron : passage de 5 min à 1 min. Au premier déploiement, tout event terminé depuis moins de 3h et sans
  marqueur passera par `runDoorsOpen` (même comportement que l'ancien cron).

## Fix robuste du 2026-09-17 (branche `fix/pre-event-flow-robust`, base `develop`)

Analyse du 2026-09-17 sur le flux mergé dans `develop` : trois causes racines.

1. **"Doors Open" tombait à 02:00 du matin.** `eventStartDate ?? eventDate` sont des jours ancrés à minuit
   UTC (110 events avec espace en base dev, 0 avec une heure). Conséquence : fenêtre PIN clôturée et PIN
   effacé à 02:00 Paris, puis **403 sur tout comptage pre-event dès 02:30 le jour du match**.
2. **Chaque régénération reconstruisait la feuille et re-poussait TOUT le comptage validé** vers Logistic.
   Le reset remet `StockLevel = compté` et déplace l'ancre des ventes : effacement des ventes du début de
   match à chaque `flushDirty`, des livraisons Logistic saisies entre comptage et match, et rattrapage tardif
   du cron = reset complet en plein match. Pire : l'attendu est relu depuis Logistic, qui contient déjà le
   comptage poussé, donc **les écarts des lignes déjà poussées retombaient à 0** à chaque régénération.
3. Aucune sérialisation (deux PDV complets à la même seconde, cron + staff), marqueur find-then-create,
   `markCounted` staff appelait `regenerate` sans attendre la persistance du comptage (race).

### Ce qui a été fait

Backend :
- `resolveDoorsOpenAt(event, timezone)` dans `shared/utils/event-window.util.ts` : `sessions[].doorsOpening`
  (la plus tôt, heure locale du space via `combineDayAndLocalTime`), **`null` sans heure, jamais minuit**.
  `FlowEvent` porte `sessions` + `timezone` (select `space.timezone`).
- `PreEventInventoryFlowService` : `doorsOpenAt`/`editDeadline` nullables ; sans heure → `saveCount` délègue
  sans verrou, le cron ignore l'event ; `windowState`/`getWindowState` exposés
  (`GET /inventory/:spaceId/pre-event-window/:eventId`, phases `no-doors-open|before|editing|locked`,
  `doorsOpenDone`) ; `runDoorsOpen` réclame le marqueur AVANT le travail (P2002 = déjà fait, retiré si échec),
  garde `late` (au-delà de la fin des 30 min + 5 min : fenêtre clôturée, marqueur posé, rien de poussé) ;
  régénérations sérialisées par match (file de promesses en mémoire, cron et HTTP vivent dans le même
  process) ; `regenerate` accepte `predictedUnits` client + `canSeeExpected` et renvoie `document`.
- `POST /inventory/:spaceId/pre-event-doors-open` : passage manuel (repli sans heure, ou pour avancer).
- Le Save manuel (`POST pre-event-reconciliations`) passe désormais par `regenerate('manual')` : une seule
  feuille par match, partout.
- `InventoryCount.logisticPushedAt` (migration `20260917100000`) : `pushCountToLogistic` ne pousse que les
  lignes validées jamais poussées ou modifiées depuis (`updatedAt > logisticPushedAt`), marque les lignes
  poussées en SQL brut (un `update()` Prisma bumperait `updatedAt`). `nothing-new` quand rien n'a changé
  (bouton « Update Logistic » : message explicite). Vaut aussi pour le post-event et la clôture de fenêtre PIN.
- `createPreEventReconciliation(..., previousLines)` : une ligne validée déjà poussée et inchangée est
  **reprise telle quelle** de la feuille précédente (attendu et écart figés au moment du comptage), seul le
  besoin prédit est rafraîchi ; `meta.carriedLines`, `meta.logisticPush` archivés.
- Cron : borne de fin = `resolveEventTransactionWindow(e).end + 3h` (même règle que le Live, plus
  `eventEndDate` brut) ; `INVENTORY_LIVE_INIT_CRON_ENABLED` déclaré dans `render.yaml` (web) avec la note
  multi-instances.

Frontend :
- `utils/preEventEditWindow.js` + `composables/usePreEventEditWindow.js` : l'état vient du serveur
  (`getPreEventWindow`), l'écran ne recalcule plus rien depuis l'event ; ré-évaluation de la phase à la minute,
  `refresh()`.
- `SpaceInventoryView.vue` : `await` du `upsertCount` avant `regenerate` ; bandeau « pas d'heure d'ouverture »
  / « passage effectué » ; bouton « Ouverture des portes » (desktop + menu mobile, confirmation, masqué une
  fois le passage fait) ; après un Save manuel, rechargement de la liste (le serveur a remplacé la feuille).
- API : `getPreEventWindow`, `triggerPreEventDoorsOpen`.

Tests : `event-window.util.spec` (`resolveDoorsOpenAt`), `pre-event-inventory-flow.service.spec` (réécrit,
25 tests : heure réelle, sans heure, sérialisation, claim/late/rollback du marqueur), `inventory-live-init.cron.spec`
(réécrit), `inventory.service.spec` (push incrémental, `nothing-new`, reprise de lignes), `preEventEditWindow.spec`
(réécrit sur l'état serveur).

### À savoir / à valider en test

- Migration `20260917100000_inventory_count_logistic_pushed_at` appliquée sur la base dev le 2026-09-17 ;
  à déployer avec le backend (`prisma migrate deploy`, additive, nullable).
- Les comptages déjà poussés avant ce fix n'ont pas de `logisticPushedAt` : ils seront repoussés UNE fois à
  la prochaine régénération (delta 0 si rien n'a bougé dans Logistic), puis marqués.
- Un event sans `doorsOpening` (33 sur 110 en dev) : renseigner l'heure dans la fiche event (sessions), sinon
  le bouton « Ouverture des portes » fait le passage à la main. Le verrou des 30 min n'existe pas sans heure.
- La sérialisation des régénérations est en mémoire : si le web Render passe à plusieurs instances, n'activer
  le cron que sur une seule (ou passer à un verrou `pg_advisory_xact_lock`).
