# Plan : cycle Pre / Post event Inventory v2 (document Bertrand du 2026-10-06)

Statut (2026-10-06) : **les 4 lots sont codés et commités** sur `feat/inventory-cycle-pre-post-v2`
(créée depuis `develop`, ni poussée ni mergée) : `dd855311` (lot 1), `29ea4a00` (lot 2), `bc250418`
(lot 3), `f6dbc08a` (lots 4a et 4b). Lot 1 et affichage du lot 2 validés par Ulrich ; lots 3 et 4 à tester
en local. Ce qui reste : §9.

Source : PDF « Pre et Post event Inventory cycle » (8 pages), reçu le 2026-10-06. **Ce document est la
dernière version et prime sur toute règle antérieure** (décision Ulrich 2026-10-06), en particulier la
règle Bertrand du 2026-09-29 « après l'ouverture des portes, la Logistique se met à jour à la main, PDV
par PDV ». Là où le document est muet, on garde l'existant.

---

## 1. Ce que demande le document

### 1.1 Le cycle (pages 1 et 2)

Une seule phase ouverte à la fois par espace. Chaque phase ferme la précédente :

```
Pre(N) ── ouverture des portes de N ──▶ Post(N) ── démarrage de Pre(N+1) ──▶ Pre(N+1) ── portes N+1 ──▶ Post(N+1)
                                                   (manuel, ou livraison
                                                    détectée en Logistique)
```

- **Pre(N)** : jusqu'à l'ouverture des portes de N.
- **Post(N)** : dès l'ouverture des portes de N (on compte aussi pendant le match), jusqu'au démarrage du
  Pre(N+1).
- **Pre(N+1)** démarre soit à la main, soit quand une **livraison** est détectée en Logistique.
- Pendant chaque phase, **la Logistique et la réconciliation sont mises à jour à chaque article marqué
  compté**.
