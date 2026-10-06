# Plan : cycle Pre / Post event Inventory v2 (document Bertrand du 2026-10-06)

Statut : **lot 1 codé (non commité, à tester), lots 2 à 4 à faire.** Branche
`feat/inventory-cycle-pre-post-v2`, créée depuis `develop` le 2026-10-06.

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
| D13 | « Le manager voit les quantités attendues » | Réglage déplacé dans le bandeau, à côté du PIN. | Il vivait dans la section PIN supprimée |
| D14 | Filtres « Ouvert » / « Fermé » | Conservés. | Document muet |
| D15 | Snapshots de phase (`InventorySnapshot.kind`) | Figés **à l'arrêt de la phase** (automatique ou manuel), plus au clic sur « Générer la réconciliation » qui disparaît. Ils restent la référence du « Qty left » post, de la limite BUG-237 et du repli du match suivant. | Conséquence de la suppression du bouton (pages 7, 8) |
| D16 | Livraison pendant le match | Une livraison ne déclenche l'arrêt du post qu'**après la fin réelle du match N**. Un réassort saisi en `DELIVERY` pendant le match ne coupe rien. | Conséquence absurde sinon (post ouvert dès les portes) |
| D17 | Vente qui arrête le pre | Seule une vente **rattachée à l'event N** (ou dans sa fenêtre du jour) compte. Ventes hors match (event de saison Weezevent, privatisation) et tests de caisse ignorés. | Même raisonnement que D16 |
| D18 | Bouton « Ouverture des portes » | **À valider par Ulrich.** Recommandation : le retirer, l'Arrêt du pre et le démarrage automatique du post le remplacent. | Redondant avec la page 4 |
| D19 | Ventes prises en compte dans la réconciliation post | Bornées à l'**heure du comptage de chaque ligne** : un PDV compté à 21h et qui vend encore ne doit pas afficher un faux manquant. | Conséquence du post ouvert dès les portes (pages 1, 2) |
| D20 | Droits | Inchangés : PIN, Arrêt / Reprise et ▶ / ■ réservés à `front.fb.guestPinManage`. Les invités PIN ne voient pas le menu burger des statuts. Imprimer est conservé dans le bandeau. | Document muet |
| D21 | Liste d'events | Le sélecteur « dernier / prochain » devient visible sur desktop (post) et remplace la liste du tiroir mobile, « Indépendant d'un évènement » compris. Le pre n'a pas de sélecteur. | Pages 3, 4 |

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

- Bandeau : PIN, statut global, boutons Arrêt et Reprise, réglage « attendus visibles » (D13).
- Post : sélecteur dernier / prochain event, desktop et tiroir mobile (D6, D21).
- Sous-titre « Nom · date » ; Imprimer conservé ; bouton « Ouverture des portes » selon D18.
- Section « Accès PIN PDV » supprimée (`GuestPinAccessPanel.vue`), libellé erroné « clôture via Mettre à
  jour la Logistique » disparu avec elle.
- Bouton ▶ / ■ sur chaque ligne (révoquer / réactiver l'accès), à la place de `PdvLogisticUpdateButton`.
- Arrêt : coupe l'accès sans pousser vers la Logistique (D7).
- Droits inchangés (D20).

**Acceptation** : le PIN et le statut sont visibles dans le bandeau ; Arrêt coupe tous les accès PIN ; un
PDV rouvert avec ▶ est de nouveau accessible par son QR code.

### Lot 3 : cycle des phases

- PIN préparés à l'avance pour les events à venir (état « préparé », connexion refusée tant que la phase
  n'est pas active, D9).
- Une seule phase ouverte par espace : démarrer le pre ferme le post, et inversement ; même règle par PDV.
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

### Lot 4 : Logistique et réconciliation à chaque article

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

⚠️ Le post s'ouvre dès les portes : un PDV compté pendant le match continue de vendre. Avec A, le recalage
doit être horodaté à l'heure du comptage de la ligne (et non à l'heure de l'envoi groupé), sinon les ventes
intervenues entre les deux sont perdues. Si cela s'avère trop fragile, B devient nécessaire (D19).

### 5.2 Réconciliation post calculée côté serveur

Aujourd'hui, le brouillon post est construit dans le navigateur (`buildReconciliationLines`, 4 sources :
comptages, référence avant-match, ventes, prédit), puis envoyé au serveur. Un manager PIN ne peut pas le
déclencher. Il faut porter ce calcul côté serveur, à l'image de la feuille pre-event
(`PreEventInventoryFlowService.regenerate`).

Contrainte connue (chantier 381) : **le serveur ne connaît pas la liste complète des articles à compter
par PDV**, c'est le navigateur qui la calcule. Le statut *Terminé* et la réconciliation serveur doivent
en tenir compte : soit le serveur apprend à calculer cette liste, soit le navigateur la lui transmet.

### 5.3 PIN préparés à l'avance

Une fenêtre (`InventoryWindow`) n'existe aujourd'hui qu'ouverte, et une seule par phase et par espace. Le
PIN est effacé à la clôture. Il faut un état intermédiaire (fenêtre préparée, PIN réservé, connexion
refusée) et décider quand le préparer : à la création de l'event, ou par une tâche planifiée.

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

Chaque ligne des 8 pages a un lot. Restent ouverts : D18 (bouton « Ouverture des portes ») et la cause du
bug des filtres, à établir en le reproduisant.

## 7. Module 10 à réécrire au moment du code

`docs/modules/10_POST_EVENT_INVENTORY.md` : §2 et §12.4 (sélecteur d'event sur desktop), §3, §7.1 et §8.4
(plus de bouton « Générer la réconciliation »), §8.3 (recalage Logistique à chaque article), §8.5.3
(attendus figés au chargement, aggravé par les envois des autres utilisateurs).

---

## 8. Fichiers concernés (repères)

Front :
- `src/components/space-workspace/inventory/views/SpaceInventoryView.vue` (statuts, tris, onglets, filtres,
  bandeau, choix d'event, `markCounted`, brouillon post)
- `src/components/space-workspace/inventory/InventoryShopCard.vue`, `InventoryStorageCard.vue`
- `src/components/space-workspace/inventory/GuestPinAccessPanel.vue`, `GuestPinBadge.vue`,
  `PdvLogisticUpdateButton.vue`
- `src/composables/usePostEventDraftScheduler.js`

Back :
- `src/features/guest-pin-access/` (fenêtres, PIN, période, cron de clôture)
- `src/features/inventory/inventory.service.ts`, `pre-event-inventory-flow.service.ts`,
  `inventory-live-init.cron.ts`
- `src/features/logistics/logistics.service.ts` (`reset`, `createMovement` pour la détection de livraison)
- `src/features/spaces/spaces.service.ts` (`getLiveStatus`, détection de vente ; déplacé dans `services/space-shops.service.ts` sur `chore/backend-remediation`)