- **Un PIN par event et par phase.** Les numéros du PDF (`012345`, `112345`…) sont illustratifs, et
  certains libellés sont des copier-coller erronés (« Event 2 : Pin Pre » au-dessus des post-events,
  `022345` répété pour l'Event 3).

### 1.2 Bandeau rouge (pages 3 et 4)

- Ligne **« PIN : 123456 (statut) »**, PIN généré automatiquement pour chaque event.
- **Statut** : *Pas commencé* (rien compté), *En cours* (au moins un article compté), *Terminé* (tout compté).
- **Post** : liste déroulante limitée au **dernier** et au **prochain** event. Par défaut, le dernier event
  dont l'ouverture des portes est passée.
- **Pre** : pas de liste. Event = le prochain dont l'ouverture des portes est à venir.
- **Bouton Arrêt** : coupe l'accès par PIN pour tous les PDV.
  - Post : actif si l'ouverture des portes de l'event affiché est passée. Déclenché automatiquement au
    démarrage du pre-event suivant ou à la détection d'une livraison.
  - Pre : actif si l'ouverture des portes est à venir. Déclenché automatiquement au démarrage du post-event
    (ouverture des portes) ou à la détection d'une vente.
- **Bouton Démarrage/Reprise** : rouvre l'accès, sans limite de temps, mêmes conditions d'activation.
  Démarrer une phase arrête l'autre. Quand l'accès est arrêté, il n'est plus ouvert en masse par QR code,
  mais chaque PDV peut être rouvert individuellement.
- **Bouton Pause** : ne pas implémenter.

### 1.3 Lignes PDV (pages 5 et 6)

- Retirer le libellé « à compter ». Pastille à droite de « x / y articles » : **rouge** (rien compté),
  **orange** (en partie), **verte** (tout compté).
- Bouton **▶** (accès QR fermé pour ce PDV) / **■** (accès ouvert), à l'emplacement de l'actuel bouton
  « Mettre à jour la Logistique pour ce PDV ».
- **Exclusivité par PDV** : démarrer le post-event sur un PDV coupe son pre-event, et inversement.

### 1.4 Changements et bugs (pages 7 et 8, identiques pour Pre et Post)

- **Bug** : les filtres de la colonne de gauche ne fonctionnent pas.
- Onglets « À compter » / « Comptés » déplacés dans un **menu burger** du corps de page, avec un nouveau
  filtre **« En cours de comptage »**.
- Supprimer les tris « À compter d'abord », « Stock croissant », « Nom ». **Toujours trier par ordre
  alphabétique.**
- Supprimer la section **« Accès PIN PDV / Générer le PIN »** : PIN générés à l'avance, affichés dans le
  bandeau.
- Supprimer les boutons **« Mettre à jour la Logistique »** et **« Générer la réconciliation »**.
- Au clic sur **« Marquer compté »** : (1) la Logistique est mise à jour, (2) la réconciliation est générée
  en brouillon et se met à jour au fil des comptages.

### 1.5 Lecture fine du PDF (relecture du 2026-10-06)

- **La page 2 prime sur la page 1.** En page 1, le post de l'Event 1 dure jusqu'aux portes de l'Event 2 et
  chevauche le pre de l'Event 2 (15/02, 02h00 à 19h00). La page 2 corrige : le post de l'Event 1 s'arrête à
  l'activation du PIN pre de l'Event 2. Il n'y a donc jamais de chevauchement.
- **Le pre de l'Event 1 commence à 00h00 sur les deux pages** : c'est le début de l'axe, pas un retour de la
  règle « minuit » retirée le 2026-10-02. Les pre des Events 2 et 3 démarrent à l'activation manuelle ou à
  une livraison.
- **Copier-coller du PDF, lus dans le sens évident** :
  - page 3, bouton Démarrage du bandeau post : « post event inventory est mis en arrêt » se lit « pre » ;
  - page 5 et 6 : le second état est le bouton **Arrêt** (■), pas « démarrage/reprise » ;
  - pages 7 et 8 : la maquette « pré » garde le sous-titre « Post Inventaire de l'évènement » ;
  - page 6, Bloc 24 (vert) montre encore l'ancienne icône Logistique grisée, la page 5 montre ▶ (D11).
- **Onglets « À compter » / « Comptés »** : la flèche de la page 7 vise la **colonne de droite**
  (au-dessus du résumé, `SpaceInventoryView.vue` vers la ligne 665), pas le corps. Il s'agit donc de les
  déplacer de la droite vers le corps de page, à côté de Ouvert / Fermé.
- **Version mobile** : les pages 3 et 4 visent « desktop et mobile view ». Aujourd'hui la seule liste d'events
  est celle du tiroir mobile (`eventOptions` : tous les events passés + « Indépendant d'un évènement »).
  Sur desktop il n'existe aucun sélecteur (module 10 §2 et §12.4, règle « un match = un eventId »).
- **Bandeau** : la maquette affiche « Nom · date » sans préfixe ni stade, et la ligne PIN recouvre la rangée
  d'actions. Le bouton Imprimer (encore visible page 5) n'est pas évoqué.
- **Bouton « Ouverture des portes »** (pre, visible page 6 « …des portes ») : non évoqué par le document,
  mais redondant avec l'Arrêt du pre et le démarrage automatique du post (D18).

---

## 2. Décisions (déduites du document, validées par Ulrich le 2026-10-06)

| # | Sujet | Décision | Fondement |
|---|---|---|---|
| D1 | Logistique pendant le match | Mise à jour automatique à chaque « Marquer compté », y compris après l'ouverture des portes. La règle du 2026-09-29 est abandonnée. | Pages 2, 7, 8 |
| D2 | Réconciliation définitive | Le brouillon est le document de référence. Il cesse d'évoluer quand l'inventaire est arrêté (plus personne ne peut compter). | Pages 7, 8 (pas d'étape finale) |
| D3 | Portée d'une livraison | Une livraison sur n'importe quel élément de l'espace déclenche **l'Arrêt du bandeau** : tout le stade. | Page 3 |
| D4 | Fin du pre-event | Au premier des deux : ouverture des portes (démarrage du post) ou première vente réelle. | Pages 2, 4 |
| D5 | Validation directeur | Conservée (« J'ai terminé » puis « Valider »). Le statut *Terminé* s'ajoute à côté. | Document muet : on garde l'existant |
| D6 | Liste d'events en post | Dernier et prochain event. Sur le prochain, Arrêt et Reprise sont grisés. | Page 3 |
| D7 | Bouton Arrêt | Coupe seulement l'accès par PIN. Il ne pousse plus vers la Logistique (c'est fait à chaque clic). | Conséquence de D1 |
| D8 | Arrêts automatiques et PDV rouverts | Un arrêt automatique (livraison, vente, changement de phase) referme aussi les PDV rouverts à la main. | Conséquence de 1.2 |
| D9 | PIN généré à l'avance | Il ne permet de se connecter que lorsque sa phase est active. | Conséquence de 1.1 |
| D10 | Boutons de la ligne PDV | « Mettre à jour la Logistique pour ce PDV » disparaît (remplacé par ▶ / ■). « Recompter » (↻) reste. | Page 5 |
| D11 | PDV entièrement compté | Le bouton ▶ / ■ reste affiché (rouvrir un recomptage). | Choix Ulrich |
| D12 | Stockages | Mêmes règles que les boutiques. | Choix Ulrich |
| D13 | « Le manager voit les quantités attendues » | **Sans objet** (vérifié le 2026-10-06) : aucun écran ne posait ce réglage, `showExpected` restait toujours à faux, et l'invité ne voit plus d'attendu depuis le chantier 381. Rien à déplacer. | Code |
| D14 | Filtres « Ouvert » / « Fermé » | Conservés. | Document muet |
| D15 | Snapshots de phase (`InventorySnapshot.kind`) | Figés **à l'arrêt de la phase** (automatique ou manuel), plus au clic sur « Générer la réconciliation » qui disparaît. Ils restent la référence du « Qty left » post, de la limite BUG-237 et du repli du match suivant. | Conséquence de la suppression du bouton (pages 7, 8) |
| D16 | Livraison pendant le match | Une livraison ne déclenche l'arrêt du post qu'**après la fin réelle du match N**. Un réassort saisi en `DELIVERY` pendant le match ne coupe rien. | Conséquence absurde sinon (post ouvert dès les portes) |
| D17 | Vente qui arrête le pre | Seule une vente **rattachée à l'event N** (ou dans sa fenêtre du jour) compte. Ventes hors match (event de saison Weezevent, privatisation) et tests de caisse ignorés. | Même raisonnement que D16 |
| D18 | Bouton « Ouverture des portes » | **Retiré** (Ulrich, 2026-10-06) : l'Arrêt du pre et le démarrage automatique du post aux portes le remplacent. Sans heure d'ouverture, Arrêt / Démarrage du bandeau à la main. | Redondant avec la page 4 |
| D19 | Ventes prises en compte dans la réconciliation post | Bornées, **par PDV**, à l'heure de son dernier « Marquer compté » (Ulrich, 2026-10-06) : un PDV compté à 21h et qui vend encore ne doit pas afficher un faux manquant. | Conséquence du post ouvert dès les portes (pages 1, 2) |
| D20 | Droits | Inchangés : PIN, Arrêt / Reprise et ▶ / ■ réservés à `front.fb.guestPinManage`. Les invités PIN ne voient pas le menu burger des statuts. Imprimer est conservé dans le bandeau. | Document muet |
| D22 | Délai de mise à jour de la Logistique | Envoi **regroupé à la minute** (Ulrich, 2026-10-06) : chaque envoi recalcule le stock de tout l'espace. Dans la liste de l'écran Logistique, les envois d'un même match et d'une même phase forment une seule ligne. | §5.1, option A |
| D23 | Découpage du lot 4 | **4a** : Logistique automatique, boutons « Mettre à jour la Logistique » et « Ouverture des portes » retirés, snapshots figés (D15). **4b** : réconciliation post côté serveur, « Générer la réconciliation » retiré, D19. | Ulrich, 2026-10-06 |
| D21 | Liste d'events | Le sélecteur « dernier / prochain » devient visible sur desktop (post) et remplace la liste du tiroir mobile, « Indépendant d'un évènement » compris. Le pre n'a pas de sélecteur. | Pages 3, 4 |
| D24 | Retours Bertrand 2026-10-07 : pre-event après les portes | Le pre-event n'est plus fermé aux portes : période jusqu'à la **fin réelle** de l'event, fenêtre invité laissée ouverte, édition (articles comptés compris) jusqu'à la fin. Chaque PDV s'arrête **à sa première vente**, vente de test comprise (choix Ulrich : « on part sur 1, test ou pas »), remplace D17 et le seuil 3 ventes / 15 min. Un PDV rouvert à la main (▶) n'est jamais recoupé. ■ d'un PDV après les portes : il retrouve son accès post-event. | Retour Bertrand 2026-10-07 |
| D25 | Logistique en temps réel | Envoi 2 s après « Marquer compté », au plus toutes les 10 s par match (cron à la minute en filet). Écran Logistique relu toutes les 10 s. Ligne « Dernier comptage physique » supprimée. Remplace D22. | Retour Bertrand 2026-10-07 |
| D26 | Accès invité coupé | Page d'attente du PDV scanné (plus la connexion staff), vérification de reprise toutes les 30 s, bouton « Scanner le QR code » (caméra dans la page, `qr-scanner`). Session invité relue toutes les 30 s. | Retour Bertrand 2026-10-07 |

---

## 3. Existant comparé à la cible

| Thème | Existant (2026-10-06) | Cible | Écart |
|---|---|---|---|
| Périodes Pre / Post | Pre jusqu'aux portes, post dès les portes (`inventory-window-period.ts`) | Idem | Aucun |
| Une phase à la fois | Une fenêtre ouverte **par phase** (index partiel) : Pre(N+1) et Post(N) peuvent coexister | Une seule phase ouverte | Fermer le post au démarrage du pre suivant |
| Fin du post | Génération de la réconciliation, clôture manuelle (avec push), ou remplacement par un autre post | Démarrage du pre suivant, livraison, Arrêt | Nouveaux déclencheurs ; la réconciliation ne ferme plus rien |
| Fin du pre | Ouverture des portes (cron chaque minute) puis 30 min d'édition staff | Portes ou première vente | Ajouter la première vente. Les 30 min staff restent (document muet) |
| PIN | Un PIN par fenêtre, généré à la main, retrouvable (chiffré), effacé à la clôture | Généré à l'avance pour tous les events, affiché dans le bandeau | Les fenêtres n'existent qu'ouvertes : il faut un état « préparée » |
| Choix de l'event | Desktop : aucun sélecteur, event affiché en lecture seule. Mobile (tiroir) : **tous** les events passés + « Indépendant d'un évènement » | Post : dernier et prochain, desktop et mobile. Pre : prochain, fixe | Nouveau sélecteur desktop, liste mobile réduite (D21) |
| Snapshots de phase | Créés au clic « Générer la réconciliation » (et, en pre, PDV complet et portes) | Figés à l'arrêt de la phase | Nouveau déclencheur (D15) |
| Statut global | Aucun dans le bandeau | Pas commencé / En cours / Terminé | Nouveau |
| Accès par PDV | Révoquer / réactiver dans le menu de la pastille clé (`GuestPinBadge.vue`) | Bouton ▶ / ■ visible, exclusivité pre / post par PDV | Sortir l'action, ajouter l'exclusivité |
| Pastille PDV | 2 états + libellé « À compter » / « Compté » ; un PDV partiel reste « à compter » | 3 couleurs, sans libellé | Statut à 3 états |
| Logistique au comptage | Pre : quand **tout un PDV** est compté (lignes nouvelles ou modifiées seulement), puis aux portes. Post : rien d'automatique | À chaque article | Changement de mécanisme (§5.1) |
| Réconciliation | Pre : régénérée côté serveur quand un PDV est complet. Post : brouillon calculé **dans le navigateur**, seulement si un utilisateur connecté a la page ouverte | Brouillon mis à jour à chaque article, quel que soit l'utilisateur (staff ou PIN) | Calcul post côté serveur (§5.2) |
| Livraison détectée | Un mouvement Logistique n'agit jamais sur l'inventaire | Arrête le post, démarre le pre suivant | Nouveau |
| Vente détectée | Il n'existe pas de mouvement de vente en Logistique (`SALE` est réservé au recalage). Le statut « live » détecte une vente réelle dans les 30 dernières minutes (`SpacesService.getLiveStatus`) | Arrête le pre | S'appuyer sur la détection des ventes réelles |
| Tris | 3 tris (`sortMode`) | Alphabétique seul | Supprimer |
| Onglets de comptage | « À compter » / « Comptés » (`countingStatusTab`), dans la **colonne de droite** | Burger dans le corps de page + « En cours de comptage » | Déplacer et suivre le statut à 3 états |
| Filtres de gauche | Branchés sur la liste des PDV (`filteredCards`) | Fonctionnels | **À reproduire** avant de corriger : ils filtrent les PDV et non les articles, et se combinent avec l'onglet « À compter » actif par défaut |

Incohérence existante à corriger au passage : le panneau PIN affiche « jusqu'à votre clôture via Mettre à
jour la Logistique », alors que ce bouton ne ferme plus rien depuis le 2026-09-29.

---

## 4. Lots de développement

Ordre conseillé : du moins risqué au plus lourd. Chaque lot est livrable seul.

### Lot 1 : liste des PDV (interface seule)

- Statut à 3 états (`à compter` / `en cours` / `compté`) dans `SpaceInventoryView.statusFor` et
  `storageStatusFor`.
- Pastille rouge / orange / verte, libellé retiré (`InventoryShopCard.vue`, `InventoryStorageCard.vue`).
- Onglets « À compter » / « Comptés » retirés de la colonne de droite, remplacés par un menu burger dans le
  corps de page avec « En cours de comptage » (invisible aux invités PIN, D20).
- Tris supprimés, ordre alphabétique fixe (`utils/inventoryCardSort.js`, `compareInventoryCards`).
- Filtres de gauche : reproduire, corriger.

**Fait (2026-10-06)** :
- `utils/inventoryCountingStatus.js` (3 états, filtre, couleur), `InventoryStatusDot.vue`,
  `InventoryCountingStatusMenu.vue` (sélection multiple ; défaut « À compter » + « En cours de comptage »,
  équivalent de l'ancien onglet « À compter » qui gardait les PDV partiels ; aucune case = tout afficher).
- Tris supprimés (`inventoryCardSort.js` réduit à l'ordre alphabétique, cartes vides en bas), clés i18n
  `invSort*` et `invCountedTooltip` retirées, `invStatusInProgress` ajoutée.
- Tiroir mobile : statut en sélection multiple.
- **Cause du bug des filtres** : ils ne réduisaient que la liste des PDV. Une fois un PDV ouvert en
  comptage (cas de la capture pages 7 et 8), la liste d'articles (`countingShop`) et la navigation entre
  PDV (`countingSiblings`, tous les PDV de l'onglet) les ignoraient. Désormais : `countingShopView` réduit
  les articles aux filtres « Articles du menu » / « Type & catégorie », et la navigation suit les PDV
  filtrés (sans le filtre de statut, pour qu'un PDV qui vient d'être terminé reste atteignable).

**Acceptation** : un PDV à 8/19 a une pastille orange et apparaît sous « En cours de comptage » ; la liste
est toujours alphabétique ; chaque filtre de gauche réduit la liste comme attendu.

### Lot 2 : bandeau et accès par PDV

- Bandeau : PIN, statut global, boutons Arrêt et Reprise.
- Post : sélecteur dernier / prochain event, desktop et tiroir mobile (D6, D21).
- Sous-titre « Nom · date » ; Imprimer conservé ; bouton « Ouverture des portes » selon D18.
- Section « Accès PIN PDV » supprimée (`GuestPinAccessPanel.vue`), libellé erroné « clôture via Mettre à
  jour la Logistique » disparu avec elle.
- Bouton ▶ / ■ sur chaque ligne (révoquer / réactiver l'accès), à la place de `PdvLogisticUpdateButton`.
- Arrêt : coupe l'accès sans pousser vers la Logistique (D7).
- Droits inchangés (D20).

**Acceptation** : le PIN et le statut sont visibles dans le bandeau ; Arrêt coupe tous les accès PIN ; un
PDV rouvert avec ▶ est de nouveau accessible par son QR code.

**Fait (2026-10-06)** :
- **Modèle d'accès** (serveur) : toute clôture de fenêtre passe par
  `inventory/inventory-window-closure.ts`, qui **conserve le PIN** (lié à l'event, une reprise rouvre avec
  le même code) et **révoque toutes les lignes d'accès PDV** (D8). L'accès invité ne dépend plus que de la
  ligne du PDV (`jwt-guest-pin.strategy`) ; à la connexion, sans ligne, seule une fenêtre ouverte laisse
  entrer. C'est ce qui permet de rouvrir un seul PDV alors que la fenêtre est arrêtée. Migration de données
  `20261006120000_guest_pin_closed_windows_revoked` (révoque les lignes encore actives des fenêtres déjà
  closes, sinon un jeton invité encore valide y redeviendrait accepté).
- **Routes** `POST inventory-windows/start|stop` (bandeau) et `elements/start|stop` (ligne PDV), droit
  `front.fb.guestPinManage`, refusées hors période. Démarrer une phase arrête l'autre, pour l'espace (bandeau)
  ou pour le PDV (ligne) : l'exclusivité prévue au lot 3 est faite ici. L'Arrêt ne pousse rien (D7).
- **Écran** : `InventoryPinBand.vue` (ligne PIN du bandeau), `PdvAccessToggle.vue` (▶ / ■ boutiques et
  stockages), `useInventoryPinAccess.js`, `utils/guestPinAccessState.js`. Supprimés : `GuestPinAccessPanel`,
  `SetWindowPinDialog`, `PdvLogisticUpdateButton` ; Révoquer / Réactiver retirés de la pastille clé.
- **Liste dernier / prochain event** (post, desktop et tiroir mobile), « Indépendant d'un évènement »
  retiré. Sur le prochain event, le comptage est en **lecture seule** (portes pas ouvertes) : déduction de la
  règle « un comptage post-event rattaché à un match à venir fausse la référence du pre-event suivant ».
- Sous-titre « match · date » sans préfixe ni nom d'espace, pre et post.
- Routes serveur devenues inutilisées par l'écran, conservées pour l'instant : `POST inventory-windows`,
  `:windowId/pin`, `pins/:id/revoke|reactivate`, `:windowId/close`.
- D18 tranché le 2026-10-06 : bouton « Ouverture des portes » retiré au lot 4a.

### Lot 3 : cycle des phases

- PIN préparés à l'avance pour les events à venir (état « préparé », connexion refusée tant que la phase
  n'est pas active, D9).
- Une seule phase ouverte par espace : démarrer le pre ferme le post, et inversement ; même règle par PDV.
  Fait au lot 2 (démarrages manuels) ; les démarrages automatiques du lot 3 passent par le même
  `startPhase`, donc la même règle.
- Arrêt automatique du post à la première livraison (`StockMovementReason.DELIVERY`) sur l'espace, après
  la fin réelle du match, puis ouverture du pre de l'event suivant (D3, D16).
- Arrêt automatique du pre à la première vente rattachée au match ou à l'ouverture des portes (D4, D17).
- Les arrêts automatiques referment aussi les PDV rouverts à la main (D8).
- Snapshot de la phase figé à chaque arrêt (D15).
- Collision de PIN à la préparation : le hash est unique sur toute la base, relancer la génération.

**Acceptation** : saisir une livraison en Logistique après le match ferme le post-event et rend le
pre-event suivant accessible avec son PIN ; une livraison saisie pendant le match ne ferme rien ; la
première vente du match ferme le pre-event, une vente d'un event de saison non ; le snapshot de chaque
phase existe dès son arrêt.

**Fait (2026-10-06)** : `guest-pin-access/inventory-cycle.cron.ts` (désactivable par
`INVENTORY_CYCLE_CRON_ENABLED=false`).
- Toutes les 10 min : fenêtres pre ET post **préparées** (arrêtées, avec PIN) pour chaque event non
  terminé. Le bandeau affiche donc le PIN avant tout démarrage (D9 : connexion refusée tant que la phase
  n'est pas démarrée).
- Chaque minute :
  - **portes de N ouvertes** : post-event de N démarré (ce qui arrête le pre-event). Sans heure
    d'ouverture des portes, pas de démarrage automatique, comme le flux « portes ouvertes » existant ;
  - **livraison (`DELIVERY`) créée après la fin réelle de N** : pre-event du prochain event démarré,
    post-event de N arrêté (PDV rouverts un par un compris) ;
  - **vente rattachée à N** (`SpacesService.getLiveStatus` : vente des 30 dernières minutes dans la
    fenêtre de N) : pre-event de N arrêté. Requête lancée seulement le jour de N.
- Chaque déclenchement ne joue qu'**une fois** (marqueur `KvStore`) : une reprise manuelle après coup
  n'est jamais annulée par le cron.
- **Limite connue** : une vente de test passée en caisse le jour du match, avant les portes, arrête le
  pre-event comme une vraie vente (rien ne les distingue dans les transactions). On peut le relancer avec ▶.
- D15 (snapshot figé à l'arrêt de chaque phase) : fait au lot 4a.

### Lot 4 : Logistique et réconciliation à chaque article

Découpé en 4a puis 4b (D23).

**4a fait (2026-10-06)** :
- `PreEventInventoryFlowService.saveCount` (point d'entrée staff ET invité PIN) pose un marqueur
  `inventory-logistic-dirty:{phase}:{espace}:{event}` à chaque article marqué compté ;
  `InventoryLogisticSyncCronService` l'envoie chaque minute (push incrémental existant,
  `pushPendingCountToLogistic`). Désactivable par `INVENTORY_LOGISTIC_SYNC_CRON_ENABLED=false`.
- Après l'ouverture des portes, la feuille pre-event recale aussi la Logistique (PDV complet, 30 min
  d'édition) : la règle du 2026-09-29 est abandonnée (D1).
- Fin de phase (Arrêt, démarrage de l'autre phase, livraison, vente) : derniers comptages envoyés et
  snapshot figé (D15) ; pre : feuille régénérée ; post : snapshot `post-event`.
- Écran Logistique : les recalages issus des comptages d'un match et d'une phase forment une ligne ;
  l'ouvrir ou l'exporter donne la dernière valeur de chaque article (lecture seule, rien n'est supprimé).
- Boutons « Mettre à jour la Logistique » et « Ouverture des portes » retirés (desktop et mobile).
  Routes serveur `push-to-logistic` et `pre-event-doors-open` conservées, plus appelées par l'écran.

**4b fait (2026-10-06)**, choix Ulrich : lignes pour les seuls articles marqués comptés.
- `PostEventDraftService` (+ `post-event-reconciliation.builder.ts`, calcul pur) tient la réconciliation
  post-event : reconstruite à chaque envoi de la minute (staff ET invité PIN), à l'arrêt du post-event
  et à la réception du contexte de l'écran. Même formule et même forme de ligne que l'écran.
- Sources serveur : comptage (articles marqués comptés), avant-match (snapshot), mouvements du match,
  ventes éclatées par ingrédient. **D19** : ventes de chaque PDV arrêtées à son dernier « Marquer compté »
  (`deriveEventConsumption(…, { untilByElement })`, EXPLAIN vérifié : même plan, index `basket_cover`).
- Les recalages d'inventaire (`INVENTORY_RESET`) sont exclus du terme « mouvements » : avec les envois de
  la minute, ils auraient fait du manquant un mouvement.
- Plus de repli « stock Logistique » comme point de départ : la Logistique porte le comptage post-event
  pendant le match (D1). PDV sans avant-match : restant et manquant à « — ».
- Prédit, coût et unité : calculés par l'écran staff (seul à éclater menus et scénario) et envoyés comme
  **contexte** (`POST /inventory/:spaceId/post-event-context`) à l'ouverture et quand un PDV devient
  complet ; le serveur les reprend ligne à ligne. Coût serveur en repli : prix marché (ingrédient),
  coût unitaire (composant).
- Pre-event : feuille régénérée à la minute (sans snapshot, figé à l'arrêt) ; le prédit passe par la
  régénération « PDV complet » (`regenerate` reçoit `predictedUnits`), seul chemin depuis le retrait du
  bouton.
- Bouton « Générer la réconciliation » retiré (pre et post, desktop et mobile) ; le brouillon est le
  document de référence (D2). Routes serveur `reconciliations`, `reconciliations/draft` et
  `pre-event-reconciliations` conservées, plus appelées par l'écran.

- « Marquer compté » met à jour la Logistique (staff et PIN), pre et post (D1).
- Réconciliation brouillon mise à jour à chaque article, pre et post, calculée côté serveur, ventes bornées
  à l'heure du comptage de chaque ligne (D19).
- Boutons « Mettre à jour la Logistique » et « Générer la réconciliation » supprimés.

**Acceptation** : un manager PIN marque un article compté ; sans qu'aucun utilisateur connecté n'ait la page
ouverte, la carte Logistique affiche la valeur comptée et la réconciliation du match contient la ligne.

---

## 5. Points techniques à concevoir avant le lot 4

### 5.1 Mise à jour Logistique à chaque article

`LogisticsService.reset` fait aujourd'hui trois choses à chaque appel : créer un document de recalage
(`StockReconciliation`, kind null, listé dans l'écran Logistique), **figer les ventes de tous les niveaux
non couverts** de l'espace, et **déplacer le point de départ des ventes** de tout l'espace. Appelé à chaque
clic, il remplirait la liste des réconciliations Logistique et referait ce travail global des centaines de
fois par match.

Deux options :
- **A, regroupement** : chaque clic marque la ligne « à pousser » ; un envoi groupé part après quelques
  secondes sans nouveau clic (le push incrémental `pushCountToLogistic` existe déjà). Simple, réutilise
  l'existant, mais la Logistique a quelques secondes de retard.
- **B, point de départ des ventes par ligne de stock** : la mise à jour d'un article ne touche que sa ligne.
  Exact et instantané, mais change le modèle de calcul du stock attendu (`getStock`).

Recommandation : **A** pour ce chantier, B seulement si le retard gêne sur le terrain.

**Résolu (lot 4a)** : option A, envoi regroupé à la minute (D22).

⚠️ Le post s'ouvre dès les portes : un PDV compté pendant le match continue de vendre. Avec A, le recalage
doit être horodaté à l'heure du comptage de la ligne (et non à l'heure de l'envoi groupé), sinon les ventes
intervenues entre les deux sont perdues. Si cela s'avère trop fragile, B devient nécessaire (D19).
Le recalage part à l'heure de l'envoi, jusqu'à une minute après le comptage : corrigé en retirant les
ventes faites depuis le comptage (§9, point 4c).

### 5.2 Réconciliation post calculée côté serveur

Aujourd'hui, le brouillon post est construit dans le navigateur (`buildReconciliationLines`, 4 sources :
comptages, référence avant-match, ventes, prédit), puis envoyé au serveur. Un manager PIN ne peut pas le
déclencher. Il faut porter ce calcul côté serveur, à l'image de la feuille pre-event
(`PreEventInventoryFlowService.regenerate`).

Contrainte connue (chantier 381) : **le serveur ne connaît pas la liste complète des articles à compter
par PDV**, c'est le navigateur qui la calcule. Le statut *Terminé* et la réconciliation serveur doivent
en tenir compte : soit le serveur apprend à calculer cette liste, soit le navigateur la lui transmet.

**Résolu (lot 4b)** : lignes pour les seuls articles marqués comptés (choix Ulrich), le serveur n'a donc pas
besoin de la liste complète ; prédit, coût et unité envoyés par l'écran comme contexte. Le statut *Terminé*
du bandeau reste calculé par l'écran, qui connaît la liste.

### 5.3 PIN préparés à l'avance

Une fenêtre (`InventoryWindow`) n'existe aujourd'hui qu'ouverte, et une seule par phase et par espace. Le
PIN est effacé à la clôture. Il faut un état intermédiaire (fenêtre préparée, PIN réservé, connexion
refusée) et décider quand le préparer : à la création de l'event, ou par une tâche planifiée.

**Résolu (lots 2 et 3)** : une fenêtre arrêtée avec PIN est l'état « préparé » (le PIN est conservé à la
clôture), créée par une tâche planifiée toutes les 10 minutes.

---

## 6. Traçabilité : chaque demande du PDF et son lot

| Page | Demande | Lot | Décisions |
|---|---|---|---|
| 1, 2 | Une phase à la fois, Post(N) jusqu'au démarrage de Pre(N+1) | 3 | D9 |
| 1, 2 | Un PIN par event et par phase, préparé à l'avance | 3 | D9 |
| 2 | Logistique et réconciliation à chaque article marqué compté | 4 | D1, D2, D19 |
| 2 | Activation du PIN pre : le post n'est plus accessible | 3 | D8 |
| 2 | Livraison détectée : post fermé, pre du prochain event ouvert | 3 | D3, D16 |
| 3, 4 | Ligne « PIN : xxxxxx (statut) », 3 statuts | 2 | D5 |
| 3 | Sélecteur dernier / prochain, défaut = dernier dont les portes sont passées | 2 | D6, D21 |
| 4 | Pre : défaut = prochain event à venir, pas de sélecteur | 2 | D21 |
| 3, 4 | Arrêt : manuel + automatique (livraison, démarrage de l'autre phase, vente) | 2 (manuel), 3 (auto) | D7, D8, D17 |
| 3, 4 | Démarrage / Reprise sans limite de temps, arrête l'autre phase | 2, 3 | D8 |
| 3, 4 | Accès coupé en masse, réouverture PDV par PDV | 2 | D10 |
| 3 | Bouton Pause : ne pas implémenter | aucun | |
| 5, 6 | Retirer « à compter », pastille rouge / orange / verte | 1 | |
| 5, 6 | Bouton ▶ / ■ par PDV | 2 | D10, D11, D12 |
| 5, 6 | Démarrer un PDV dans une phase coupe l'autre phase sur ce PDV | 3 | |
| 7, 8 | Filtres de gauche non fonctionnels | 1 | à reproduire |
| 7, 8 | « Comptés » / « À compter » dans un burger + « En cours de comptage » | 1 | D20 |
| 7, 8 | Suppression des tris, ordre alphabétique | 1 | |
| 7, 8 | Suppression de la section PIN, PIN dans le bandeau | 2 | D13 |
| 7, 8 | Suppression de « Mettre à jour la Logistique » et « Générer la réconciliation » | 4 | D15 |
| 7, 8 | « Marquer compté » : Logistique + réconciliation brouillon | 4 | D1, D2 |

Chaque ligne des 8 pages a un lot, et toutes sont faites. D18 est tranché (bouton retiré) et la cause du
bug des filtres a été trouvée au lot 1.

## 7. Module 10 à réécrire au moment du code

`docs/modules/10_POST_EVENT_INVENTORY.md` : §2 et §12.4 (sélecteur d'event sur desktop), §3, §7.1 et §8.4
(plus de bouton « Générer la réconciliation »), §8.3 (recalage Logistique à chaque article), §8.5.3
(attendus figés au chargement, aggravé par les envois des autres utilisateurs).

---

## 8. Fichiers concernés (repères)

Front, créés : `InventoryCountingStatusMenu.vue`, `InventoryStatusDot.vue`, `InventoryPinBand.vue`,
`PdvAccessToggle.vue` (dans `components/space-workspace/inventory/`), `composables/useInventoryPinAccess.js`,
`utils/inventoryCountingStatus.js`, `utils/guestPinAccessState.js`.
Front, modifiés : `views/SpaceInventoryView.vue`, `InventoryShopCard.vue`, `InventoryStorageCard.vue`,
`GuestPinBadge.vue`, `drawers/InventoryFilterDrawer.vue`, `store/modules/guestPinAdmin.js`,
`api/endpoints/guestPinAdmin.api.js`, `api/endpoints/inventory.api.js`, `utils/inventoryCardSort.js`,
`utils/inventoryEventContext.js`, `utils/postEventReconciliation.js`, `i18n/translations.js`.
Front, supprimés : `GuestPinAccessPanel.vue`, `PdvLogisticUpdateButton.vue`,
`guest-pin-manage/dialogs/SetWindowPinDialog.vue`.

Back, créés : `inventory/inventory-window-closure.ts`, `inventory/inventory-logistic-sync.cron.ts`,
`inventory/post-event-draft.service.ts`, `inventory/post-event-reconciliation.builder.ts`,
`inventory/dto/post-event-context.dto.ts`, `guest-pin-access/inventory-cycle.cron.ts`, migration
`20261006120000_guest_pin_closed_windows_revoked`.
Back, modifiés : `guest-pin-access/guest-pin-access.service.ts` (+ contrôleur, DTO, module),
`core/auth/strategies/jwt-guest-pin.strategy.ts`, `inventory/pre-event-inventory-flow.service.ts`,
`inventory/inventory.service.ts` (+ contrôleur, module), `logistics/logistics.service.ts`.

---

## 9. Ce qui reste (2026-10-06)

1. **Tests en local** des lots 3 et 4 (Ulrich).
2. **Module 10 à réécrire** (§7 ci-dessus).
3. **Nettoyage optionnel** des routes serveur plus appelées par l'écran : `POST inventory-windows`,
   `:windowId/pin`, `pins/:id/revoke|reactivate`, `:windowId/close`, `push-to-logistic`,
   `pre-event-doors-open`, `reconciliations`, `reconciliations/draft`, `pre-event-reconciliations`.
4. **Limites connues, corrigées le 2026-10-06** (options choisies par Claude à la demande d'Ulrich) :
   - a. bandeau non rafraîchi : `InventoryPinBand` relit l'état des accès toutes les 30 s, onglet visible ;
   - b. vente de test qui arrêtait le pre-event : il faut désormais **au moins 3 ventes validées en
     15 minutes** dans la fenêtre du match (`SpacesService.countValidSalesSince`, EXPLAIN vérifié :
     index `basket_cover`, moins de 10 ms). Seuil proposé par Claude, à confirmer avec Bertrand ;
   - c. ventes effacées entre comptage et envoi : l'envoi part avec « compté − vendu depuis le
     comptage » (`inventory/sales-since-count.ts`, ventes bornées par PDV via
     `deriveEventConsumption(…, { sinceByElement })`). Heures de comptage regroupées par tranches de
     10 s (une requête par tranche, 6 au plus) : écart résiduel d'au plus 10 s de ventes. Le document de
     recalage archive `salesSinceCount` dans son meta.
5. **Déploiement** (feu vert explicite d'Ulrich) : migration de données, première préparation des PIN
   pour tous les events à venir, tâches désactivables par `INVENTORY_CYCLE_CRON_ENABLED` et
   `INVENTORY_LOGISTIC_SYNC_CRON_ENABLED`.
